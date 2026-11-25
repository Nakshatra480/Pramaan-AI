"""Document pipeline: extract → normalise → chunk → embed → store → ready (PRD §20, §38).

Runs as a background job with its own DB session; each stage is committed so
the UI can show real progress. Failures store a safe, user-facing message.
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import log
from app.db.database import get_sessionmaker
from app.db.models import ActivityKind, Document, DocumentChunk, DocumentKind, DocumentStatus, ProjectDocument
from app.repositories.library import LibraryRepository
from app.repositories.projects import ActivityRepository
from app.services.content.fetch import fetch_page
from app.services.documents.chunking import chunk_document
from app.services.documents.extract import ExtractedDocument, ExtractedPage, ExtractionError, extract, normalize
from app.services.embeddings import EmbeddingService
from app.services.llm.base import AVAILABILITY_ERRORS, ProviderError
from app.services.storage.base import ObjectNotFound, StorageError, StorageService, get_storage, legacy_text_key, text_key

logger = logging.getLogger("pramaan.documents")

STAGE_PROGRESS = {
    DocumentStatus.uploading: 0.05,
    DocumentStatus.extracting: 0.2,
    DocumentStatus.chunking: 0.4,
    DocumentStatus.embedding: 0.6,
    DocumentStatus.indexing: 0.85,
    DocumentStatus.ready: 1.0,
}


def stored_text_key(doc: Document) -> str:
    """Where this document's extracted text lives (recorded in Neon; legacy local layout as fallback)."""
    return str(doc.meta.get("text_key") or legacy_text_key(doc.id))


class _LeaseLost(Exception):
    pass


