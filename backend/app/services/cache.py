"""Small JSON cache on Redis. A miss, an error or a disabled Redis all behave the same: no cache.

Only shared, non-user-specific data belongs here (public search results, question
embeddings). User-specific API responses (projects, library, research) are never
cached — their visibility depends on authorisation and changes at any time.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core.redis import KEY_PREFIX, get_redis, mark_down


def key(kind: str, parts: Any) -> str:
    digest = hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()
    return f"{KEY_PREFIX}{kind}:{digest}"


async def get_json(kind: str, parts: Any) -> Any | None:
    r = get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key(kind, parts))
    except Exception as e:
        mark_down("cache_get", e)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


async def set_json(kind: str, parts: Any, value: Any, ttl_s: int) -> None:
    r = get_redis()
    if r is None or ttl_s <= 0:
        return
    try:
        await r.set(key(kind, parts), json.dumps(value, separators=(",", ":"), default=str), ex=ttl_s)
    except Exception as e:
        mark_down("cache_set", e)
