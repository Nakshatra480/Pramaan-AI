"""Object storage: backends, keys, upload/download/delete flows, failure handling, isolation."""

from __future__ import annotations

import logging
import uuid

import pytest
from httpx import AsyncClient

from app.services.jobs import get_job_runner
from app.services.storage.base import ObjectExists, ObjectNotFound, StorageError, get_storage, original_key, text_key
from app.services.storage.local import LocalStorage
from tests.conftest import ALICE, BOB

TEXT = b"Sleep supports memory consolidation.\n\nSlow-wave sleep transfers declarative memories to the neocortex during the night."


# ------------------------------------------------------------------ local backend


async def test_local_storage_roundtrip(tmp_path) -> None:  # type: ignore[no-untyped-def]
    s = LocalStorage(str(tmp_path))
    key = "users/u/documents/d/original"
    await s.put(key, b"abc", "text/plain")
    assert await s.exists(key) and await s.get(key) == b"abc"
    assert (await s.metadata(key)).size == 3
    with pytest.raises(ObjectExists):
        await s.put(key, b"other", "text/plain")  # never clobbers
    await s.put(key, b"new", "text/plain", overwrite=True)
    assert await s.get(key) == b"new"
    assert await s.delete(key) is True and await s.delete(key) is False
    with pytest.raises(ObjectNotFound):
        await s.get(key)


@pytest.mark.parametrize("bad", ["../etc/passwd", "/abs/path", "users/../../x", "a b", ""])
async def test_local_storage_rejects_unsafe_keys(tmp_path, bad: str) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError):
        await LocalStorage(str(tmp_path)).get(bad)


def test_production_refuses_local_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    env = {
        "ENVIRONMENT": "production",
        "FIREBASE_PROJECT_ID": "p",
        "DATABASE_URL": "postgresql://u:p@ep-x.neon.tech/db?sslmode=require",
        "STORAGE_BACKEND": "local",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="durable object storage"):
            get_settings()
    finally:
        get_settings.cache_clear()


def test_object_keys_are_id_based_and_distinct() -> None:
    u, d1, d2 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    assert original_key(u, d1) == f"users/{u}/documents/{d1}/original"
    assert original_key(u, d1) != original_key(u, d2) and original_key(u, d1) != text_key(u, d1)


# ------------------------------------------------------------------ API flows


async def _upload(client: AsyncClient, headers: dict, name: str = "notes.md", data: bytes = TEXT):  # type: ignore[type-arg]
    return await client.post("/api/v1/library/upload", headers=headers, files={"file": (name, data)})


async def test_upload_stores_original_and_text_under_owner_keys(client: AsyncClient) -> None:
    from sqlalchemy import select

    from app.db.database import get_sessionmaker
    from app.db.models import Document

    r = await _upload(client, ALICE, "My Secret Plan.md")
    await get_job_runner().drain()
    async with get_sessionmaker()() as db:
        doc = await db.scalar(select(Document).where(Document.id == uuid.UUID(r.json()["id"])))
        assert doc is not None
        assert doc.storage_key == original_key(doc.user_id, doc.id) and "Secret" not in doc.storage_key
        assert doc.meta["text_key"] == text_key(doc.user_id, doc.id)
    storage = get_storage()
    assert await storage.get(doc.storage_key) == TEXT
    assert await storage.exists(doc.meta["text_key"])


async def test_download_original_with_safe_headers(client: AsyncClient) -> None:
    r = await _upload(client, ALICE, "report<final>;.md")
    await get_job_runner().drain()
    d = await client.get(f"/api/v1/library/{r.json()['id']}/download", headers=ALICE)
    assert d.status_code == 200 and d.content == TEXT
    assert d.headers["content-type"].startswith("text/markdown")
    assert d.headers["cache-control"] == "private, no-store" and d.headers["x-content-type-options"] == "nosniff"
    cd = d.headers["content-disposition"]
    assert cd.startswith('attachment; filename="reportfinal.md"') and "<" not in cd.split("filename*")[0]


async def test_other_users_cannot_download_or_delete(client: AsyncClient) -> None:
    doc = (await _upload(client, ALICE)).json()
    await get_job_runner().drain()
    for method in ("GET", "DELETE"):
        path = f"/api/v1/library/{doc['id']}" + ("/download" if method == "GET" else "")
        r = await client.request(method, path, headers=BOB)
        assert r.status_code == 404
    assert (await client.get(f"/api/v1/library/{doc['id']}/download", headers=ALICE)).status_code == 200


async def test_delete_removes_row_then_objects(client: AsyncClient) -> None:
    from sqlalchemy import select

    from app.db.database import get_sessionmaker
    from app.db.models import Document

    doc_id = uuid.UUID((await _upload(client, ALICE)).json()["id"])
    await get_job_runner().drain()
    async with get_sessionmaker()() as db:
        doc = await db.get(Document, doc_id)
        assert doc is not None
        keys = [doc.storage_key, doc.meta["text_key"]]
    assert (await client.delete(f"/api/v1/library/{doc_id}", headers=ALICE)).status_code == 204
    await get_job_runner().drain()
    storage = get_storage()
    assert [await storage.exists(k) for k in keys] == [False, False]
    async with get_sessionmaker()() as db:
        assert await db.scalar(select(Document).where(Document.id == doc_id)) is None


