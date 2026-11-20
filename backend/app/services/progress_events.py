"""Research progress notifications over Redis pub/sub (optional).

The database stays the source of truth: a message only says "research X changed,
read it again". Writers publish after committing; the SSE stream wakes up on a
message instead of polling the database every half second. If Redis is disabled
or failing, publishing is a no-op and the stream falls back to polling.
"""

from __future__ import annotations

import contextlib
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

from app.core.redis import KEY_PREFIX, get_redis, mark_down

Waiter = Callable[[float], Awaitable[None]]


def channel(research_id: uuid.UUID) -> str:
    return f"{KEY_PREFIX}research:{research_id}"


async def publish(research_id: uuid.UUID) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        await r.publish(channel(research_id), b"1")
    except Exception as e:
        mark_down("progress_publish", e)


@contextlib.asynccontextmanager
async def subscription(research_id: uuid.UUID) -> AsyncIterator[Waiter | None]:
    """Yields `wait(timeout)` — returns on the next change notice or after `timeout` seconds —
    or None when Redis isn't available (the caller then polls)."""
    r = get_redis()
    if r is None:
        yield None
        return
    pubsub = r.pubsub(ignore_subscribe_messages=True)
    try:
        await pubsub.subscribe(channel(research_id))
    except Exception as e:
        mark_down("progress_subscribe", e)
        with contextlib.suppress(Exception):
            await pubsub.aclose()
        yield None
        return

    broken = False

    async def wait(seconds: float) -> None:
        nonlocal broken
        if broken:
            raise ConnectionError("progress subscription lost")
        try:
            await pubsub.get_message(timeout=seconds)
        except Exception as e:
            broken = True
            mark_down("progress_wait", e)
            raise ConnectionError("progress subscription lost") from e

    try:
        yield wait
    finally:
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe()
            await pubsub.aclose()
