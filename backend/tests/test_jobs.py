"""Neon-backed job system: claiming, leases, restart recovery, retry limits, outages."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.db.database import get_sessionmaker
from app.db.models import Document, DocumentStatus, Message, ResearchSession, ResearchStatus
from app.research import runner
from app.research.llm import ResearchLLM
from app.services import jobs
from app.services.jobs import JobKind, claim_next, get_job_runner, renew, sweep
from app.services.llm.base import ModelNotInstalled, ModelUnavailable
from app.services.llm.fake import FakeProvider
from tests.conftest import ALICE
from tests.fakes import FakeAcademic, FakeWeb, make_deps

Q = "What are the latest developments in humanoid robots?"


@pytest.fixture(autouse=True)
def fake_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))


async def create(client: AsyncClient) -> uuid.UUID:
    r = await client.post("/api/v1/research", headers=ALICE, json={"query": Q})
    return uuid.UUID(r.json()["researchId"])


async def get(client: AsyncClient, rid: uuid.UUID) -> dict:  # type: ignore[type-arg]
    return (await client.get(f"/api/v1/research/{rid}", headers=ALICE)).json()


async def expire(model: type, job_id: uuid.UUID) -> None:  # type: ignore[type-arg]
    async with get_sessionmaker()() as db:
        await db.execute(update(model).where(model.id == job_id).values(lease_expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        await db.commit()


async def test_claim_is_atomic_under_contention(client: AsyncClient) -> None:
    rid = await create(client)
    results = await asyncio.gather(*(claim_next(JobKind.research, f"worker-{i}") for i in range(8)))
    assert [r for r in results if r] == [rid]  # exactly one winner
    assert await claim_next(JobKind.research, "late") is None  # leased jobs aren't re-claimed


async def test_lease_renewal_only_for_owner(client: AsyncClient) -> None:
    await create(client)
    rid = await claim_next(JobKind.research, "a")
    assert rid is not None
    assert await renew(JobKind.research, rid, "a") is True
    assert await renew(JobKind.research, rid, "b") is False


async def test_restart_recovery_requeues_and_completes(client: AsyncClient) -> None:
    rid = await create(client)
    assert await claim_next(JobKind.research, "crashed-worker") == rid  # claimed, then the process "dies"
    await expire(ResearchSession, rid)
    stats = await sweep()
    assert stats["research_requeued"] == 1
    r = await get(client, rid)
    assert r["status"] == "queued"
    assert await sweep() == {k: 0 for k in stats}  # idempotent
    await get_job_runner().drain()  # a fresh worker (post-restart) finishes it
    assert (await get(client, rid))["status"] == "completed"


async def test_interrupted_mid_run_resets_partial_progress(client: AsyncClient) -> None:
    rid = await create(client)
    await claim_next(JobKind.research, "crashed-worker")
    async with get_sessionmaker()() as db:  # simulate partial progress then a crash
        await db.execute(update(ResearchSession).where(ResearchSession.id == rid).values(status=ResearchStatus.searching))
        await db.commit()
    await expire(ResearchSession, rid)
    await sweep()
    r = await get(client, rid)
    assert r["status"] == "queued" and all(s["status"] == "pending" for s in r["steps"])


async def test_retry_limit_turns_repeated_interruptions_into_failure(client: AsyncClient) -> None:
    rid = await create(client)
    for i in range(2):  # JOB_MAX_ATTEMPTS=2
        assert await claim_next(JobKind.research, f"crash-{i}") == rid
        await expire(ResearchSession, rid)
        await sweep()
    r = await get(client, rid)
    assert r["status"] == "failed" and r["errorCode"] == "INTERRUPTED"
    assert await claim_next(JobKind.research, "any") is None
    # A user retry resets the attempt budget.
    assert (await client.post(f"/api/v1/research/{rid}/retry", headers=ALICE)).status_code == 202
    await get_job_runner().drain()
    assert (await get(client, rid))["status"] == "completed"


async def test_duplicate_delivery_does_not_run_twice(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    rid = await create(client)
    owner = "worker-a"
    assert await claim_next(JobKind.research, owner) == rid
    ran = 0
    real = runner.build_graph

    def counting():  # type: ignore[no-untyped-def]
        nonlocal ran
        ran += 1
        return real()

    monkeypatch.setattr(runner, "build_graph", counting)
    await runner.run_research(rid, "worker-b")  # not the lease holder → no-op
    assert ran == 0
    await runner.run_research(rid, owner)
    await runner.run_research(rid, owner)  # already completed → no-op
    assert ran == 1 and (await get(client, rid))["status"] == "completed"


async def test_lost_lease_stops_the_old_worker(client: AsyncClient) -> None:
    from app.research.progress import LeaseLost, ProgressReporter

    rid = await create(client)
    await claim_next(JobKind.research, "old")
    async with get_sessionmaker()() as db:
        await db.execute(update(ResearchSession).where(ResearchSession.id == rid).values(lease_owner="new"))
        await db.commit()
    with pytest.raises(LeaseLost):
        await ProgressReporter(rid, "old").start("planning")


async def test_model_outage_fails_explicitly_and_is_retryable(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class DownProvider(FakeProvider):
        supports_generation = True

        async def generate(self, *a, **k):  # type: ignore[no-untyped-def]
            raise ModelUnavailable("groq generate: ConnectError")

    base = make_deps(FakeWeb(), FakeAcademic())

    def deps(research_id):  # type: ignore[no-untyped-def]
        d = base(research_id)
        d.llm = ResearchLLM(DownProvider(768))
        return d

    monkeypatch.setattr(runner, "default_deps", deps)
    rid = await create(client)
    await get_job_runner().drain()
    r = await get(client, rid)
    assert r["status"] == "failed" and r["errorCode"] == "MODEL_UNAVAILABLE" and r["report"] is None  # no silent extractive report
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))
    assert (await client.post(f"/api/v1/research/{rid}/retry", headers=ALICE)).status_code == 202
    await get_job_runner().drain()
    assert (await get(client, rid))["status"] == "completed"


async def test_missing_model_fails_fast_in_preflight(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class Missing(FakeProvider):
        async def preflight(self) -> None:
            raise ModelNotInstalled("groq preflight: model 'x' is not available")

    base = make_deps(FakeWeb(), FakeAcademic())

    def deps(research_id):  # type: ignore[no-untyped-def]
        d = base(research_id)
        d.llm = ResearchLLM(Missing(768))
        return d

    monkeypatch.setattr(runner, "default_deps", deps)
    rid = await create(client)
    await get_job_runner().drain()
    r = await get(client, rid)
    assert r["status"] == "failed" and r["errorCode"] == "MODEL_NOT_INSTALLED"
    assert all(s["status"] == "pending" for s in r["steps"])  # nothing ran


async def test_document_indexing_recovers_after_restart(client: AsyncClient) -> None:
    body = b"Sleep supports memory consolidation.\n\nSlow-wave sleep moves declarative memories to the neocortex overnight."
    doc_id = uuid.UUID((await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("n.md", body)})).json()["id"])
    assert await claim_next(JobKind.document, "crashed") == doc_id
    async with get_sessionmaker()() as db:
        await db.execute(update(Document).where(Document.id == doc_id).values(status=DocumentStatus.embedding))
        await db.commit()
    await expire(Document, doc_id)
    assert (await sweep())["documents_requeued"] == 1
    await get_job_runner().drain()
    assert (await client.get(f"/api/v1/library/{doc_id}", headers=ALICE)).json()["status"] == "ready"


async def test_document_indexing_degrades_to_keyword_search_when_embeddings_are_down(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Audit C-02: an embedding outage no longer fails indexing. The document is chunked and searchable by
    keyword, carries a visible warning, and Retry adds semantic search once the provider is back."""
    from sqlalchemy import func, select

    from app.db.models import DocumentChunk
    from app.services.documents import processor

    class Down(FakeProvider):
        async def preflight(self) -> None:
            raise ModelUnavailable("down")

    real_init = processor.DocumentProcessor.__init__

    def init(self, storage=None, embeddings=None):  # type: ignore[no-untyped-def]
        from app.services.embeddings import EmbeddingService

        real_init(self, storage, EmbeddingService(Down(768)))

    monkeypatch.setattr(processor.DocumentProcessor, "__init__", init)
    r = await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("n.md", b"Some text that is long enough to index properly here.")})
    doc_id = r.json()["id"]
    await get_job_runner().drain()
    d = (await client.get(f"/api/v1/library/{doc_id}", headers=ALICE)).json()
    assert d["status"] == "ready" and d["error"] is None
    assert "keyword search only" in d["warning"]
    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(func.count(), func.count(DocumentChunk.embedding)).where(DocumentChunk.document_id == uuid.UUID(doc_id)))).one()
    assert rows == (1, 0)  # chunk stored, no embedding yet

    monkeypatch.setattr(processor.DocumentProcessor, "__init__", real_init)  # provider back
    assert (await client.post(f"/api/v1/library/{doc_id}/retry", headers=ALICE)).status_code == 200
    await get_job_runner().drain()
    d = (await client.get(f"/api/v1/library/{doc_id}", headers=ALICE)).json()
    assert d["status"] == "ready" and d["warning"] is None
    async with get_sessionmaker()() as db:
        assert await db.scalar(select(func.count(DocumentChunk.embedding)).where(DocumentChunk.document_id == uuid.UUID(doc_id))) == 1
    # a fully indexed document can't be "retried"
    assert (await client.post(f"/api/v1/library/{doc_id}/retry", headers=ALICE)).status_code == 422


async def test_stale_follow_ups_are_closed_by_the_sweep(client: AsyncClient) -> None:
    rid = await create(client)
    await get_job_runner().drain()
    async with get_sessionmaker()() as db:
        from app.db.models import Conversation

        conv = Conversation(research_id=rid, user_id=(await db.get(ResearchSession, rid)).user_id)  # type: ignore[union-attr]
        db.add(conv)
        await db.flush()
        db.add(Message(conversation_id=conv.id, question="q?", answer=[], status="running", created_at=datetime.now(UTC) - timedelta(minutes=30)))
        await db.commit()
    assert (await sweep())["follow_ups_closed"] == 1


async def test_research_concurrency_is_one(client: AsyncClient) -> None:
    worker = jobs.JobWorker()
    for _ in range(3):
        await create(client)
    started = await worker.fill()
    assert started == 1  # RESEARCH_CONCURRENCY=1
    await asyncio.gather(*list(worker._running))
