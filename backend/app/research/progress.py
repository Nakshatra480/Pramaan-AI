"""ProgressReporter — persists step/status/metric updates (read by the SSE stream)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.core.config import get_settings
from app.db.database import get_sessionmaker
from app.db.models import ResearchSession, ResearchStatus, ResearchStep, StepStatus
from app.research.status import STEP_BY_KEY, can_transition
from app.services import progress_events


class ResearchCancelled(Exception):
    pass


class LeaseLost(Exception):
    """Another worker now owns this job (our lease expired and it was recovered)."""


class ProgressReporter:
    def __init__(self, research_id: uuid.UUID, owner: str | None = None) -> None:
        self.research_id = research_id
        self.owner = owner

    async def _update(self, key: str, status: StepStatus, detail: str | None, metrics: dict[str, Any] | None) -> None:
        async with get_sessionmaker()() as db:
            session = await db.get(ResearchSession, self.research_id, with_for_update=True)
            if session is None or session.status == ResearchStatus.cancelled:
                raise ResearchCancelled
            if self.owner is not None:
                if session.lease_owner != self.owner:
                    raise LeaseLost
                # Every progress write doubles as a lease heartbeat.
                session.lease_expires_at = datetime.now(UTC) + timedelta(seconds=get_settings().job_lease_s)
                session.heartbeat_at = datetime.now(UTC)
            step = await db.scalar(select(ResearchStep).where(ResearchStep.research_id == self.research_id, ResearchStep.key == key))
            now = datetime.now(UTC)
            if step:
                if status == StepStatus.active and step.started_at is None:
                    step.started_at = now
                if status in (StepStatus.complete, StepStatus.skipped, StepStatus.failed):
                    step.completed_at = now
                    if step.started_at:
                        step.duration_ms = int((now - step.started_at).total_seconds() * 1000)
                step.status = status
                if detail is not None:
                    step.detail = detail[:300]
            target = STEP_BY_KEY[key].status
            if status == StepStatus.active and can_transition(session.status, target):
                session.status = target
            if metrics:
                session.metrics = {**(session.metrics or {}), **metrics}
            await db.commit()
        await progress_events.publish(self.research_id)  # wake SSE streams (no-op without Redis)

    async def start(self, key: str, detail: str | None = None, **metrics: Any) -> None:
        await self._update(key, StepStatus.active, detail, metrics)

    async def complete(self, key: str, detail: str | None = None, **metrics: Any) -> None:
        await self._update(key, StepStatus.complete, detail, metrics)

    async def skip(self, key: str, detail: str) -> None:
        await self._update(key, StepStatus.skipped, detail, None)
