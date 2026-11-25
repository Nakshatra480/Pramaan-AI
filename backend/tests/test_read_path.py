"""The hot read path: resolving the user doesn't write, and a report loads in one query."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.db.database import get_sessionmaker
from app.db.models import User
from app.repositories.research import ResearchRepository
from app.research import runner
from app.services.research import source_order
from tests.conftest import ALICE
from tests.fakes import FakeAcademic, FakeWeb, make_deps
from tests.test_research import complete


@pytest.fixture(autouse=True)
def fake_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))


async def _last_login(email: str) -> datetime | None:
    async with get_sessionmaker()() as db:
        return await db.scalar(select(User.last_login_at).where(User.email == email))


async def test_requests_do_not_rewrite_the_user_row(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/me", headers=ALICE)).status_code == 200
    first = await _last_login("alice@example.com")
    assert first is not None
    assert (await client.get("/api/v1/research", headers=ALICE)).status_code == 200
    assert await _last_login("alice@example.com") == first  # read-only: no row lock, no write

    # A stale login time is refreshed.
    async with get_sessionmaker()() as db:
        await db.execute(update(User).where(User.email == "alice@example.com").values(last_login_at=datetime.now(UTC) - timedelta(hours=1)))
        await db.commit()
    assert (await client.get("/api/v1/research", headers=ALICE)).status_code == 200
    refreshed = await _last_login("alice@example.com")
    assert refreshed is not None and datetime.now(UTC) - refreshed < timedelta(minutes=1)


async def test_single_query_detail_matches_the_orm_rows(client: AsyncClient) -> None:
    r = await complete(client)
    rid = uuid.UUID(r["id"])
    async with get_sessionmaker()() as db:
        repo = ResearchRepository(db)
        orm = await repo.artifacts(rid)
        one = await repo.detail(rid)
        steps = await repo.steps(rid)
    assert [str(s.id) for s in one["sources"]] and {str(s.id) for s in one["sources"]} == {str(s.id) for s in orm["sources"]}
    assert [str(e.id) for e in one["evidence"]] == [str(e.id) for e in orm["evidence"]]
    assert [str(c.id) for c in one["claims"]] == [str(c.id) for c in orm["claims"]]
    assert {(str(c), str(e)) for c, e in one["links"]} == {(str(c), str(e)) for c, e in orm["links"]}
    assert [(c.index, str(c.source_id)) for c in one["citations"]] == [(c.index, str(c.source_id)) for c in orm["citations"]]
    assert [s.key for s in one["steps"]] == [s.key for s in steps]
    assert [str(i) for i in source_order(one)] == [str(i) for i in source_order(orm)]
    # The API response is built from it: cited sources first, in citation order.
    cited = [c["sourceId"] for c in r["report"]["citations"]]
    assert r["sourceIds"][: len(cited)] == list(dict.fromkeys(cited))
