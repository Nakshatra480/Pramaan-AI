from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import Field

from app.db.models import DocumentKind, DocumentStatus
from app.schemas.common import ApiModel


class DocumentOut(ApiModel):
    id: uuid.UUID
    title: str
    filename: str
    kind: DocumentKind
    size_bytes: int
    author: str | None
    source: str | None
    published_at: date | None
    added_at: datetime
    status: DocumentStatus
    progress: float | None = None
    pages: int | None
    chunks: int | None
    collection_ids: list[uuid.UUID]
    project_ids: list[uuid.UUID]
    summary: str
    error: str | None
    # Non-fatal note, e.g. indexed for keyword search only while the embedding service was unavailable.
    warning: str | None = None


class ContentSection(ApiModel):
    heading: str | None = None
    paragraphs: list[str]


class DocumentDetailOut(DocumentOut):
    content: list[ContentSection]


class CollectionOut(ApiModel):
    id: uuid.UUID
    name: str
    description: str | None
    document_ids: list[uuid.UUID]


class CollectionCreate(ApiModel):
    name: str = Field(min_length=1, max_length=120)


class UploadOut(DocumentOut):
    """Upload result. `duplicate` is true when identical content was already in the library (nothing new stored)."""

    duplicate: bool = False
