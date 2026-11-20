"""Server-Sent Events for research progress (PRD §26).

Reads the database (the source of truth), so it works across instances and
survives reconnects. With Redis, it re-reads when a change notice arrives;
without Redis it polls. Emits only operational progress — never model output.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

from app.db.database import get_sessionmaker
from app.db.models import ResearchSession, ResearchStatus, StepStatus
from app.repositories.research import ResearchRepository
from app.research.status import STEP_BY_KEY, TERMINAL
from app.schemas.research import Metrics, ProgressEvent, StepOut
from app.services import progress_events

EVENT_BY_STATUS = {
    ResearchStatus.queued: "research.started",
    ResearchStatus.planning: "research.planning",
    ResearchStatus.searching: "research.searching",
    ResearchStatus.retrieving: "research.searching",
    ResearchStatus.extracting: "research.reading",
    ResearchStatus.verifying: "research.verifying",
    ResearchStatus.synthesizing: "research.synthesizing",
    ResearchStatus.citing: "research.citations",
    ResearchStatus.completed: "research.completed",
    ResearchStatus.failed: "research.failed",
    ResearchStatus.cancelled: "research.cancelled",
}


async def snapshot(research_id: uuid.UUID) -> ProgressEvent | None:
    async with get_sessionmaker()() as db:
        r = await db.get(ResearchSession, research_id)
        if r is None:
            return None
        repo = ResearchRepository(db)
        steps = await repo.steps(r.id)
        source_ids = await repo.source_ids(r.id)
    done = sum(1 for s in steps if s.status in (StepStatus.complete, StepStatus.skipped))
    active = next((s for s in steps if s.status == StepStatus.active), None)
    if r.status == ResearchStatus.completed:
        message, progress = "Research complete.", 100
    elif r.status in (ResearchStatus.failed, ResearchStatus.cancelled):
        message, progress = r.error_message or "Research stopped.", int(done / max(1, len(steps)) * 100)
    else:
        message = (active.detail or STEP_BY_KEY[active.key].label + "…") if active else "Queued…"
        progress = int(done / max(1, len(steps)) * 100)
    return ProgressEvent(
        type=EVENT_BY_STATUS[r.status],
        status=r.status,
        message=message,
        progress=progress,
        steps=[StepOut(id=s.key, label=STEP_BY_KEY[s.key].label, status=s.status, detail=s.detail) for s in steps],
        metrics=Metrics.model_validate(r.metrics or {}),
        source_ids=source_ids,
    )


def _sse(event: ProgressEvent, seq: int) -> str:
    return f"id: {seq}\nevent: {event.type}\ndata: {json.dumps(event.model_dump(mode='json', by_alias=True))}\n\n"


async def stream_events(
    research_id: uuid.UUID,
    is_disconnected: Callable[[], Awaitable[bool]],
    *,
    interval_s: float = 0.5,
    safety_poll_s: float = 3.0,
    heartbeat_s: float = 15,
    max_duration_s: float = 900,
) -> AsyncIterator[str]:
    """With Redis: re-read on each change notice (plus a slow safety poll for writers that don't publish).
    Without Redis, or if the subscription drops: poll the database every `interval_s`."""
    last = None
    seq = 0
    started = last_sent = time.monotonic()
    yield "retry: 2000\n\n"
    async with progress_events.subscription(research_id) as wait:
        while time.monotonic() - started < max_duration_s:
            if await is_disconnected():
                return
            event = await snapshot(research_id)
            if event is None:
                return
            payload = event.model_dump_json()
            if payload != last:
                seq += 1
                last = payload
                last_sent = time.monotonic()
                yield _sse(event, seq)
                if event.status in TERMINAL:
                    return
            elif time.monotonic() - last_sent > heartbeat_s:
                last_sent = time.monotonic()
                yield ": keep-alive\n\n"
            if wait is None:
                await asyncio.sleep(interval_s)
            else:
                try:
                    await wait(safety_poll_s)
                except ConnectionError:
                    wait = None  # Redis dropped mid-stream: keep going by polling
