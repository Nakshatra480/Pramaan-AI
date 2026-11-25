"""GET /health/warmup: cheap, side-effect free, never touches expensive services."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


def _boom(*a, **k):  # type: ignore[no-untyped-def]
    raise AssertionError("warmup must not call this")


async def test_warmup_is_cheap_and_touches_nothing(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import app.api.routes.health as health
    import app.research.graph as graph
    import app.services.llm.factory as factory
    import app.services.search.tavily as tavily
    from app.services.search import openalex as academic

    monkeypatch.setattr(health, "get_engine", _boom)  # no database
    monkeypatch.setattr(factory, "get_llm", _boom)  # no Groq
    monkeypatch.setattr(factory, "get_embedder", _boom)  # no OpenRouter
    monkeypatch.setattr(graph, "build_graph", _boom)  # no LangGraph
    monkeypatch.setattr(tavily.TavilyService, "search", _boom)  # no Tavily
    monkeypatch.setattr(academic.OpenAlexService, "search", _boom)  # no OpenAlex
    r = await client.get("/health/warmup")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    assert "authorization" not in {k.lower() for k in r.request.headers}  # no auth needed


async def test_warmup_has_no_side_effects(client: AsyncClient) -> None:
    from sqlalchemy import func, select

    from app.db.database import get_sessionmaker
    from app.db.models import ResearchSession, User

    for _ in range(3):
        await client.get("/health/warmup")
    async with get_sessionmaker()() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == 0
        assert await db.scalar(select(func.count()).select_from(ResearchSession)) == 0


async def test_warmup_is_rate_limited(client: AsyncClient) -> None:
    import app.api.routes.health as health

    health._warmup_limiter.cache_clear()
    codes = [(await client.get("/health/warmup")).status_code for _ in range(32)]
    health._warmup_limiter.cache_clear()
    assert codes[:30] == [200] * 30 and codes[30:] == [429, 429]


async def test_warmup_can_be_disabled(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "warmup_enabled", False)
    assert (await client.get("/health/warmup")).status_code == 404
