from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.db.models import ClaimStatus, ResearchMode, ResearchStatus, SourceType, StepStatus, Visibility
from app.schemas.common import ApiModel

Channel = Literal["web", "academic", "project", "library"]


class ResearchCreate(ApiModel):
    query: str = Field(min_length=8, max_length=2000)
    project_id: uuid.UUID | None = None
    mode: ResearchMode = ResearchMode.standard
    sources: list[Channel] = Field(default_factory=lambda: list[Channel](["web", "academic"]), min_length=1, max_length=4)

    @field_validator("query")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 8:
            raise ValueError("Ask a complete question.")
        return v

    @field_validator("sources")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class ResearchCreated(ApiModel):
    research_id: uuid.UUID
    status: ResearchStatus


class Metrics(ApiModel):
    sources: int = 0
    evidence: int = 0
    candidate_claims: int = 0
    verified_claims: int = 0


class StepOut(ApiModel):
    id: str
    label: str
    status: StepStatus
    detail: str | None = None


class SourceOut(ApiModel):
    id: uuid.UUID
    title: str
    domain: str
    url: str
    publisher: str
    authors: list[str]
    published_at: date | None
    type: SourceType
    relevance: float
    doi: str | None
    abstract: str | None


class EvidenceOut(ApiModel):
    id: uuid.UUID
    source_id: uuid.UUID
    passage: str
    relevance: float
    location: str | None


class ClaimOut(ApiModel):
    id: uuid.UUID
    text: str
    status: ClaimStatus
    confidence: float
    source_ids: list[uuid.UUID]
    evidence_ids: list[uuid.UUID]


class CitationOut(ApiModel):
    index: int
    source_id: uuid.UUID


class KeyFinding(ApiModel):
    title: str
    body: str
    claim_ids: list[uuid.UUID] = []


class ReportSection(ApiModel):
    heading: str
    paragraphs: list[str]


class ReportOut(ApiModel):
    summary: list[str]
    findings: list[KeyFinding]
    analysis: list[ReportSection]
    limitations: list[str]
    citations: list[CitationOut]


class FollowUpOut(ApiModel):
    id: uuid.UUID
    question: str
    created_at: datetime
    status: Literal["running", "complete"]
    answer: list[str]


class ResearchSummaryOut(ApiModel):
    id: uuid.UUID
    title: str
    query: str
    mode: ResearchMode
    channels: list[Channel]
    project_id: uuid.UUID | None
    status: ResearchStatus
    created_at: datetime
    completed_at: datetime | None
    saved: bool
    visibility: Visibility
    share_id: str | None
    metrics: Metrics
    error_code: str | None = None


class ResearchOut(ResearchSummaryOut):
    steps: list[StepOut]
    sources: list[SourceOut]
    source_ids: list[uuid.UUID]
    evidence: list[EvidenceOut]
    claims: list[ClaimOut]
    report: ReportOut | None
    follow_ups: list[FollowUpOut]
    progress: float


class ResearchUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    saved: bool | None = None
    project_id: uuid.UUID | None = None
    move_project: bool = False  # explicit flag so `projectId: null` can mean "remove from project"


class ShareUpdate(ApiModel):
    visibility: Visibility


class ShareOut(ApiModel):
    visibility: Visibility
    share_id: str | None


class FollowUpCreate(ApiModel):
    question: str = Field(min_length=3, max_length=1000)


class ProgressEvent(ApiModel):
    """Safe operational progress — never model reasoning."""

    type: str
    status: ResearchStatus
    message: str
    progress: int
    steps: list[StepOut]
    metrics: Metrics
    source_ids: list[uuid.UUID]
