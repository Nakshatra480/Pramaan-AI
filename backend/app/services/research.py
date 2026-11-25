from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.db.models import ActivityKind, Message, ProjectMember, ProjectRole, ResearchSession, ResearchStatus, Share, StepStatus, User, Visibility
from app.repositories.projects import ActivityRepository
from app.repositories.research import ResearchRepository
from app.research.citations import CitationMapper
from app.research.follow_ups import build_evidence, parse_intent, revision_title, search_fresh
from app.research.status import STEP_BY_KEY, TERMINAL
from app.research.text import title_case_query
from app.schemas.research import (
    CitationOut,
    ClaimOut,
    EvidenceOut,
    FollowUpOut,
    FollowUpSource,
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

logger = logging.getLogger("pramaan.research")


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
            parent_id=r.parent_id,
            revision_instructions=r.revision_instructions,
        )

    async def assemble(self, r: ResearchSession) -> ResearchOut:
        a = await self.repo.detail(r.id)  # one round trip for everything below
        steps = a["steps"]
        by_id = {str(s.id): s for s in a["sources"]}
        ordered = [by_id[str(i)] for i in source_order(a)]
        ev_source = {str(e.id): e.source_id for e in a["evidence"]}
        claim_ev: dict[str, list[str]] = {}
        for cid, eid in a["links"]:
            claim_ev.setdefault(str(cid), []).append(str(eid))
        report = None
        if r.report:
            report = ReportOut.model_validate({**r.report, "citations": [CitationOut(index=c.index, source_id=c.source_id) for c in a["citations"]]})
        done = sum(1 for s in steps if s.status in (StepStatus.complete, StepStatus.skipped))
        return ResearchOut(
            **self._summary(r, a["share_token"]).model_dump(by_alias=False),
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
                    evidence_ids=[uuid.UUID(e) for e in claim_ev.get(str(c.id), [])],
                    source_ids=list(dict.fromkeys(ev_source[e] for e in claim_ev.get(str(c.id), []) if e in ev_source)),
                )
                for c in a["claims"]
            ],
            report=report,
            follow_ups=[follow_up_out(m) for m in a["messages"]],
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
        """Records the follow-up and routes it in the background: a request to change the report becomes a new
        research session (the original is never edited); a question is answered with fresh search."""
        session = await require_research(self.db, research_id, user, write=True)
        if session.status != ResearchStatus.completed:
            raise ValidationFailed("Follow-ups are available once research completes.", code="RESEARCH_NOT_COMPLETE")
        conv = await self.repo.conversation(session, create=True)
        assert conv is not None
        msg = Message(conversation_id=conv.id, question=question.strip(), answer=[], status="running", kind="answer", sources=[])
        self.db.add(msg)
        await self.db.flush()
        out = follow_up_out(msg)
        await self.db.commit()
        self.jobs.submit(f"follow_up:{msg.id}", lambda: _handle_follow_up(session.id, msg.id, user.id))
        return out


FOLLOW_UP_FAILED = "Pramaan couldn't answer this follow-up because the research engine is busy or unavailable. Please ask again in a moment."
NO_ANSWER = "Neither this research nor a fresh search found evidence that answers that. Try rephrasing, or start a new research on it."


def follow_up_out(m: Message) -> FollowUpOut:
    return FollowUpOut(
        id=m.id,
        question=m.question,
        created_at=m.created_at,
        status="complete" if m.status == "complete" else "failed" if m.status == "failed" else "running",
        answer=m.answer or [],
        kind="revision" if m.kind == "revision" else "answer",
        revision_id=m.revision_id,
        sources=[FollowUpSource.model_validate(x) for x in (m.sources or []) if isinstance(x, dict)],
    )


def source_order(a: dict[str, Any]) -> list[uuid.UUID]:
    """Source ids in the order the report's side panel numbers them (cited first, then by relevance)."""
    cited = list(dict.fromkeys(str(c.source_id) for c in a["citations"]))
    rest = [s.id for s in sorted((s for s in a["sources"] if str(s.id) not in cited), key=lambda s: -s.relevance)]
    known = {str(s.id): s.id for s in a["sources"]}
    return [known[i] for i in cited if i in known] + rest


