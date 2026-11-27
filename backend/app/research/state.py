"""Typed LangGraph research state (PRD §16)."""

from __future__ import annotations

import operator
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Annotated, Any, Literal, TypedDict

from app.db.models import ClaimStatus, ResearchMode, SourceType

Channel = Literal["web", "academic", "project", "library"]


@dataclass
class SourceItem:
    key: str  # dedupe key (normalised URL or doc:<id>)
    title: str
    url: str
    domain: str
    publisher: str
    type: SourceType
    snippet: str  # the search API's summary of the result
    relevance: float = 0.0
    authors: list[str] = field(default_factory=list)
    published_at: date | None = None
    doi: str | None = None
    abstract: str | None = None
    document_id: uuid.UUID | None = None
    chunk_id: uuid.UUID | None = None
    location: str | None = None
    db_id: uuid.UUID | None = None  # set once persisted
    passages: list[str] = field(default_factory=list)  # the page's own text, parsed with BeautifulSoup (when it could be read)
    images: list[dict[str, str]] = field(default_factory=list)  # figures found on the page: {"url", "caption"}


@dataclass
class ChunkHit:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    content: str
    score: float
    page: int | None = None


@dataclass
class EvidenceItem:
    id: str  # E1…
    source_key: str
    passage: str
    relevance: float
    location: str | None = None
    chunk_id: uuid.UUID | None = None


@dataclass
class ClaimItem:
    id: str  # C1…
    text: str
    evidence_ids: list[str]
    status: ClaimStatus = ClaimStatus.insufficient_evidence
    confidence: float = 0.0


@dataclass
class ResearchPlan:
    intent: str
    subqueries: list[str]


@dataclass
class ReportDraft:
    """A research paper, before citations are resolved. Text cites verified claims as [C#].

    sections: [{"heading": str, "blocks": [block, …]}] where a block is one of
      {"type": "paragraph", "text": str}
      {"type": "list", "items": [str]}
      {"type": "table", "caption": str, "columns": [str], "rows": [{"cells": [str], "claims": [C#]}]}
      {"type": "diagram", "caption": str, "code": str (Mermaid, built by the server), "claims": [C#]}
      {"type": "figure", "caption": str, "url": str, "credit": str, "page_url": str, "source_key": str}
    """

    title: str
    abstract: list[str]
    sections: list[dict[str, Any]]
    limitations: list[str]
    keywords: list[str] = field(default_factory=list)


@dataclass
class CitationMap:
    index: int
    source_key: str


class ResearchState(TypedDict, total=False):
    research_id: uuid.UUID
    user_id: uuid.UUID
    project_id: uuid.UUID | None
    query: str
    mode: ResearchMode
    channels: list[Channel]
    project_instructions: str | None
    response_length: str  # user preference: concise | balanced | comprehensive
    prior_research: list[str]
    allowed_document_ids: list[uuid.UUID]

    research_plan: ResearchPlan
    subqueries: list[str]

    # Parallel branches append into these.
    sources: Annotated[list[SourceItem], operator.add]
    retrieved_chunks: Annotated[list[ChunkHit], operator.add]
    errors: Annotated[list[str], operator.add]

    evidence: list[EvidenceItem]
    claims: list[ClaimItem]
    verified_claims: list[ClaimItem]
    draft: ReportDraft
    answer: dict[str, object]
    citations: list[CitationMap]
    metadata: dict[str, object]


# Per-mode research budgets. `cited` is the target number of cited sources in the finished report (about 10 / 35 / 50);
# `max_sources` caps how many distinct sources evidence may come from (so a report lands near its target rather than
# far above it); the other limits are sized to reach it: enough distinct sources found (web + Wikipedia + scholarly), enough of
# their pages read, evidence spread across them, and claims that list every source that supports them.
MODE_LIMITS: dict[ResearchMode, dict[str, int]] = {
    ResearchMode.quick: {
        "cited": 10, "subqueries": 2, "web": 7, "academic": 4, "academic_queries": 1, "wikipedia": 2, "wikipedia_queries": 1,
        "read": 8, "chunks": 6, "evidence": 18, "max_sources": 12, "claims": 8, "corroborate": 2,
    },
    ResearchMode.standard: {
        "cited": 35, "subqueries": 4, "web": 12, "academic": 8, "academic_queries": 2, "wikipedia": 4, "wikipedia_queries": 2,
        "read": 22, "chunks": 10, "evidence": 56, "max_sources": 42, "claims": 20, "corroborate": 4,
    },
    ResearchMode.deep: {
        "cited": 50, "subqueries": 6, "web": 14, "academic": 10, "academic_queries": 3, "wikipedia": 6, "wikipedia_queries": 3,
        "read": 30, "chunks": 16, "evidence": 80, "max_sources": 60, "claims": 28, "corroborate": 5,
    },
}  # fmt: skip
