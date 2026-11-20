"""Optional Redis connection (REDIS_URL). Nothing in the application requires it.

Every caller treats Redis as an optimisation and falls back to in-process behaviour
when it is unset or failing. After an error Redis is skipped for a short cool-down,
so an outage costs one failed call per cool-down — not a timeout on every request.
"""

from __future__ import annotations

import contextlib
import logging
import time
from functools import lru_cache
from typing import TYPE_CHECKING

from app.core.config import get_settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger("pramaan.redis")

COOL_DOWN_S = 30.0
KEY_PREFIX = "pramaan:v1:"
_down_until = 0.0


@lru_cache
def _client() -> Redis | None:
    url = get_settings().redis_url.get_secret_value()
    if not url:
        return None
    from redis.asyncio import Redis
    from redis.asyncio.retry import Retry
    from redis.backoff import ExponentialBackoff
    from redis.exceptions import ConnectionError as RedisConnectionError
    from redis.exceptions import TimeoutError as RedisTimeoutError

    # Hosted Redis (e.g. Upstash) closes idle connections; the next command then fails with
    # "connection reset". Retrying on connection errors reconnects transparently instead of
    # treating a stale socket as an outage.
    return Redis.from_url(
        url,
        socket_timeout=2.0,
        socket_connect_timeout=2.0,
        health_check_interval=30,
        retry=Retry(ExponentialBackoff(cap=0.5, base=0.05), retries=2),
        retry_on_error=[RedisConnectionError, RedisTimeoutError],
        decode_responses=False,
    )


def get_redis() -> Redis | None:
    """The shared client, or None when Redis is disabled or cooling down after an error."""
    if time.monotonic() < _down_until:
        return None
    return _client()


def mark_down(op: str, e: BaseException) -> None:
    """Record a Redis failure: log once and skip Redis for the cool-down period."""
    global _down_until
    first = time.monotonic() >= _down_until
    _down_until = time.monotonic() + COOL_DOWN_S
    if first:
        logger.warning("redis_unavailable", extra={"fields": {"op": op, "error": type(e).__name__}})


def is_configured() -> bool:
    return bool(get_settings().redis_url.get_secret_value())


async def ping() -> str:
    """'ok' | 'unavailable' | 'disabled' — informational only (see /ready)."""
    if not is_configured():
        return "disabled"
    r = _client()
    try:
        assert r is not None
        await r.ping()
        return "ok"
    except Exception:
        return "unavailable"


async def close_redis() -> None:
    if _client.cache_info().currsize:
        r = _client()
        if r is not None:
            with contextlib.suppress(Exception):  # best effort on shutdown
                await r.aclose()
    _client.cache_clear()


def reset_for_tests() -> None:
    global _down_until
    _down_until = 0.0
    _client.cache_clear()
