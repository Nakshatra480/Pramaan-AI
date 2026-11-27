from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError, NotFound, ValidationFailed
from app.db.models import Collection, CollectionDocument, Document, DocumentKind, DocumentStatus, ProjectRole, User
from app.repositories.library import LibraryRepository
from app.repositories.projects import ProjectRepository
from app.schemas.library import CollectionOut, ContentSection, DocumentDetailOut, DocumentOut
from app.services.access import require_document, require_project
from app.services.content.fetch import validate_url
from app.services.documents.processor import STAGE_PROGRESS, sha256, stored_text_key
from app.services.documents.validation import detect
from app.services.jobs import JobRunner, get_job_runner
from app.services.storage.base import ObjectNotFound, StorageError, StorageService, get_storage, original_key

logger = logging.getLogger("pramaan.library")


class StorageUnavailable(AppError):
    status_code, code, message = 503, "STORAGE_UNAVAILABLE", "File storage is temporarily unavailable. Please try again."


def to_out(d: Document) -> DocumentOut:
    return DocumentOut(
        id=d.id,
        title=d.title,
        filename=d.filename,
        kind=d.kind,
        size_bytes=d.size_bytes,
        author=d.author,
        source=d.source,
        published_at=d.published_at,
        added_at=d.created_at,
        status=d.status,
        progress=STAGE_PROGRESS.get(d.status),
        pages=d.page_count,
        chunks=d.chunk_count,
        collection_ids=[c.collection_id for c in d.collection_links],
        project_ids=[p.project_id for p in d.project_links],
        summary=d.summary,
        error=d.error,
        warning=KEYWORD_ONLY if d.status == DocumentStatus.ready and (d.meta or {}).get("semantic_index") == "pending" else None,
    )


KEYWORD_ONLY = "Indexed for keyword search only — the semantic search service was unavailable. Retry to add semantic search."


def semantic_pending(d: Document) -> bool:
    return d.status == DocumentStatus.ready and (d.meta or {}).get("semantic_index") == "pending"


