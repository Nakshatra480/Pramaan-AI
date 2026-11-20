"""Rate limiting.

With REDIS_URL set, limits are shared across processes/instances and survive restarts
(fixed one-minute windows: INCR + EXPIRE). Without Redis — or while it is failing —
the in-process sliding window is used.
"""

from __future__ import annotations

import time
from functools import lru_cache
from typing import Protocol

from app.core.config import get_settings
from app.core.redis import KEY_PREFIX, get_redis, is_configured, mark_down


class RateLimiter(Protocol):
    async def hit(self, key: str) -> bool:
        """Record a request; return False when the key is over its limit."""
        ...


class SlidingWindowLimiter:
    """Per-process limiter. Idle keys are pruned so memory doesn't grow with every user/IP ever seen."""

    PRUNE_EVERY = 1000

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, list[float]] = {}
        self._calls = 0

    async def hit(self, key: str) -> bool:
        if self.per_minute <= 0:
            return True
        now = time.monotonic()
        self._calls += 1
        if self._calls % self.PRUNE_EVERY == 0:
            self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < 60}
        window = [t for t in self._hits.get(key, []) if now - t < 60]
        allowed = len(window) < self.per_minute
        if allowed:
            window.append(now)
        self._hits[key] = window
        return allowed


class RedisRateLimiter:
    """Shared limiter; falls back to the in-process limiter whenever Redis is unavailable."""

    def __init__(self, per_minute: int, name: str = "api") -> None:
        self.per_minute = per_minute
        self.name = name
        self.fallback = SlidingWindowLimiter(per_minute)

    async def hit(self, key: str) -> bool:
        if self.per_minute <= 0:
            return True
        r = get_redis()
        if r is None:
            return await self.fallback.hit(key)
        window = int(time.time() // 60)
        k = f"{KEY_PREFIX}rl:{self.name}:{key}:{window}"
        try:
            async with r.pipeline(transaction=True) as p:
                p.incr(k)
                p.expire(k, 61)
                count, _ = await p.execute()
        except Exception as e:
            mark_down("rate_limit", e)
            return await self.fallback.hit(key)
        return int(count) <= self.per_minute


def make_limiter(per_minute: int, name: str) -> RateLimiter:
    return RedisRateLimiter(per_minute, name) if is_configured() and per_minute > 0 else SlidingWindowLimiter(per_minute)


@lru_cache
def get_rate_limiter() -> RateLimiter:
    return make_limiter(get_settings().rate_limit_per_minute, "api")
