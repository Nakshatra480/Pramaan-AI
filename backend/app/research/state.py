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
    snippet: str  # text available for evidence extraction
    relevance: float = 0.0
    authors: list[str] = field(default_factory=list)
    published_at: date | None = None
    doi: str | None = None
    abstract: str | None = None
    document_id: uuid.UUID | None = None
    chunk_id: uuid.UUID | None = None
    location: str | None = None
    db_id: uuid.UUID | None = None  # set once persisted


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
    summary: list[str]
    findings: list[dict[str, Any]]  # {title, body, claims: [C#]}
    analysis: list[dict[str, Any]]  # {heading, paragraphs}
    limitations: list[str]


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


MODE_LIMITS: dict[ResearchMode, dict[str, int]] = {
    ResearchMode.quick: {"subqueries": 2, "web": 5, "academic": 3, "chunks": 6, "evidence": 12, "claims": 6},
    ResearchMode.standard: {"subqueries": 3, "web": 6, "academic": 5, "chunks": 10, "evidence": 24, "claims": 10},
    ResearchMode.deep: {"subqueries": 5, "web": 8, "academic": 8, "chunks": 16, "evidence": 40, "claims": 16},
}