class DocumentProcessor:
    def __init__(self, storage: StorageService | None = None, embeddings: EmbeddingService | None = None) -> None:
        self.storage = storage or get_storage()
        self.owner: str | None = None
        self.embeddings = embeddings or EmbeddingService()

    async def _stage(self, db: AsyncSession, doc: Document, status: DocumentStatus) -> None:
        if self.owner is not None:
            await db.refresh(doc, attribute_names=["lease_owner"])
            if doc.lease_owner != self.owner:
                raise _LeaseLost
            # Stage transitions double as lease heartbeats.
            doc.lease_expires_at = datetime.now(UTC) + timedelta(seconds=get_settings().job_lease_s)
            doc.heartbeat_at = datetime.now(UTC)
        doc.status = status
        await db.commit()

    async def process(self, document_id: uuid.UUID, owner: str | None = None) -> None:
        """Index one claimed document. `owner` is the job lease holder (see app/services/jobs.py)."""
        self.owner = owner
        start = time.perf_counter()
        async with get_sessionmaker()() as db:
            doc = await db.get(Document, document_id)
            if doc is None or doc.status == DocumentStatus.ready:
                return
            if owner is not None and doc.lease_owner != owner:
                return
            if doc.status != DocumentStatus.uploading:
                return  # already being processed / failed — only queued documents are indexed
            try:
                # Embeddings are optional for indexing: without them the document is still chunked and
                # searchable by keyword, and Retry adds semantic search later (audit C-02).
                semantic = True
                try:
                    await self.embeddings.provider.preflight()
                except ProviderError as e:
                    semantic = False
                    log(logger, logging.WARNING, "document_semantic_index_skipped", document_id=str(document_id), code=e.code)
                await self._stage(db, doc, DocumentStatus.extracting)
                extracted = await self._extract(doc)
                full_text = "\n\n".join(p.text for p in extracted.pages)
                tkey = text_key(doc.user_id, doc.id)
                await self.storage.put(tkey, full_text.encode(), "text/plain; charset=utf-8", overwrite=True)  # re-indexing replaces it
                doc.meta = {**(doc.meta or {}), "text_key": tkey}
                if extracted.title and doc.kind not in (DocumentKind.website,) and len(extracted.title) > 3:
                    doc.title = extracted.title[:300]
                doc.author = doc.author or (extracted.author[:300] if extracted.author else None)
                doc.page_count = len(extracted.pages) if doc.kind == DocumentKind.pdf else None
                doc.summary = _summary(full_text)

                await self._stage(db, doc, DocumentStatus.chunking)
                chunks = chunk_document(extracted)
                if not chunks:
                    raise ExtractionError("No readable text was found in this document.")

                await self._stage(db, doc, DocumentStatus.embedding)
                vectors: list[list[float] | None] = [None] * len(chunks)
                if semantic:
                    try:
                        vectors = list(await self.embeddings.embed_documents([c.content for c in chunks]))
                    except ProviderError as e:
                        semantic = False
                        log(logger, logging.WARNING, "document_semantic_index_skipped", document_id=str(document_id), code=e.code)
                doc.meta = {**(doc.meta or {}), "semantic_index": "complete" if semantic else "pending"}

                await self._stage(db, doc, DocumentStatus.indexing)
                await LibraryRepository(db).replace_chunks(
                    doc.id,
                    [
                        DocumentChunk(
                            document_id=doc.id,
                            user_id=doc.user_id,
                            chunk_index=c.index,
                            content=c.content,
                            meta={"page": c.page} if c.page else {},
                            embedding=v,
                        )
                        for c, v in zip(chunks, vectors, strict=True)
                    ],
                )
                doc.chunk_count = len(chunks)
                doc.status = DocumentStatus.ready
                doc.error, doc.error_code = None, None
                doc.lease_owner, doc.lease_expires_at = None, None
                project_id = await db.scalar(select(ProjectDocument.project_id).where(ProjectDocument.document_id == doc.id).limit(1))
                await ActivityRepository(db).add(
                    doc.user_id,
                    ActivityKind.document_added,
                    f"Added “{doc.filename}”",
                    project_id=project_id,
                    detail=f"Indexed · {len(chunks)} chunks" + ("" if semantic else " · keyword search only for now"),
                    href=f"/library/{doc.id}",
                )
                await db.commit()
                log(
                    logger,
                    logging.INFO,
                    "document_indexed",
                    document_id=str(doc.id),
                    chunks=len(chunks),
                    duration_ms=round((time.perf_counter() - start) * 1000),
                )
            except _LeaseLost:
                log(logger, logging.WARNING, "document_lease_lost", document_id=str(document_id))
                return
            except (ExtractionError, ProviderError, StorageError, AppError, ValueError) as e:
                await db.rollback()
                doc = await db.get(Document, document_id)
                if doc:
                    doc.status = DocumentStatus.failed
                    doc.lease_owner, doc.lease_expires_at = None, None
                    if isinstance(e, ExtractionError):
                        doc.error, doc.error_code = str(e), "EXTRACTION_FAILED"
                    elif isinstance(e, ObjectNotFound):
                        doc.error, doc.error_code = "The original file is missing from storage. Upload it again.", "ORIGINAL_MISSING"
                    elif isinstance(e, AppError):
                        # e.g. a website that can't be fetched or isn't allowed (audit H-04): a clear, final failure.
                        doc.error, doc.error_code = e.message, e.code
                    elif isinstance(e, AVAILABILITY_ERRORS):
                        doc.error_code = e.code
                        doc.error = "Pramaan's research engine is offline, so this document couldn't be indexed yet. Retry when it's back."
                    else:
                        doc.error, doc.error_code = "Pramaan couldn't index this document. Please retry.", "INDEXING_FAILED"
                    await db.commit()
                log(logger, logging.WARNING, "document_failed", document_id=str(document_id), error_type=type(e).__name__)

    async def _extract(self, doc: Document) -> ExtractedDocument:
        if doc.kind == DocumentKind.website:
            title, text = await fetch_page(str(doc.meta.get("url", "")))
            if title:
                doc.title = title
            if len(text) < 200:
                raise ExtractionError("That page doesn't contain enough readable text.")
            return ExtractedDocument([ExtractedPage(normalize(text))], title=title or None)
        if not doc.storage_key:
            raise ExtractionError("The original file is missing.")
        return extract(doc.kind, await self.storage.get(doc.storage_key))


def _summary(text: str, limit: int = 280) -> str:
    first = " ".join(text.split())[:limit]
    return first.rsplit(" ", 1)[0] + "…" if len(text) > limit else first


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
