"""Local filesystem storage — development only (refused in production)."""

from __future__ import annotations

import asyncio
import os
import re
from datetime import UTC, datetime
from pathlib import Path

from app.services.storage.base import ObjectExists, ObjectMeta, ObjectNotFound

_SAFE_KEY = re.compile(r"^[a-zA-Z0-9/_\-.]{1,300}$")


class LocalStorage:
    backend = "local"

    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not _SAFE_KEY.match(key) or ".." in key or key.startswith("/"):
            raise ValueError("invalid storage key")
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise ValueError("invalid storage key")
        return p

    async def put(self, key: str, data: bytes, content_type: str, *, overwrite: bool = False) -> None:
        p = self._path(key)

        def write() -> None:
            p.parent.mkdir(parents=True, exist_ok=True)
            if overwrite:
                tmp = p.with_name(f".{p.name}.tmp")
                tmp.write_bytes(data)
                os.replace(tmp, p)
                return
            try:
                with open(p, "xb") as f:  # exclusive create: never clobbers an existing object
                    f.write(data)
            except FileExistsError as e:
                raise ObjectExists(key) from e

        await asyncio.to_thread(write)

    async def get(self, key: str) -> bytes:
        try:
            return await asyncio.to_thread(self._path(key).read_bytes)
        except FileNotFoundError as e:
            raise ObjectNotFound(key) from e

    async def delete(self, key: str) -> bool:
        p = self._path(key)

        def rm() -> bool:
            try:
                p.unlink()
                return True
            except FileNotFoundError:
                return False

        return await asyncio.to_thread(rm)

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._path(key).is_file)

    async def list_keys(self, prefix: str) -> list[str]:
        def walk() -> list[str]:
            return sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*") if p.is_file() and str(p.relative_to(self.root)).startswith(prefix))

        return await asyncio.to_thread(walk)

    async def metadata(self, key: str) -> ObjectMeta:
        p = self._path(key)
        try:
            st = await asyncio.to_thread(p.stat)
        except FileNotFoundError as e:
            raise ObjectNotFound(key) from e
        return ObjectMeta(key=key, size=st.st_size, content_type=None, updated=datetime.fromtimestamp(st.st_mtime, UTC))
