from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.db.models import ActivityKind, Message, ProjectMember, ProjectRole, ResearchSession, ResearchStatus, Share, StepStatus, User, Visibility
from app.repositories.projects import ActivityRepository
from app.repositories.research import ResearchRepository
from app.research.citations import CitationMapper
from app.research.llm import ResearchLLM
from app.research.state import EvidenceItem
from app.research.status import STEP_BY_KEY, TERMINAL
from app.research.text import title_case_query
from app.schemas.research import (
    CitationOut,
    ClaimOut,
    EvidenceOut,
    FollowUpOut,
    Metrics,
    ReportOut,
    ResearchCreate,
    ResearchCreated,
    ResearchOut,
    ResearchSummaryOut,
    ResearchUpdate,
    ShareOut,
    SourceOut,
    StepOut,
)
from app.services.access import require_project, require_research
from app.services.jobs import JobRunner, get_job_runner
from app.services.llm.factory import get_llm


class ResearchService:
    def __init__(self, db: AsyncSession, jobs: JobRunner | None = None) -> None:
        self.db = db
        self.repo = ResearchRepository(db)
        self.jobs = jobs or get_job_runner()

    # ------------------------------------------------------------ lifecycle

    async def create(self, user: User, data: ResearchCreate) -> ResearchCreated:
        channels = list(data.sources)
        if data.project_id is not None:
            await require_project(self.db, data.project_id, user, ProjectRole.editor)
        else:
            channels = [c for c in channels if c != "project"]
        if not channels:
            raise ValidationFailed("Select at least one source.", code="NO_SOURCES_SELECTED")
        session = await self.repo.create(
            ResearchSession(
                user_id=user.id,
                project_id=data.project_id,
                query=data.query,
                title=title_case_query(data.query)[:300],
                mode=data.mode,
                channels=channels,
                metrics={},
            )
        )
        await self._enqueue(session.id)
        return ResearchCreated(research_id=session.id, status=ResearchStatus.queued)

    async def _enqueue(self, research_id: uuid.UUID) -> None:
        """The job row is the queue entry: commit it, then nudge the worker. A missed nudge is harmless —
        the worker also polls, and restarts recover everything from Neon."""
        await self.db.commit()
        self.jobs.wake()

    async def retry(self, user: User, research_id: uuid.UUID) -> ResearchCreated:
        session = await require_research(self.db, research_id, user, write=True)
        if session.status not in (ResearchStatus.failed, ResearchStatus.cancelled):
            raise ValidationFailed("Only failed or cancelled research can be retried.", code="RESEARCH_NOT_RETRYABLE")
        await self.repo.reset_for_retry(session)
        session.attempts = 0  # a user retry gets a fresh attempt budget
        await self._enqueue(session.id)
        return ResearchCreated(research_id=session.id, status=ResearchStatus.queued)

    async def cancel(self, user: User, research_id: uuid.UUID) -> None:
        session = await require_research(self.db, research_id, user, write=True)
        if session.status not in TERMINAL:
            session.status = ResearchStatus.cancelled
            session.error_code = "CANCELLED"
            session.completed_at = datetime.now(UTC)

    # ---------------------------------------------------------------- reads

    async def list_research(self, user: User, project_id: uuid.UUID | None, limit: int) -> list[ResearchSummaryOut]:
        if project_id is not None:
            await require_project(self.db, project_id, user)
        member_projects = list((await self.db.scalars(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id))).all())
        rows = await self.repo.list_for_user(user.id, member_projects, project_id, limit)
        return [self._summary(r, None) for r in rows]

    async def get(self, user: User, research_id: uuid.UUID) -> ResearchOut:
        return await self.assemble(await require_research(self.db, research_id, user))

    async def get_shared(self, token: str) -> ResearchOut:
        session = await self.repo.by_share_token(token)
        if session is None or session.visibility != Visibility.link or session.status != ResearchStatus.completed:
            raise NotFound("Shared research")
        out = await self.assemble(session)
        return out.model_copy(update={"project_id": None, "saved": False, "follow_ups": []})

    def _summary(self, r: ResearchSession, share_id: str | None) -> ResearchSummaryOut:
        return ResearchSummaryOut(
            id=r.id,
            title=r.title,
            query=r.query,
            mode=r.mode,
            channels=r.channels,  # type: ignore[arg-type]
            project_id=r.project_id,
            status=r.status,
            created_at=r.created_at,
            completed_at=r.completed_at,
            saved=r.saved,
            visibility=r.visibility,
            share_id=share_id,
            metrics=Metrics.model_validate(r.metrics or {}),
            error_code=r.error_code,
        )

    async def assemble(self, r: ResearchSession) -> ResearchOut:
        steps = await self.repo.steps(r.id)
        a = await self.repo.artifacts(r.id)
        cited_order = [c.source_id for c in a["citations"]]
        rest = sorted((s for s in a["sources"] if s.id not in cited_order), key=lambda s: -s.relevance)
        by_id = {s.id: s for s in a["sources"]}
        ordered = [by_id[i] for i in cited_order if i in by_id] + rest
        ev_source = {e.id: e.source_id for e in a["evidence"]}
        claim_ev: dict[uuid.UUID, list[uuid.UUID]] = {}
        for cid, eid in a["links"]:
            claim_ev.setdefault(cid, []).append(eid)
        report = None
        if r.report:
            report = ReportOut.model_validate({**r.report, "citations": [CitationOut(index=c.index, source_id=c.source_id) for c in a["citations"]]})
        done = sum(1 for s in steps if s.status in (StepStatus.complete, StepStatus.skipped))
        messages = await self.repo.messages(r.id)
        return ResearchOut(
            **self._summary(r, await self.repo.share_token(r.id)).model_dump(by_alias=False),
            steps=[StepOut(id=s.key, label=STEP_BY_KEY[s.key].label, status=s.status, detail=s.detail) for s in steps],
            sources=[SourceOut.model_validate(s) for s in ordered],
            source_ids=[s.id for s in ordered],
            evidence=[EvidenceOut.model_validate(e) for e in a["evidence"]],
            claims=[
                ClaimOut(
                    id=c.id,
                    text=c.text,
                    status=c.status,
                    confidence=c.confidence,
                    evidence_ids=claim_ev.get(c.id, []),
                    source_ids=list(dict.fromkeys(ev_source[e] for e in claim_ev.get(c.id, []) if e in ev_source)),
                )
                for c in a["claims"]
            ],
            report=report,
            follow_ups=[
                FollowUpOut(id=m.id, question=m.question, created_at=m.created_at, status="complete" if m.status == "complete" else "running", answer=m.answer)
                for m in messages
            ],
            progress=1.0 if r.status == ResearchStatus.completed else round(done / max(1, len(steps)), 3),
        )

    # -------------------------------------------------------------- updates

    async def update(self, user: User, research_id: uuid.UUID, data: ResearchUpdate) -> ResearchOut:
        session = await require_research(self.db, research_id, user, write=True)
        if data.title is not None:
            session.title = data.title.strip()
        if data.saved is not None:
            session.saved = data.saved
        if data.move_project:
            if data.project_id is not None:
                await require_project(self.db, data.project_id, user, ProjectRole.editor)
            session.project_id = data.project_id
        await self.db.flush()
        return await self.assemble(session)

    async def delete(self, user: User, research_id: uuid.UUID) -> None:
        session = await require_research(self.db, research_id, user, write=True)
        await self.db.delete(session)

    async def delete_all(self, user: User) -> None:
        """Deletes only the caller's own research; research by others in shared projects is untouched."""
        await self.db.execute(delete(ResearchSession).where(ResearchSession.user_id == user.id))

    async def set_visibility(self, user: User, research_id: uuid.UUID, visibility: Visibility) -> ShareOut:
        session = await require_research(self.db, research_id, user, write=True)
        session.visibility = visibility
        share = await self.db.scalar(select(Share).where(Share.research_id == session.id))
        if visibility == Visibility.link:
            if share is None:
                share = Share(research_id=session.id, token=secrets.token_urlsafe(18), created_by=user.id)
                self.db.add(share)
            share.revoked_at = None
            await ActivityRepository(self.db).add(
                user.id, ActivityKind.research_shared, f"Shared “{session.title}”", project_id=session.project_id, detail="Anyone with the link"
            )
        elif share is not None:
            share.revoked_at = datetime.now(UTC)
        await self.db.flush()
        return ShareOut(visibility=visibility, share_id=share.token if share and visibility == Visibility.link else None)

    # ------------------------------------------------------------ follow-ups

    async def follow_up(self, user: User, research_id: uuid.UUID, question: str) -> FollowUpOut:
        session = await require_research(self.db, research_id, user, write=True)
        if session.status != ResearchStatus.completed:
            raise ValidationFailed("Follow-ups are available once research completes.", code="RESEARCH_NOT_COMPLETE")
        conv = await self.repo.conversation(session, create=True)
        assert conv is not None
        msg = Message(conversation_id=conv.id, question=question.strip(), answer=[], status="running")
        self.db.add(msg)
        await self.db.flush()
        out = FollowUpOut(id=msg.id, question=msg.question, created_at=msg.created_at, status="running", answer=[])
        await self.db.commit()
        self.jobs.submit(f"follow_up:{msg.id}", lambda: _answer_follow_up(session.id, msg.id))
        return out


