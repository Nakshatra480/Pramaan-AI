from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Citation,
    Claim,
    ClaimEvidence,
    Conversation,
    Evidence,
    Message,
    ResearchSession,
    ResearchStatus,
    ResearchStep,
    Share,
    Source,
)
from app.research.state import CitationMap, ClaimItem, EvidenceItem, SourceItem
from app.research.status import STEPS


class ResearchRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ------------------------------------------------------------- sessions

    async def create(self, session: ResearchSession) -> ResearchSession:
        self.db.add(session)
        await self.db.flush()
        self.db.add_all(ResearchStep(research_id=session.id, key=s.key, position=i) for i, s in enumerate(STEPS))
        await self.db.flush()
        return session

    async def reset_for_retry(self, session: ResearchSession) -> None:
        """Clear derived artifacts; keep the question, settings and follow-up thread."""
        for model in (Citation, Claim, Evidence, Source, ResearchStep):
            await self.db.execute(delete(model).where(model.research_id == session.id))
        self.db.add_all(ResearchStep(research_id=session.id, key=s.key, position=i) for i, s in enumerate(STEPS))
        session.status = ResearchStatus.queued
        session.error_code = session.error_message = None
        session.lease_owner = None
        session.lease_expires_at = None
        session.report = None
        session.metrics = {}
        session.started_at = session.completed_at = None
        await self.db.flush()

    async def list_for_user(self, user_id: uuid.UUID, project_ids: list[uuid.UUID], project_id: uuid.UUID | None, limit: int) -> Sequence[ResearchSession]:
        """Own research plus research in projects the user belongs to."""
        stmt = select(ResearchSession).order_by(ResearchSession.created_at.desc()).limit(limit)
        if project_id is not None:
            stmt = stmt.where(ResearchSession.project_id == project_id)
        else:
            stmt = stmt.where((ResearchSession.user_id == user_id) | (ResearchSession.project_id.in_(project_ids)))
        return (await self.db.scalars(stmt)).all()

    async def steps(self, research_id: uuid.UUID) -> Sequence[ResearchStep]:
        return (await self.db.scalars(select(ResearchStep).where(ResearchStep.research_id == research_id).order_by(ResearchStep.position))).all()

    async def source_ids(self, research_id: uuid.UUID) -> list[uuid.UUID]:
        return list((await self.db.scalars(select(Source.id).where(Source.research_id == research_id).order_by(Source.relevance.desc()))).all())

    async def share_token(self, research_id: uuid.UUID) -> str | None:
        return await self.db.scalar(select(Share.token).where(Share.research_id == research_id, Share.revoked_at.is_(None)))

    async def by_share_token(self, token: str) -> ResearchSession | None:
        return await self.db.scalar(
            select(ResearchSession).join(Share, Share.research_id == ResearchSession.id).where(Share.token == token, Share.revoked_at.is_(None))
        )

    # ------------------------------------------------------------ artifacts

    async def upsert_sources(self, research_id: uuid.UUID, sources: list[SourceItem]) -> None:
        """One multi-row upsert (deduplicated by key) instead of a round trip per source."""
        rows: dict[str, dict[str, Any]] = {}
        for s in sources:
            rows[s.key[:600]] = {
                "research_id": research_id,
                "key": s.key[:600],
                "title": s.title,
                "url": s.url,
                "domain": s.domain[:300],
                "publisher": s.publisher[:300],
                "authors": s.authors,
                "published_at": s.published_at,
                "type": s.type,
                "relevance": s.relevance,
                "doi": s.doi,
                "abstract": s.abstract,
                "document_id": s.document_id,
            }
        if not rows:
            return
        base = insert(Source).values(list(rows.values()))
        stmt = base.on_conflict_do_update(constraint="uq_sources_research_key", set_={"relevance": base.excluded.relevance}).returning(Source.key, Source.id)
        ids = {k: i for k, i in (await self.db.execute(stmt)).all()}
        for s in sources:
            s.db_id = ids.get(s.key[:600])

    async def persist_results(
        self,
        session: ResearchSession,
        *,
        evidence: list[EvidenceItem],
        claims: list[ClaimItem],
        citations: list[CitationMap],
        answer: dict[str, Any],
        metrics: dict[str, Any],
    ) -> None:
        """Ids are generated client-side so each table is written in a single flush (few round trips to Neon)."""
        source_ids = {k: v for k, v in (await self.db.execute(select(Source.key, Source.id).where(Source.research_id == session.id))).all()}
        ev_ids: dict[str, uuid.UUID] = {}
        ev_rows = []
        for e in evidence:
            if e.source_key not in source_ids:
                continue
            ev_ids[e.id] = uuid.uuid4()
            ev_rows.append(
                Evidence(
                    id=ev_ids[e.id],
                    research_id=session.id,
                    source_id=source_ids[e.source_key],
                    chunk_id=e.chunk_id,
                    passage=e.passage,
                    location=e.location,
                    relevance=e.relevance,
                )
            )
        claim_ids = {c.id: uuid.uuid4() for c in claims}
        claim_rows = [
            Claim(id=claim_ids[c.id], research_id=session.id, position=i, text=c.text, status=c.status, confidence=c.confidence) for i, c in enumerate(claims)
        ]
        self.db.add_all(ev_rows)
        self.db.add_all(claim_rows)
        await self.db.flush()
        self.db.add_all(ClaimEvidence(claim_id=claim_ids[c.id], evidence_id=ev_ids[e]) for c in claims for e in dict.fromkeys(c.evidence_ids) if e in ev_ids)
        self.db.add_all(Citation(research_id=session.id, index=c.index, source_id=source_ids[c.source_key]) for c in citations if c.source_key in source_ids)
        for f in answer.get("findings", []):
            f["claimIds"] = [str(claim_ids[c]) for c in f.get("claimIds", []) if c in claim_ids]
        session.report = answer
        session.metrics = {**(session.metrics or {}), **metrics}
        session.status = ResearchStatus.completed
        session.completed_at = datetime.now(UTC)
        session.lease_owner, session.lease_expires_at = None, None
        await self.db.flush()

    async def artifacts(self, research_id: uuid.UUID) -> dict[str, Any]:
        sources = (await self.db.scalars(select(Source).where(Source.research_id == research_id))).all()
        evidence = (await self.db.scalars(select(Evidence).where(Evidence.research_id == research_id).order_by(Evidence.relevance.desc()))).all()
        claims = (await self.db.scalars(select(Claim).where(Claim.research_id == research_id).order_by(Claim.position))).all()
        links = (await self.db.execute(select(ClaimEvidence.claim_id, ClaimEvidence.evidence_id).join(Claim).where(Claim.research_id == research_id))).all()
        cites = (await self.db.scalars(select(Citation).where(Citation.research_id == research_id).order_by(Citation.index))).all()
        return {"sources": sources, "evidence": evidence, "claims": claims, "links": links, "citations": cites}

    # ------------------------------------------------------------ follow-ups

    async def conversation(self, session: ResearchSession, create: bool = False) -> Conversation | None:
        conv = await self.db.scalar(select(Conversation).where(Conversation.research_id == session.id))
        if conv is None and create:
            conv = Conversation(research_id=session.id, user_id=session.user_id)
            self.db.add(conv)
            await self.db.flush()
        return conv

    async def messages(self, research_id: uuid.UUID) -> Sequence[Message]:
        return (
            await self.db.scalars(
                select(Message)
                .join(Conversation, Conversation.id == Message.conversation_id)
                .where(Conversation.research_id == research_id)
                .order_by(Message.created_at)
            )
        ).all()
