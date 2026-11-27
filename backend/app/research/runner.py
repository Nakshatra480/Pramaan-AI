"""Executes a research session in the background.

Everything it needs is loaded from the database by id, so the same entrypoint
can be driven by an in-process task today or a queue worker (Cloud Tasks /
Pub/Sub) later. Only safe error codes reach the user.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from datetime import UTC, datetime
from functools import lru_cache

from sqlalchemy import or_, select

from app.core.config import get_settings
from app.core.logging import log, research_id_var
from app.db.database import get_sessionmaker
from app.db.models import ActivityKind, Document, DocumentChunk, DocumentStatus, ProjectDocument, ProjectMember, ResearchSession, ResearchStatus
from app.repositories.projects import ActivityRepository
from app.repositories.research import ResearchRepository
from app.research.deps import ResearchDeps
from app.research.follow_ups import revision_context, revision_length
from app.research.graph import build_graph
from app.research.llm import ResearchLLM
from app.research.nodes.evidence import NoSourcesFound
from app.research.progress import LeaseLost, ProgressReporter, ResearchCancelled
from app.research.state import ChunkHit, ResearchState, SourceItem
from app.research.status import ErrorCode
from app.services import progress_events
from app.services.content.images import HttpImageVerifier
from app.services.content.reader import NoReader, PageReader, WebPageReader
from app.services.embeddings import EmbeddingService
from app.services.llm.base import ProviderError
from app.services.llm.factory import get_embedder, get_llm
from app.services.retrieval import HybridRetriever
from app.services.search.openalex import OpenAlexService
from app.services.search.tavily import TavilyService
from app.services.search.wikipedia import WikipediaService

logger = logging.getLogger("pramaan.research")

USER_MESSAGES = {
    ErrorCode.NO_SOURCES: "Pramaan couldn't find enough relevant sources.",
    ErrorCode.TIMEOUT: "Research took longer than expected.",
    ErrorCode.PROVIDER_UNAVAILABLE: "A research provider is unavailable right now.",
    ErrorCode.MODEL_UNAVAILABLE: "Pramaan's research engine is offline right now. Your question is saved — retry when it's back.",
    ErrorCode.MODEL_TIMEOUT: "The research engine took too long to respond. Please retry.",
    ErrorCode.MODEL_NOT_INSTALLED: "The research engine is missing a required model. Please retry after it's installed.",
    ErrorCode.MODEL_OUT_OF_MEMORY: "The research engine ran out of memory. Please retry shortly.",
    ErrorCode.INTERRUPTED: "Research was interrupted before it could finish.",
    ErrorCode.INTERNAL: "Pramaan couldn't complete this research.",
}


async def _retrieve(query: str, doc_ids: list[uuid.UUID], limit: int) -> list[ChunkHit]:
    async with get_sessionmaker()() as db:
        return await HybridRetriever(db).search(query, doc_ids, limit)


async def _persist_sources(research_id: uuid.UUID, sources: list[SourceItem]) -> None:
    async with get_sessionmaker()() as db:
        await ResearchRepository(db).upsert_sources(research_id, sources)
        await db.commit()


@lru_cache
def _web() -> TavilyService:
    """One client per process (connection pooling) instead of a new, never-closed client per research run."""
    return TavilyService(get_settings().tavily_api_key.get_secret_value())


@lru_cache
def _academic() -> OpenAlexService:
    return OpenAlexService(get_settings().openalex_mailto)


@lru_cache
def _wikipedia() -> WikipediaService:
    s = get_settings()
    return WikipediaService(s.wikipedia_api_key.get_secret_value(), language=s.wikipedia_language, user_agent=s.wikipedia_user_agent)


def _reader() -> PageReader:
    s = get_settings()
    return WebPageReader(timeout_s=s.page_fetch_timeout_s) if s.page_reading_enabled else NoReader()


def default_deps(research_id: uuid.UUID) -> ResearchDeps:
    return ResearchDeps(
        llm=ResearchLLM(get_llm()),  # Groq: text generation
        embeddings=EmbeddingService(get_embedder()),  # OpenRouter: embeddings
        web=_web(),
        academic=_academic(),
        retrieve=_retrieve,
        reporter=ProgressReporter(research_id),
        persist_sources=_persist_sources,
        read_documents=_read_documents,
        wikipedia=_wikipedia(),
        reader=_reader(),
        images=HttpImageVerifier(),
    )


async def _context(research: ResearchSession) -> tuple[str | None, list[uuid.UUID], list[str]]:
    """Project instructions, authorised document scope and prior research titles."""
    async with get_sessionmaker()() as db:
        doc_ids: set[uuid.UUID] = set()
        instructions: str | None = None
        prior: list[str] = []
        ready = Document.status == DocumentStatus.ready
        if "library" in research.channels:
            doc_ids |= set((await db.scalars(select(Document.id).where(Document.user_id == research.user_id, ready))).all())
        if research.project_id:
            member = await db.scalar(
                select(ProjectMember.role).where(ProjectMember.project_id == research.project_id, ProjectMember.user_id == research.user_id)
            )
            if member is not None:
                from app.db.models import Project

                project = await db.get(Project, research.project_id)
                instructions = (project.instruction.content if project and project.instruction else None) or None
                if "project" in research.channels:
                    doc_ids |= set(
                        (
                            await db.scalars(select(ProjectDocument.document_id).join(Document).where(ProjectDocument.project_id == research.project_id, ready))
                        ).all()
                    )
                prior = list(
                    (
                        await db.scalars(
                            select(ResearchSession.title)
                            .where(
                                ResearchSession.project_id == research.project_id,
                                ResearchSession.status == ResearchStatus.completed,
                                ResearchSession.id != research.id,
                            )
                            .order_by(ResearchSession.created_at.desc())
                            .limit(5)
                        )
                    ).all()
                )
        if research.focus_document_ids:
            # "Research with this": exactly the chosen documents (still only those this user may read).
            shared = select(ProjectDocument.document_id).join(ProjectMember, ProjectMember.project_id == ProjectDocument.project_id)
            readable = (
                await db.scalars(
                    select(Document.id).where(
                        Document.id.in_(research.focus_document_ids),
                        ready,
                        or_(Document.user_id == research.user_id, Document.id.in_(shared.where(ProjectMember.user_id == research.user_id))),
                    )
                )
            ).all()
            doc_ids = set(readable)
        return instructions, sorted(doc_ids), prior


async def _focus_note(document_ids: list[uuid.UUID]) -> str:
    """Guidance for the planner and writer when research is built from the user's own documents."""
    async with get_sessionmaker()() as db:
        titles = list((await db.scalars(select(Document.title).where(Document.id.in_(document_ids)))).all())
    names = ", ".join(f"“{t}”" for t in titles[:5]) or "the selected documents"
    return (
        f"This research is built from the user's document(s) {names}. Present what these documents say first and organise the paper "
        "around their content; use web or scholarly sources only to add context or corroboration, never to replace them."
    )


