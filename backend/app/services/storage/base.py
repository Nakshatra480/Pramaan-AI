"""Object storage abstraction. Binary files never go into PostgreSQL.

Neon is the source of truth for ownership and the object key; storage is only
ever addressed with keys built here from server-side ids — never from client
input or original filenames.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from typing import Protocol

from app.core.config import get_settings


class StorageError(Exception):
    """Storage backend failure (message is safe to log; never includes credentials)."""


class ObjectNotFound(StorageError):
    pass


class ObjectExists(StorageError):
    pass


@dataclass(frozen=True)
class ObjectMeta:
    key: str
    size: int
    content_type: str | None
    updated: datetime | None


class StorageService(Protocol):
    backend: str

    async def put(self, key: str, data: bytes, content_type: str, *, overwrite: bool = False) -> None:
        """Store bytes. Refuses to replace an existing object unless `overwrite` (collision safety)."""
        ...

    async def get(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> bool:
        """Delete; returns False if the object didn't exist (idempotent)."""
        ...

    async def exists(self, key: str) -> bool: ...

    async def metadata(self, key: str) -> ObjectMeta: ...

    async def list_keys(self, prefix: str) -> list[str]:
        """Keys under a prefix (operations/reconciliation only — never exposed via the API)."""
        ...


# ------------------------------------------------------------------ object keys


def original_key(user_id: uuid.UUID, document_id: uuid.UUID) -> str:
    """users/{user_id}/documents/{document_id}/original — ids only, no filenames or emails."""
    return f"users/{user_id}/documents/{document_id}/original"


def text_key(user_id: uuid.UUID, document_id: uuid.UUID) -> str:
    return f"users/{user_id}/documents/{document_id}/extracted.txt"


def legacy_text_key(document_id: uuid.UUID) -> str:
    """Legacy local layout (text/{document_id}.txt) — read-only fallback for existing dev data."""
    return f"text/{document_id}.txt"


@lru_cache
def get_storage() -> StorageService:
    s = get_settings()
    if s.storage_backend == "s3":
        from app.services.storage.s3 import S3Storage

        return S3Storage(
            s.s3_endpoint,
            s.s3_bucket,
            s.s3_access_key_id.get_secret_value(),
            s.s3_secret_access_key.get_secret_value(),
            region=s.s3_region,
        )
    from app.services.storage.local import LocalStorage

    return LocalStorage(s.local_storage_dir)
