"""Redis features (fakeredis): shared rate limiting, caches, progress pub/sub — and that every one
of them degrades to in-process behaviour when Redis is missing or failing. No database needed."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest

import app.core.redis as redis_mod
from app.core.rate_limit import RedisRateLimiter, SlidingWindowLimiter
from app.services import cache, progress_events


@pytest.fixture(autouse=True)
def isolated() -> Iterator[None]:
    redis_mod.reset_for_tests()
    yield
    redis_mod.reset_for_tests()


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Any:
    import fakeredis

    r = fakeredis.FakeAsyncRedis(server=fakeredis.FakeServer())
    monkeypatch.setattr(redis_mod, "_client", lambda: r)
    return r


class Broken:
    """A Redis client whose every call fails (outage)."""

    def __getattr__(self, name: str) -> Any:
        def fail(*a: Any, **k: Any) -> Any:
            raise ConnectionError("redis down")

        return fail


@pytest.fixture
def broken(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(redis_mod, "_client", lambda: Broken())


# ------------------------------------------------------------------ rate limiting


async def test_redis_limiter_enforces_and_is_shared_between_instances(fake: Any) -> None:
    a, b = RedisRateLimiter(3), RedisRateLimiter(3)  # e.g. two server processes
    assert [await a.hit("uid-1"), await b.hit("uid-1"), await a.hit("uid-1"), await b.hit("uid-1")] == [True, True, True, False]
    assert await a.hit("uid-2")  # other keys are independent
    keys = [k async for k in fake.scan_iter("pramaan:v1:rl:*")]
    ttls = [await fake.ttl(k) for k in keys]
    assert keys and all(0 < t <= 61 for t in ttls)


async def test_redis_limiter_falls_back_when_redis_fails(broken: None) -> None:
    limiter = RedisRateLimiter(2)
    assert [await limiter.hit("u"), await limiter.hit("u"), await limiter.hit("u")] == [True, True, False]
    assert redis_mod.get_redis() is None  # cooling down: no per-request Redis timeouts during an outage


async def test_limiter_disabled_at_zero(fake: Any) -> None:
    assert all([await RedisRateLimiter(0).hit("u") for _ in range(5)])


async def test_sliding_window_prunes_idle_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    limiter = SlidingWindowLimiter(5)
    limiter.PRUNE_EVERY = 10
    clock = [1000.0]
    monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: clock[0])
    for i in range(9):
        await limiter.hit(f"ip-{i}")
    clock[0] += 120
    await limiter.hit("fresh")  # 10th call triggers pruning
    assert set(limiter._hits) == {"fresh"}


# ------------------------------------------------------------------ cache


async def test_cache_roundtrip_with_ttl(fake: Any) -> None:
    await cache.set_json("tavily", {"q": "x"}, [{"url": "https://a"}], 60)
    assert await cache.get_json("tavily", {"q": "x"}) == [{"url": "https://a"}]
    assert await cache.get_json("tavily", {"q": "y"}) is None
    assert 0 < await fake.ttl(cache.key("tavily", {"q": "x"})) <= 60


async def test_cache_is_a_noop_without_redis() -> None:
    await cache.set_json("tavily", {"q": "x"}, [1], 60)
    assert await cache.get_json("tavily", {"q": "x"}) is None


async def test_cache_errors_never_raise(broken: None) -> None:
    await cache.set_json("tavily", {"q": "x"}, [1], 60)
    assert await cache.get_json("tavily", {"q": "x"}) is None


async def test_tavily_results_are_cached(fake: Any) -> None:
    from app.services.tavily import TavilyService

    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"results": [{"url": "https://example.org/a", "title": "A", "content": "Text", "score": 0.9}]})

    svc = TavilyService("tvly-test")
    svc._client = httpx.AsyncClient(base_url=svc.endpoint, transport=httpx.MockTransport(handler))
    first = await svc.search("battery costs", max_results=5, deep=False)
    second = await svc.search("battery costs", max_results=5, deep=False)
    assert calls == 1 and [s.url for s in first] == [s.url for s in second] == ["https://example.org/a"]
    await svc.search("battery costs", max_results=5, deep=True)  # different parameters → different entry
    assert calls == 2


async def test_query_embeddings_are_cached_but_documents_are_not(fake: Any) -> None:
    from app.services.embeddings import EmbeddingService
    from app.services.llm.fake import FakeProvider

    class Counting(FakeProvider):
        calls = 0

        async def embed(self, texts: list[str], *, task: Any = "document") -> list[list[float]]:
            type(self).calls += 1
            return await super().embed(texts, task=task)

    svc = EmbeddingService(Counting(768))
    v1 = await svc.embed_query("What limits battery cost?")
    v2 = await svc.embed_query("What limits battery cost?")
    assert v1 == pytest.approx(v2) and Counting.calls == 1
    await svc.embed_documents(["private passage"])
    await svc.embed_documents(["private passage"])
    assert Counting.calls == 3
    assert not [k async for k in fake.scan_iter("pramaan:v1:embed_document*")]


# ------------------------------------------------------------------ progress pub/sub


async def test_publish_wakes_a_subscriber(fake: Any) -> None:
    rid = uuid.uuid4()
    async with progress_events.subscription(rid) as wait:
        assert wait is not None
        await wait(0.05)  # drain anything pending
        start = time.monotonic()
        waiter = asyncio.create_task(wait(5.0))
        await asyncio.sleep(0.05)
        await progress_events.publish(rid)
        await asyncio.wait_for(waiter, 2.0)
        assert time.monotonic() - start < 2.0


async def test_subscription_is_none_without_redis() -> None:
    async with progress_events.subscription(uuid.uuid4()) as wait:
        assert wait is None
    await progress_events.publish(uuid.uuid4())  # no-op, no error


async def test_stream_wakes_on_publish_instead_of_polling(fake: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.db.models import ResearchStatus
    from app.schemas.research import Metrics, ProgressEvent
    from app.services import research_stream

    state = {"status": ResearchStatus.planning}

    async def snapshot(_: uuid.UUID) -> ProgressEvent:
        return ProgressEvent(type="x", status=state["status"], message="", progress=0, steps=[], metrics=Metrics(), source_ids=[])

    async def connected() -> bool:
        return False

    monkeypatch.setattr(research_stream, "snapshot", snapshot)
    rid = uuid.uuid4()
    gen = research_stream.stream_events(rid, connected, safety_poll_s=30.0)
    assert await gen.__anext__() == "retry: 2000\n\n"
    assert "planning" in await gen.__anext__()

    async def finish() -> None:
        await asyncio.sleep(0.1)
        state["status"] = ResearchStatus.completed
        await progress_events.publish(rid)

    task = asyncio.create_task(finish())
    start = time.monotonic()
    final = await asyncio.wait_for(gen.__anext__(), 5.0)  # would take 30 s if it waited for the safety poll
    await task
    assert "completed" in final and time.monotonic() - start < 5.0
    with pytest.raises(StopAsyncIteration):
        await gen.__anext__()
