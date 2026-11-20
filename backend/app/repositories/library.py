from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Collection, CollectionDocument, Document, DocumentChunk, DocumentKind, ProjectDocument

FILTER_KINDS: dict[str, set[DocumentKind]] = {
    "pdf": {DocumentKind.pdf},
    "documents": {DocumentKind.docx, DocumentKind.txt, DocumentKind.markdown, DocumentKind.note},
    "papers": {DocumentKind.paper},
    "websites": {DocumentKind.website},
}


class LibraryRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def query(
        self,
        *,
        owner_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        collection_id: uuid.UUID | None = None,
        kind_filter: str = "all",
        q: str | None = None,
    ) -> Sequence[Document]:
        """Caller must have authorised `owner_id` / `project_id` scope."""
        stmt = select(Document).order_by(Document.created_at.desc())
        if owner_id is not None:
            stmt = stmt.where(Document.user_id == owner_id)
        if project_id is not None:
            stmt = stmt.where(Document.id.in_(select(ProjectDocument.document_id).where(ProjectDocument.project_id == project_id)))
        if collection_id is not None:
            stmt = stmt.where(Document.id.in_(select(CollectionDocument.document_id).where(CollectionDocument.collection_id == collection_id)))
        if kind_filter in FILTER_KINDS:
            stmt = stmt.where(Document.kind.in_(FILTER_KINDS[kind_filter]))
        if q:
            like = f"%{q.replace('%', '').replace('_', '')[:100]}%"
            stmt = stmt.where(or_(Document.title.ilike(like), Document.filename.ilike(like), Document.summary.ilike(like)))
        return (await self.db.scalars(stmt.limit(500))).all()

    async def find_by_hash(self, user_id: uuid.UUID, content_hash: str) -> Document | None:
        return await self.db.scalar(select(Document).where(Document.user_id == user_id, Document.content_hash == content_hash))

    async def add(self, doc: Document) -> Document:
        self.db.add(doc)
        await self.db.flush()
        return doc

    async def replace_chunks(self, document_id: uuid.UUID, rows: list[DocumentChunk]) -> None:
        await self.db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        self.db.add_all(rows)
        await self.db.flush()

    async def collections(self, user_id: uuid.UUID) -> Sequence[Collection]:
        return (await self.db.scalars(select(Collection).where(Collection.user_id == user_id).order_by(Collection.created_at))).all()
