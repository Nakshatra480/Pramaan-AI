"""Neon-backed job system for research and document indexing.

All job state lives in PostgreSQL — status, attempts, lease owner/expiry,
heartbeat, interruption and error codes — so a container restart (Render Free
sleeps and restarts freely) never loses work:

* claim      — atomic `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`: one winner, even across overlapping instances
* heartbeat  — progress writes and a ticker renew the lease while a job runs
* sweep      — at startup and periodically: expired leases → `interrupted` → requeued (or failed after max attempts)
* idempotent — every transition is a conditional UPDATE; re-running a sweep changes nothing

The worker loop is in-process (one Render container, one worker); the queue itself is the database.
Fire-and-forget housekeeping (storage deletes, follow-up answers) still uses `submit`.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import socket
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from functools import lru_cache
from typing import Protocol

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import log
from app.db.database import get_sessionmaker
from app.db.models import Document, DocumentStatus, Message, ResearchSession, ResearchStatus, ResearchStep, StepStatus

logger = logging.getLogger("pramaan.jobs")


class JobKind(StrEnum):
    research = "research"
    document = "document"


RESEARCH_ACTIVE = [
    ResearchStatus.planning,
    ResearchStatus.searching,
    ResearchStatus.retrieving,
    ResearchStatus.extracting,
    ResearchStatus.verifying,
    ResearchStatus.synthesizing,
    ResearchStatus.citing,
]
DOCUMENT_ACTIVE = [DocumentStatus.extracting, DocumentStatus.chunking, DocumentStatus.embedding, DocumentStatus.indexing]


def _now() -> datetime:
    return datetime.now(UTC)


class JobRunner(Protocol):
    def submit(self, name: str, fn: Callable[[], Awaitable[None]]) -> None: ...

    def wake(self) -> None: ...


# ------------------------------------------------------------------ queue operations (stateless)


def _model(kind: JobKind) -> type[ResearchSession] | type[Document]:
    return ResearchSession if kind == JobKind.research else Document


def _queued(kind: JobKind) -> str:
    return ResearchStatus.queued if kind == JobKind.research else DocumentStatus.uploading


async def claim_next(kind: JobKind, owner: str) -> uuid.UUID | None:
    """Atomically claim the oldest claimable job, or None."""
    s = get_settings()
    m = _model(kind)
    async with get_sessionmaker()() as db:
        candidate = (
            select(m.id)
            .where(
                m.status == _queued(kind),
                or_(m.lease_expires_at.is_(None), m.lease_expires_at < _now()),
                m.attempts < s.job_max_attempts,
            )
            .order_by(m.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
            .scalar_subquery()
        )
        now = _now()
        row = await db.execute(
            update(m)
            .where(m.id == candidate)
            .values(lease_owner=owner, lease_expires_at=now + timedelta(seconds=s.job_lease_s), heartbeat_at=now, attempts=m.attempts + 1)
            .returning(m.id)
        )
        claimed = row.scalar_one_or_none()
        await db.commit()
        return claimed


async def renew(kind: JobKind, job_id: uuid.UUID, owner: str, db: AsyncSession | None = None) -> bool:
    """Extend the lease if we still own it. Returns False if the lease was lost."""
    s = get_settings()
    m = _model(kind)
    now = _now()
    stmt = (
        update(m)
        .where(m.id == job_id, m.lease_owner == owner)
        .values(lease_expires_at=now + timedelta(seconds=s.job_lease_s), heartbeat_at=now)
        .returning(m.id)
    )
    if db is not None:
        return (await db.execute(stmt)).scalar_one_or_none() is not None
    async with get_sessionmaker()() as own:
        ok = (await own.execute(stmt)).scalar_one_or_none() is not None
        await own.commit()
        return ok


async def release(kind: JobKind, job_id: uuid.UUID, owner: str) -> None:
    m = _model(kind)
    async with get_sessionmaker()() as db:
        await db.execute(update(m).where(m.id == job_id, m.lease_owner == owner).values(lease_owner=None, lease_expires_at=None))
        await db.commit()


async def expire_owned(owner: str) -> None:
    """On graceful shutdown: make our unfinished leases immediately recoverable."""
    async with get_sessionmaker()() as db:
        for m in (ResearchSession, Document):
            await db.execute(update(m).where(m.lease_owner == owner).values(lease_expires_at=_now()))
        await db.commit()


async def sweep() -> dict[str, int]:
    """Recover interrupted work. Idempotent; safe to run from several places at once."""
    s = get_settings()
    stats = {"research_requeued": 0, "research_failed": 0, "documents_requeued": 0, "documents_failed": 0, "follow_ups_closed": 0}
    now = _now()
    async with get_sessionmaker()() as db:
        # Research: expired lease on an active (or claimed-but-not-started) session.
        rs = ResearchSession
        claimed_not_started = and_(rs.status == ResearchStatus.queued, rs.lease_owner.is_not(None))
        stale = (
            await db.scalars(
                select(rs).where(rs.lease_expires_at < now, or_(rs.status.in_(RESEARCH_ACTIVE), claimed_not_started)).with_for_update(skip_locked=True)
            )
        ).all()
        for r in stale:
            await _interrupt_research(db, r, s.job_max_attempts)
            stats["research_requeued" if r.status == ResearchStatus.queued else "research_failed"] += 1
        # Queued sessions that have exhausted their attempts can never be claimed — fail them visibly.
        exhausted = (
            await db.scalars(
                select(ResearchSession)
                .where(ResearchSession.status == ResearchStatus.queued, ResearchSession.lease_owner.is_(None), ResearchSession.attempts >= s.job_max_attempts)
                .with_for_update(skip_locked=True)
            )
        ).all()
        for r in exhausted:
            _fail_interrupted(r)
            stats["research_failed"] += 1

        # Documents
        stale_docs = (
            await db.scalars(
                select(Document)
                .where(
                    Document.lease_expires_at < now,
                    or_(Document.status.in_(DOCUMENT_ACTIVE), and_(Document.status == DocumentStatus.uploading, Document.lease_owner.is_not(None))),
                )
                .with_for_update(skip_locked=True)
            )
        ).all()
        for d in stale_docs:
            d.interrupted_at = now
            d.lease_owner, d.lease_expires_at = None, None
            if d.attempts < s.job_max_attempts:
                d.status = DocumentStatus.uploading
                stats["documents_requeued"] += 1
            else:
                d.status, d.error_code = DocumentStatus.failed, "INTERRUPTED"
                d.error = "Indexing was interrupted repeatedly. Please retry."
                stats["documents_failed"] += 1

        # Follow-up answers are fire-and-forget; close any left running by a restart.
        cutoff = now - timedelta(minutes=10)
        for msg in (await db.scalars(select(Message).where(Message.status == "running", Message.created_at < cutoff))).all():
            msg.status = "complete"
            msg.answer = ["This follow-up was interrupted before it finished. Please ask again."]
            stats["follow_ups_closed"] += 1
        await db.commit()
    if any(stats.values()):
        log(logger, logging.WARNING, "jobs_recovered", **stats)
    return stats


async def _interrupt_research(db: AsyncSession, r: ResearchSession, max_attempts: int) -> None:
    from app.repositories.research import ResearchRepository

    r.interrupted_at = _now()
    r.lease_owner, r.lease_expires_at = None, None
    active = await db.scalar(select(ResearchStep).where(ResearchStep.research_id == r.id, ResearchStep.status == StepStatus.active))
    if active:
        active.status = StepStatus.failed
        active.detail = "Interrupted by a server restart"
    r.status = ResearchStatus.interrupted
    r.error_code = "INTERRUPTED"
    await db.flush()
    if r.attempts < max_attempts:
        attempts = r.attempts
        await ResearchRepository(db).reset_for_retry(r)  # → queued, derived artifacts cleared
        r.attempts = attempts  # keep counting toward the limit
        r.interrupted_at = _now()
    else:
        _fail_interrupted(r)


def _fail_interrupted(r: ResearchSession) -> None:
    r.status = ResearchStatus.failed
    r.error_code = "INTERRUPTED"
    r.error_message = "Research was interrupted before it could finish."
    r.completed_at = _now()
    r.lease_owner, r.lease_expires_at = None, None


async def run_retention() -> int:
    """Settings → Privacy → Data retention: delete unsaved research older than each user's choice."""
    from app.services.account import enforce_retention

    async with get_sessionmaker()() as db:
        return await enforce_retention(db)


