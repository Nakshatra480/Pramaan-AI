"""S3-compatible object storage — Supabase Storage in production (STORAGE_BACKEND=s3).

Supabase exposes each project's storage through an S3 endpoint
(https://<project-ref>.supabase.co/storage/v1/s3) and requires path-style
addressing. Use S3 access keys (Storage → Settings → S3 access keys) — never the
service_role key — and a private bucket. Objects are only reachable through the
API after an ownership check; no presigned or public URLs are issued.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.services.storage.base import ObjectExists, ObjectMeta, ObjectNotFound, StorageError

logger = logging.getLogger("pramaan.storage")

_NOT_FOUND = {"NoSuchKey", "404", "NotFound", "NoSuchVersion"}


class S3Storage:
    backend = "s3"

    def __init__(self, endpoint: str, bucket: str, access_key_id: str, secret_access_key: str, *, region: str = "us-east-1", client: Any | None = None) -> None:
        if not bucket:
            raise RuntimeError("STORAGE_BACKEND=s3 requires S3_BUCKET.")
        self.bucket = bucket
        self._endpoint = endpoint
        self._region = region or "us-east-1"
        self._key_id = access_key_id
        self._secret = secret_access_key
        self._client = client

    def _c(self) -> Any:
        if self._client is None:
            import boto3  # lazy: only loaded when S3 storage is configured
            from botocore.config import Config

            self._client = boto3.client(
                "s3",
                endpoint_url=self._endpoint,
                region_name=self._region,
                aws_access_key_id=self._key_id,
                aws_secret_access_key=self._secret,
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},  # required by Supabase; works with any S3 API
                    connect_timeout=5,
                    read_timeout=60,
                    retries={"max_attempts": 3, "mode": "standard"},
                ),
            )
        return self._client

    @staticmethod
    def _check_key(key: str) -> None:
        if not key or key.startswith("/") or ".." in key:
            raise ValueError("invalid storage key")

    def _wrap(self, e: Exception, key: str) -> StorageError:
        code = ""
        resp = getattr(e, "response", None)
        if isinstance(resp, dict):
            code = str(resp.get("Error", {}).get("Code", ""))
        if code in _NOT_FOUND:
            return ObjectNotFound(key)
        logger.warning("s3_error", extra={"fields": {"op_key": key, "error": code or type(e).__name__}})
        return StorageError(f"storage operation failed ({code or type(e).__name__})")

    async def _call(self, key: str, fn: str, **kwargs: Any) -> Any:
        try:
            return await asyncio.to_thread(getattr(self._c(), fn), **kwargs)
        except Exception as e:
            raise self._wrap(e, key) from e

    async def put(self, key: str, data: bytes, content_type: str, *, overwrite: bool = False) -> None:
        self._check_key(key)
        # Keys are server-generated UUID paths, so a collision is practically impossible; the existence
        # check still guarantees we never silently replace another object.
        if not overwrite and await self.exists(key):
            raise ObjectExists(key)
        await self._call(key, "put_object", Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    async def get(self, key: str) -> bytes:
        self._check_key(key)
        obj = await self._call(key, "get_object", Bucket=self.bucket, Key=key)
        return bytes(await asyncio.to_thread(obj["Body"].read))

    async def exists(self, key: str) -> bool:
        self._check_key(key)
        try:
            await self._call(key, "head_object", Bucket=self.bucket, Key=key)
            return True
        except ObjectNotFound:
            return False

    async def metadata(self, key: str) -> ObjectMeta:
        self._check_key(key)
        h = await self._call(key, "head_object", Bucket=self.bucket, Key=key)
        return ObjectMeta(key=key, size=int(h.get("ContentLength", 0)), content_type=h.get("ContentType"), updated=h.get("LastModified"))

    async def delete(self, key: str) -> bool:
        """Delete the object. Returns False if it didn't exist (idempotent)."""
        self._check_key(key)
        if not await self.exists(key):
            return False
        await self._call(key, "delete_object", Bucket=self.bucket, Key=key)
        return True

    async def list_keys(self, prefix: str) -> list[str]:
        keys: list[str] = []
        token: str | None = None
        while True:
            kwargs: dict[str, Any] = {"Bucket": self.bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            page = await self._call(prefix, "list_objects_v2", **kwargs)
            keys += [o["Key"] for o in page.get("Contents") or []]
            if not page.get("IsTruncated"):
                return sorted(keys)
            token = page.get("NextContinuationToken")