async def _answer_follow_up(research_id: uuid.UUID, message_id: uuid.UUID) -> None:
    """Re-ranks this session's evidence against the follow-up; cites via the session's own citation numbers."""
    from app.db.database import get_sessionmaker

    async with get_sessionmaker()() as db:
        repo = ResearchRepository(db)
        a = await repo.artifacts(research_id)
        msg = await db.get(Message, message_id)
        if msg is None:
            return
        by_source_index = {c.source_id: c.index for c in a["citations"]}
        items = [EvidenceItem(id=f"E{i + 1}", source_key=str(e.source_id), passage=e.passage, relevance=e.relevance) for i, e in enumerate(a["evidence"][:30])]
        paragraphs = await ResearchLLM(get_llm()).follow_up(msg.question, items)
        mapper = CitationMapper([], items)
        rendered = [mapper.render(p, kind="evidence") for p in paragraphs]
        # Re-number to the report's existing citation indices so [n] matches the source panel.
        order = [uuid.UUID(k) for k in mapper.order]
        final = []
        for p in rendered:
            for local, sid in enumerate(order, start=1):
                p = p.replace(f"[{local}]", f"[§{by_source_index.get(sid, 0)}]")
            final.append(p.replace("[§0]", "").replace("[§", "["))
        msg.answer = final
        msg.status = "complete"
        await db.commit()