async def test_failed_storage_upload_creates_no_row(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    storage = get_storage()

    async def boom(*a, **k):  # type: ignore[no-untyped-def]
        raise StorageError("bucket unavailable")

    monkeypatch.setattr(storage, "put", boom)
    r = await _upload(client, ALICE)
    assert r.status_code == 503 and r.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    monkeypatch.undo()
    assert (await client.get("/api/v1/library", headers=ALICE)).json() == []


async def test_failed_commit_after_upload_removes_the_object(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import library

    async def fail(self, doc):  # type: ignore[no-untyped-def]
        raise RuntimeError("database went away")

    storage = get_storage()
    written: list[str] = []
    real_put = storage.put

    async def spy(key: str, *args, **kwargs):  # type: ignore[no-untyped-def]
        written.append(key)
        await real_put(key, *args, **kwargs)

    monkeypatch.setattr(library.LibraryService, "_schedule", fail)
    monkeypatch.setattr(storage, "put", spy)
    r = await _upload(client, ALICE, data=TEXT + b" unique-commit-failure")
    assert r.status_code == 500
    assert len(written) == 1 and not await storage.exists(written[0])  # object removed
    monkeypatch.undo()
    assert (await client.get("/api/v1/library", headers=ALICE)).json() == []  # and no row


async def test_missing_original_marks_document_failed_and_recoverable(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.documents import processor

    real_get = get_storage().get

    async def gone(key: str) -> bytes:
        if key.endswith("/original"):
            raise ObjectNotFound(key)
        return await real_get(key)

    monkeypatch.setattr(get_storage(), "get", gone)
    doc = (await _upload(client, ALICE)).json()
    await get_job_runner().drain()
    d = (await client.get(f"/api/v1/library/{doc['id']}", headers=ALICE)).json()
    assert d["status"] == "failed" and "missing from storage" in d["error"]
    monkeypatch.undo()
    assert processor  # retry succeeds once the object is readable again
    assert (await client.post(f"/api/v1/library/{doc['id']}/retry", headers=ALICE)).status_code == 200
    await get_job_runner().drain()
    assert (await client.get(f"/api/v1/library/{doc['id']}", headers=ALICE)).json()["status"] == "ready"


async def test_undeletable_objects_are_logged_not_silent(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    doc = (await _upload(client, ALICE)).json()
    await get_job_runner().drain()

    async def refuse(key: str) -> bool:
        raise StorageError("permission denied")

    monkeypatch.setattr(get_storage(), "delete", refuse)
    monkeypatch.setattr("asyncio.sleep", _no_sleep)
    with caplog.at_level(logging.ERROR, logger="pramaan.library"):
        assert (await client.delete(f"/api/v1/library/{doc['id']}", headers=ALICE)).status_code == 204
        await get_job_runner().drain()
    assert [r for r in caplog.records if r.getMessage() == "storage_orphan"]
    assert (await client.get(f"/api/v1/library/{doc['id']}", headers=ALICE)).status_code == 404  # row is gone


async def _no_sleep(_: float) -> None:
    return None


async def test_website_documents_have_no_original(client: AsyncClient) -> None:
    from app.db.database import get_sessionmaker
    from app.db.models import Document, DocumentKind, DocumentStatus, User

    await client.get("/api/v1/me", headers=ALICE)
    async with get_sessionmaker()() as db:
        from sqlalchemy import select

        user = await db.scalar(select(User).where(User.firebase_uid == "uid-alice"))
        doc = Document(
            user_id=user.id,
            title="site",
            filename="https://x.example",
            kind=DocumentKind.website,
            mime_type="text/html",
            size_bytes=0,
            content_hash="h" * 64,
            status=DocumentStatus.ready,
        )
        db.add(doc)
        await db.commit()
        doc_id = doc.id
    r = await client.get(f"/api/v1/library/{doc_id}/download", headers=ALICE)
    assert r.status_code == 404 and r.json()["error"]["code"] == "ORIGINAL_FILE_NOT_FOUND"


def test_legacy_local_text_key_fallback() -> None:
    from app.db.models import Document
    from app.services.documents.processor import stored_text_key

    d = Document(id=uuid.uuid4(), user_id=uuid.uuid4(), meta={})
    assert stored_text_key(d) == f"text/{d.id}.txt"  # legacy local layout still readable
    d.meta = {"text_key": text_key(d.user_id, d.id)}
    assert stored_text_key(d) == text_key(d.user_id, d.id)


async def test_list_keys_for_reconciliation(tmp_path) -> None:  # type: ignore[no-untyped-def]
    s = LocalStorage(str(tmp_path))
    await s.put("users/a/documents/1/original", b"x", "text/plain")
    await s.put("other/file", b"y", "text/plain")
    assert await s.list_keys("users/") == ["users/a/documents/1/original"]