async def _handle_follow_up(research_id: uuid.UUID, message_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Classifies the follow-up and runs the matching workflow. Never leaves the message running."""
    from app.db.database import get_sessionmaker
    from app.research import runner

    async with get_sessionmaker()() as db:
        msg = await db.get(Message, message_id)
        parent = await db.get(ResearchSession, research_id)
        if msg is None or parent is None:
            return
        try:
            repo = ResearchRepository(db)
            deps = runner.default_deps(research_id)  # same providers as research runs (tests inject fakes here)
            history = [(m.question, " ".join(m.answer)) for m in await repo.messages(research_id) if m.id != msg.id and m.status == "complete"]
            summary = list((parent.report or {}).get("summary") or [])
            topic = parent.title or parent.query
            raw = await deps.llm.classify_follow_up(msg.question, topic, summary, history)
            intent = parse_intent(raw, msg.question, topic)
            log_fields = {"research_id": str(research_id), "intent": intent.kind, "classified_by": "model" if raw is not None else "heuristic"}
            logger.info("follow_up_routed", extra={"fields": log_fields})
            if intent.kind == "revise":
                await _start_revision(db, parent, msg, user_id, intent.instructions)
            else:
                await _answer_with_search(db, repo, deps, parent, msg, intent.search_query, history, summary)
        except Exception:
            logger.exception("follow_up_failed", extra={"fields": {"research_id": str(research_id)}})
            await db.rollback()
            msg = await db.get(Message, message_id)
            if msg is None:
                return
            msg.answer, msg.status = [FOLLOW_UP_FAILED], "failed"
        await db.commit()
    if msg is not None and msg.revision_id:
        get_job_runner().wake()  # the revision is queued like any research job


async def _start_revision(db: AsyncSession, parent: ResearchSession, msg: Message, user_id: uuid.UUID, instructions: str) -> None:
    """Regenerates the report with the requested changes as a new research session linked to the original."""
    child = await ResearchRepository(db).create(
        ResearchSession(
            user_id=user_id,
            project_id=parent.project_id,
            query=parent.query,
            title=revision_title(parent.title),
            mode=parent.mode,
            channels=list(parent.channels),
            metrics={},
            parent_id=parent.id,
            revision_instructions=instructions,
        )
    )
    msg.kind = "revision"
    msg.revision_id = child.id
    msg.answer = [f"Regenerating the report with your changes: {instructions}"]
    msg.status = "complete"  # the thread entry is done; the revision runs (and can be retried) as its own research job


async def _answer_with_search(
    db: AsyncSession,
    repo: ResearchRepository,
    deps: Any,
    parent: ResearchSession,
    msg: Message,
    search_query: str,
    history: list[tuple[str, str]],
    summary: list[str],
) -> None:
    """Answers from the report's evidence plus a fresh Tavily (web, pages read in full), Wikipedia and OpenAlex
    (scholarly) search for the question.
    Citations [n] number this answer's own source list: report sources keep a link to the side panel."""
    a = await repo.artifacts(parent.id)
    fresh, errors = await search_fresh(deps.web, deps.academic, search_query, wikipedia=getattr(deps, "wikipedia", None), reader=getattr(deps, "reader", None))
    report_sources = {str(s.id): s for s in a["sources"]}
    items, candidates = build_evidence(msg.question, list(a["evidence"]), report_sources, fresh)
    paragraphs = await deps.llm.follow_up(msg.question, items, history, context=" ".join(summary) or None)
    mapper = CitationMapper([], items)
    rendered = [p for p in (mapper.render(p, kind="evidence") for p in paragraphs) if p.strip()]
    msg.answer = rendered or [NO_ANSWER]
    msg.sources = [candidates[k].out() for k in mapper.order if k in candidates] if rendered else []
    msg.status = "complete"
    if errors:
        logger.info("follow_up_search_degraded", extra={"fields": {"research_id": str(parent.id), "errors": errors}})