# ------------------------------------------------------------------ worker


Handler = Callable[[uuid.UUID, str], Awaitable[None]]


class JobWorker:
    def __init__(self) -> None:
        s = get_settings()
        self.owner = f"{socket.gethostname()[:60]}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
        self._slots = {JobKind.research: asyncio.Semaphore(max(1, s.research_concurrency)), JobKind.document: asyncio.Semaphore(max(1, s.indexing_concurrency))}
        self._wake = asyncio.Event()
        self._running: set[asyncio.Task[None]] = set()
        self._background: set[asyncio.Task[None]] = set()
        self._loops: list[asyncio.Task[None]] = []
        self._stopping = False

    # ---- handlers are resolved lazily to avoid import cycles
    @staticmethod
    def _handler(kind: JobKind) -> Handler:
        if kind == JobKind.research:
            from app.research import runner

            return runner.run_research
        from app.services.documents.processor import DocumentProcessor

        async def index(doc_id: uuid.UUID, owner: str) -> None:
            await DocumentProcessor().process(doc_id, owner)

        return index

    def wake(self) -> None:
        self._wake.set()

    def submit(self, name: str, fn: Callable[[], Awaitable[None]]) -> None:
        """Fire-and-forget housekeeping (not used for research/indexing)."""

        async def run() -> None:
            try:
                await fn()
            except Exception:
                logger.exception("background_task_failed", extra={"fields": {"task": name}})

        task = asyncio.create_task(run(), name=name)
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    async def _execute(self, kind: JobKind, job_id: uuid.UUID) -> None:
        s = get_settings()
        interval = max(5.0, s.job_lease_s / 3)

        async def heartbeat() -> None:
            while True:
                await asyncio.sleep(interval)
                if not await renew(kind, job_id, self.owner):
                    return

        ticker = asyncio.create_task(heartbeat())
        try:
            await self._handler(kind)(job_id, self.owner)
        except Exception:
            logger.exception("job_crashed", extra={"fields": {"kind": kind.value, "job_id": str(job_id)}})
        finally:
            ticker.cancel()
            await release(kind, job_id, self.owner)
            self._slots[kind].release()
            self.wake()

    async def fill(self) -> int:
        """Claim as many jobs as free slots allow. Returns the number started."""
        started = 0
        for kind in (JobKind.research, JobKind.document):
            while not self._stopping and not self._slots[kind].locked():
                await self._slots[kind].acquire()
                job_id = await claim_next(kind, self.owner)
                if job_id is None:
                    self._slots[kind].release()
                    break
                task = asyncio.create_task(self._execute(kind, job_id), name=f"{kind.value}:{job_id}")
                self._running.add(task)
                task.add_done_callback(self._running.discard)
                started += 1
        return started

    async def _claim_loop(self) -> None:
        s = get_settings()
        while not self._stopping:
            try:
                await self.fill()
            except Exception:
                logger.exception("job_claim_failed")
            self._wake.clear()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=s.job_poll_interval_s)

    async def _sweep_loop(self) -> None:
        s = get_settings()
        next_retention = 0.0
        while not self._stopping:
            try:
                if any((await sweep()).values()):
                    self.wake()
            except Exception:
                logger.exception("job_sweep_failed")
            if asyncio.get_running_loop().time() >= next_retention:
                next_retention = asyncio.get_running_loop().time() + s.retention_interval_s
                try:
                    await run_retention()
                except Exception:
                    logger.exception("retention_failed")
            await asyncio.sleep(s.job_sweep_interval_s)

    async def start(self) -> None:
        """Startup recovery then background loops. Correctness never depends on these loops staying up:
        anything missed is recovered by the next start/sweep."""
        self._stopping = False
        self._loops = [asyncio.create_task(self._sweep_loop(), name="jobs-sweep"), asyncio.create_task(self._claim_loop(), name="jobs-claim")]

    async def stop(self, grace_s: float = 20.0) -> None:
        self._stopping = True
        self.wake()
        for t in self._loops:
            t.cancel()
        if self._running:
            _, pending = await asyncio.wait(self._running, timeout=grace_s)
            for t in pending:
                t.cancel()
        await expire_owned(self.owner)

    async def drain(self) -> None:
        """Test helper: run every claimable job (and background task) to completion."""
        while True:
            await self.fill()
            if not self._running and not self._background:
                return
            await asyncio.gather(*list(self._running | self._background), return_exceptions=True)


@lru_cache
def get_job_runner() -> JobWorker:
    return JobWorker()
