"""S3-compatible storage (Supabase Storage in production) against moto's S3 server over real HTTP."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest

from app.services.storage.base import ObjectExists, ObjectNotFound, StorageError, original_key
from app.services.storage.s3 import S3Storage

BUCKET = "pramaan-s3-test"


@pytest.fixture(scope="module")
def s3_endpoint() -> Iterator[str]:
    from moto.server import ThreadedMotoServer

    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0)
    server.start()
    host, port = server.get_host_and_port()
    endpoint = f"http://{host}:{port}"
    import boto3

    boto3.client("s3", endpoint_url=endpoint, region_name="us-east-1", aws_access_key_id="k", aws_secret_access_key="s").create_bucket(Bucket=BUCKET)
    yield endpoint
    server.stop()


@pytest.fixture
def s3(s3_endpoint: str) -> S3Storage:
    return S3Storage(s3_endpoint, BUCKET, "test-access-key", "test-secret", region="us-east-1")


async def test_contract_roundtrip_collision_and_metadata(s3: S3Storage) -> None:
    key = original_key(uuid.uuid4(), uuid.uuid4())
    await s3.put(key, b"%PDF-1.7 data", "application/pdf")
    assert await s3.exists(key) and await s3.get(key) == b"%PDF-1.7 data"
    meta = await s3.metadata(key)
    assert meta.size == 13 and meta.content_type == "application/pdf"
    with pytest.raises(ObjectExists):
        await s3.put(key, b"clobber", "application/pdf")
    await s3.put(key, b"replaced", "text/plain", overwrite=True)
    assert await s3.get(key) == b"replaced"
    assert key in await s3.list_keys("users/")


async def test_delete_is_idempotent(s3: S3Storage) -> None:
    key = original_key(uuid.uuid4(), uuid.uuid4())
    await s3.put(key, b"v1", "text/plain")
    assert await s3.delete(key) is True
    assert await s3.delete(key) is False
    assert not await s3.exists(key)
    with pytest.raises(ObjectNotFound):
        await s3.get(key)


async def test_uses_path_style_addressing(s3: S3Storage) -> None:
    """Supabase's S3 endpoint only supports path-style URLs (https://<host>/storage/v1/s3/<bucket>/<key>)."""
    seen: list[str] = []
    client = s3._c()
    client.meta.events.register("before-send.s3.*", lambda request, **_: seen.append(request.url))
    key = original_key(uuid.uuid4(), uuid.uuid4())
    await s3.put(key, b"x", "text/plain")
    assert any(f"/{BUCKET}/{key}" in u for u in seen)
    assert not any(f"//{BUCKET}." in u for u in seen)  # never virtual-hosted style


async def test_unsafe_keys_rejected(s3: S3Storage) -> None:
    for bad in ("../x", "/abs", ""):
        with pytest.raises(ValueError):
            await s3.get(bad)


async def test_errors_do_not_leak_details(s3_endpoint: str) -> None:
    s = S3Storage(s3_endpoint, "bucket-that-does-not-exist-9f2", "k", "s", region="us-east-1")
    with pytest.raises(StorageError) as e:
        await s.put("users/a/documents/b/original", b"x", "text/plain")
    assert "bucket-that-does-not-exist" not in str(e.value)


async def test_api_flow_and_isolation_on_s3(client, s3: S3Storage, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    """Needs the test database (conftest `client`)."""
    import app.services.documents.processor as processor
    import app.services.library as library
    from app.services.jobs import get_job_runner
    from app.services.storage import base
    from tests.conftest import ALICE, BOB

    monkeypatch.setattr(base, "get_storage", lambda: s3)
    monkeypatch.setattr(library, "get_storage", lambda: s3)
    monkeypatch.setattr(processor, "get_storage", lambda: s3)
    body = b"Sleep supports memory consolidation.\n\nSlow-wave sleep moves declarative memories overnight into the neocortex."
    doc = (await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("s3-notes.md", body)})).json()
    await get_job_runner().drain()
    assert (await client.get(f"/api/v1/library/{doc['id']}", headers=ALICE)).json()["status"] == "ready"
    keys = [k for k in await s3.list_keys("users/") if doc["id"] in k]
    assert sorted(k.rsplit("/", 1)[1] for k in keys) == ["extracted.txt", "original"]
    assert (await client.get(f"/api/v1/library/{doc['id']}/download", headers=ALICE)).content == body
    assert (await client.get(f"/api/v1/library/{doc['id']}/download", headers=BOB)).status_code == 404
    assert (await client.delete(f"/api/v1/library/{doc['id']}", headers=BOB)).status_code == 404
    assert (await client.delete(f"/api/v1/library/{doc['id']}", headers=ALICE)).status_code == 204
    await get_job_runner().drain()
    assert [k for k in await s3.list_keys("users/") if doc["id"] in k] == []