async def _read_documents(doc_ids: list[uuid.UUID], limit: int) -> list[ChunkHit]:
    """The documents' passages in reading order (up to `limit` + 1), for research built from those documents."""
    async with get_sessionmaker()() as db:
        rows = (
            await db.execute(
                select(DocumentChunk.id, DocumentChunk.document_id, Document.title, DocumentChunk.content, DocumentChunk.meta)
                .join(Document, Document.id == DocumentChunk.document_id)
                .where(DocumentChunk.document_id.in_(doc_ids))
                .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
                .limit(limit + 1)
            )
        ).all()
    # One more than asked for: the caller can tell "fits" from "too long to read in full".
    return [
        ChunkHit(chunk_id=r[0], document_id=r[1], document_title=r[2], content=r[3], score=1.0 - i / (2 * max(1, len(rows))), page=(r[4] or {}).get("page"))
        for i, r in enumerate(rows)
    ]


async def _response_length(user_id: uuid.UUID) -> str:
    """Settings → Research → Response length (stored in the user's preferences)."""
    from app.db.models import User

    async with get_sessionmaker()() as db:
        prefs = await db.scalar(select(User.preferences).where(User.id == user_id))
    value = (prefs or {}).get("responseLength")
    return value if value in ("concise", "balanced", "comprehensive") else "balanced"


async def _parent_summary(parent_id: uuid.UUID | None) -> list[str]:
    if parent_id is None:
        return []
    async with get_sessionmaker()() as db:
        report = await db.scalar(select(ResearchSession.report).where(ResearchSession.id == parent_id))
    return list((report or {}).get("summary") or [])


async def _fail(research_id: uuid.UUID, code: str, owner: str | None = None) -> None:
    async with get_sessionmaker()() as db:
        r = await db.get(ResearchSession, research_id, with_for_update=True)
        if r is None or r.status in (ResearchStatus.cancelled, ResearchStatus.completed):
            return
        if owner is not None and r.lease_owner not in (owner, None):
            return  # another worker owns it now
        r.status = ResearchStatus.failed
        r.error_code = code
        r.error_message = USER_MESSAGES.get(code, USER_MESSAGES[ErrorCode.INTERNAL])
        r.completed_at = datetime.now(UTC)
        r.lease_owner, r.lease_expires_at = None, None
        await db.commit()
    await progress_events.publish(research_id)


def _model_code(e: ProviderError) -> str:
    return e.code if e.code in USER_MESSAGES else ErrorCode.MODEL_UNAVAILABLE