class LibraryService:
    def __init__(self, db: AsyncSession, storage: StorageService | None = None, jobs: JobRunner | None = None) -> None:
        self.db = db
        self.repo = LibraryRepository(db)
        self.storage = storage or get_storage()
        self.jobs = jobs or get_job_runner()

    async def list_documents(
        self, user: User, *, project_id: uuid.UUID | None, collection_id: uuid.UUID | None, kind_filter: str, q: str | None
    ) -> list[DocumentOut]:
        if project_id is not None:
            await require_project(self.db, project_id, user)
            docs = await self.repo.query(project_id=project_id, kind_filter=kind_filter, q=q)
        else:
            docs = await self.repo.query(owner_id=user.id, collection_id=collection_id, kind_filter=kind_filter, q=q)
        return [to_out(d) for d in docs]

    async def get(self, user: User, document_id: uuid.UUID) -> DocumentDetailOut:
        doc = await require_document(self.db, document_id, user)
        content: list[ContentSection] = []
        if doc.status == DocumentStatus.ready:
            try:
                text = (await self.storage.get(stored_text_key(doc))).decode()
                paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()][:400]
                content = [ContentSection(paragraphs=paragraphs)]
            except StorageError:
                content = []  # metadata still renders; the reader shows no body
        return DocumentDetailOut(**to_out(doc).model_dump(by_alias=False), content=content)

    async def _schedule(self, doc: Document) -> None:
        """Documents in `uploading` are queued jobs; commit then nudge the worker (see app/services/jobs.py)."""
        await self.db.commit()
        self.jobs.wake()

    async def _attach_if_requested(self, user: User, doc: Document, project_id: uuid.UUID | None) -> None:
        if project_id:
            await require_project(self.db, project_id, user, ProjectRole.editor)
            await ProjectRepository(self.db).attach_document(project_id, doc.id, user.id)

    async def upload(self, user: User, filename: str, data: bytes, project_id: uuid.UUID | None) -> tuple[DocumentOut, bool]:
        """Returns (document, created). Identical content for the same user is deduplicated."""
        if project_id:
            await require_project(self.db, project_id, user, ProjectRole.editor)
        safe_name = filename.replace("\\", "/").rsplit("/", 1)[-1][:200] or "document"
        detected = detect(safe_name, data, get_settings().max_upload_bytes)
        digest = sha256(data)
        existing = await self.repo.find_by_hash(user.id, digest)
        if existing:
            await self._attach_if_requested(user, existing, project_id)
            await self.db.refresh(existing)
            return to_out(existing), False

        doc = Document(
            user_id=user.id,
            title=safe_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip() or safe_name,
            filename=safe_name,
            kind=detected.kind,
            mime_type=detected.mime_type,
            size_bytes=len(data),
            content_hash=digest,
            source="Uploaded",
            status=DocumentStatus.uploading,
        )
        await self.repo.add(doc)
        # Key is built from server-side ids only (never the filename) and put() refuses to overwrite.
        doc.storage_key = original_key(user.id, doc.id)
        try:
            await self.storage.put(doc.storage_key, data, detected.mime_type)
        except StorageError as e:
            raise StorageUnavailable() from e  # transaction rolls back: no row, no object
        try:
            await self.db.flush()
            await self._attach_if_requested(user, doc, project_id)
            await self.db.refresh(doc)
            out = to_out(doc)
            await self._schedule(doc)
        except Exception:
            # The row never committed — remove the object so it isn't orphaned.
            await self._delete_objects([doc.storage_key])
            raise
        return out, True

    async def add_url(self, user: User, url: str, project_id: uuid.UUID | None) -> DocumentOut:
        url = validate_url(url)
        if project_id:
            await require_project(self.db, project_id, user, ProjectRole.editor)
        digest = sha256(url.encode())
        existing = await self.repo.find_by_hash(user.id, digest)
        if existing:
            await self._attach_if_requested(user, existing, project_id)
            await self.db.refresh(existing)
            return to_out(existing)
        host = url.split("/")[2]
        doc = Document(
            user_id=user.id,
            title=host,
            filename=url[:300],
            kind=DocumentKind.website,
            mime_type="text/html",
            size_bytes=0,
            content_hash=digest,
            source=host,
            status=DocumentStatus.uploading,
            meta={"url": url},
        )
        await self.repo.add(doc)
        await self._attach_if_requested(user, doc, project_id)
        await self.db.refresh(doc)
        out = to_out(doc)
        await self._schedule(doc)
        return out

    async def retry(self, user: User, document_id: uuid.UUID) -> DocumentOut:
        doc = await require_document(self.db, document_id, user, write=True)
        # A website can always be read again ("Refresh"): pages change, and older imports kept less of them.
        refresh = doc.kind == DocumentKind.website and doc.status == DocumentStatus.ready
        if doc.status != DocumentStatus.failed and not semantic_pending(doc) and not refresh:
            raise ValidationFailed("Only failed documents, or documents indexed for keyword search only, can be retried.", code="DOCUMENT_NOT_FAILED")
        doc.status, doc.error, doc.error_code = DocumentStatus.uploading, None, None
        doc.attempts = 0
        await self.db.flush()
        out = to_out(doc)
        await self._schedule(doc)
        return out

    async def delete(self, user: User, document_id: uuid.UUID) -> None:
        doc = await require_document(self.db, document_id, user, write=True)
        keys = [k for k in (doc.storage_key, stored_text_key(doc)) if k]
        await self.db.delete(doc)
        # Commit the database delete first: the document disappears for the user immediately and a
        # storage failure can never resurrect it or leave a row pointing at a deleted object.
        await self.db.commit()
        self.jobs.submit(f"storage-delete:{document_id}", lambda: self._delete_objects(keys, retries=3))

    async def _delete_objects(self, keys: list[str], retries: int = 1) -> None:
        for key in keys:
            for attempt in range(retries):
                try:
                    await self.storage.delete(key)
                    break
                except StorageError:
                    if attempt + 1 < retries:
                        await asyncio.sleep(2**attempt)
            else:
                # Never silent: operators reconcile with scripts/reconcile_storage.py.
                logger.error("storage_orphan", extra={"fields": {"object_key": key, "backend": self.storage.backend}})

    async def download(self, user: User, document_id: uuid.UUID) -> tuple[Document, bytes]:
        """Original file bytes after the ownership check. Keys come from Neon, never from the client."""
        doc = await require_document(self.db, document_id, user)
        if not doc.storage_key:
            raise NotFound("Original file")
        try:
            return doc, await self.storage.get(doc.storage_key)
        except ObjectNotFound as e:
            raise NotFound("Original file") from e
        except StorageError as e:
            raise StorageUnavailable() from e

    async def attach(self, user: User, project_id: uuid.UUID, document_id: uuid.UUID) -> None:
        await require_project(self.db, project_id, user, ProjectRole.editor)
        await require_document(self.db, document_id, user, write=True)  # only your own documents
        await ProjectRepository(self.db).attach_document(project_id, document_id, user.id)
        await ProjectRepository(self.db).touch(project_id)

    async def detach(self, user: User, project_id: uuid.UUID, document_id: uuid.UUID) -> None:
        await require_project(self.db, project_id, user, ProjectRole.editor)
        await ProjectRepository(self.db).detach_document(project_id, document_id)

    async def collections(self, user: User) -> list[CollectionOut]:
        return [
            CollectionOut(id=c.id, name=c.name, description=c.description, document_ids=[d.document_id for d in c.document_links])
            for c in await self.repo.collections(user.id)
        ]

    async def create_collection(self, user: User, name: str) -> CollectionOut:
        c = Collection(user_id=user.id, name=name.strip())
        self.db.add(c)
        await self.db.flush()
        return CollectionOut(id=c.id, name=c.name, description=None, document_ids=[])

    async def add_to_collection(self, user: User, collection_id: uuid.UUID, document_id: uuid.UUID) -> None:
        c = await self.db.get(Collection, collection_id)
        if c is None or c.user_id != user.id:
            raise NotFound("Collection")
        await require_document(self.db, document_id, user, write=True)
        if not await self.db.get(CollectionDocument, (collection_id, document_id)):
            self.db.add(CollectionDocument(collection_id=collection_id, document_id=document_id))