async def run_research(research_id: uuid.UUID, owner: str | None = None) -> None:
    """Run one claimed research job. `owner` is the lease holder (None only in legacy/direct calls)."""
    token = research_id_var.set(str(research_id))
    start = time.perf_counter()
    settings = get_settings()
    if settings.langsmith_api_key.get_secret_value():
        os.environ.setdefault("LANGSMITH_TRACING", "true")
        os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key.get_secret_value())
    try:
        async with get_sessionmaker()() as db:
            research = await db.get(ResearchSession, research_id)
            if research is None or research.status != ResearchStatus.queued:
                return
            if owner is not None and research.lease_owner != owner:
                return  # not ours (duplicate delivery or lost lease)
            research.started_at = datetime.now(UTC)
            await db.commit()

        instructions, doc_ids, prior = await _context(research)
        focus = [d for d in research.focus_document_ids if d in set(doc_ids)]
        if focus:
            note = await _focus_note(focus)
            instructions = f"{note}\n\n{instructions}" if instructions else note
        length = await _response_length(research.user_id)
        if research.revision_instructions:
            # A revision (asked as a follow-up): same question, regenerated with the user's requested changes.
            instructions = revision_context(research.revision_instructions, await _parent_summary(research.parent_id), instructions)
            length = revision_length(research.revision_instructions, length)
        state: ResearchState = {
            "research_id": research.id,
            "user_id": research.user_id,
            "project_id": research.project_id,
            "query": research.query,
            "mode": research.mode,
            "channels": list(research.channels),  # type: ignore[typeddict-item,arg-type]
            "project_instructions": instructions,
            "response_length": length,
            "prior_research": prior,
            "allowed_document_ids": doc_ids,
            "focus_document_ids": focus,
            "sources": [],
            "retrieved_chunks": [],
            "errors": [],
            "metadata": {},
        }
        deps = default_deps(research_id)  # tests monkeypatch this to inject fakes
        deps.reporter.owner = owner
        # Fail fast (with a specific, retryable code) if a model provider is down, misconfigured or missing the model.
        await deps.llm.provider.preflight()
        # Embeddings only sharpen ranking: an embedding outage degrades the run (recorded and shown
        # as a limitation) instead of failing it (audit C-02).
        try:
            await deps.embeddings.provider.preflight()
        except ProviderError as e:
            log(logger, logging.WARNING, "embedding_preflight_failed", code=e.code)
            state["errors"] = [*state.get("errors", []), "semantic_ranking_unavailable"]
        async with asyncio.timeout(settings.research_timeout_s):
            final = await build_graph().ainvoke(
                state,
                config={
                    "configurable": {"deps": deps},
                    "run_name": "pramaan_research",
                    "metadata": {"research_id": str(research_id)},
                    "tags": [research.mode.value],
                },
            )

        async with get_sessionmaker()() as db:
            session = await db.get(ResearchSession, research_id, with_for_update=True)
            if session is None or session.status == ResearchStatus.cancelled:
                return
            if owner is not None and session.lease_owner != owner:
                return  # lease lost mid-run: the recovered attempt owns the outcome
            sources = final.get("metadata", {}).get("sources", [])
            await ResearchRepository(db).persist_results(
                session,
                evidence=final["evidence"],
                claims=final["verified_claims"],
                citations=final["citations"],
                answer=final["answer"],
                metrics={"sources": len(sources), "evidence": len(final["evidence"]), "warnings": sorted(set(final.get("errors", [])))},
            )
            verified = session.metrics.get("verifiedClaims", 0)
            await ActivityRepository(db).add(
                session.user_id,
                ActivityKind.research_completed,
                session.title,
                project_id=session.project_id,
                detail=f"{len(sources)} sources · {verified} verified claims",
                href=f"/research/{session.id}",
            )
            await db.commit()
        await progress_events.publish(research_id)
        log(logger, logging.INFO, "research_completed", duration_ms=round((time.perf_counter() - start) * 1000), warnings=final.get("errors", []))
    except ResearchCancelled:
        log(logger, logging.INFO, "research_cancelled")
    except NoSourcesFound:
        await _fail(research_id, ErrorCode.NO_SOURCES, owner)
    except TimeoutError:
        await _fail(research_id, ErrorCode.TIMEOUT, owner)
    except LeaseLost:
        log(logger, logging.WARNING, "research_lease_lost")
    except ProviderError as e:
        log(logger, logging.WARNING, "research_model_error", error=str(e), code=e.code)
        await _fail(research_id, _model_code(e), owner)
    except Exception:
        logger.exception("research_failed")
        await _fail(research_id, ErrorCode.INTERNAL, owner)
    finally:
        research_id_var.reset(token)
