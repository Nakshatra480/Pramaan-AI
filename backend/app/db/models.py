"""SQLAlchemy 2.x ORM models — the Neon PostgreSQL schema (PRD §21, §72).

Ownership columns (`user_id`, `owner_id`) are on every private table so that
repository queries can always scope by the authenticated user.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 768  # embedding vectors are stored at 768 dimensions; changing this requires a migration.


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSONB, uuid.UUID: UUID(as_uuid=True)}


def _enum(e: type[StrEnum], name: str) -> Enum:
    # Stored as VARCHAR + CHECK so adding values doesn't need ALTER TYPE.
    return Enum(e, name=name, native_enum=False, length=32, values_callable=lambda x: [m.value for m in x])


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


# ----------------------------------------------------------------- enums


class ProjectRole(StrEnum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class Visibility(StrEnum):
    private = "private"
    link = "link"


class ResearchMode(StrEnum):
    quick = "quick"
    standard = "standard"
    deep = "deep"


class ResearchStatus(StrEnum):
    """Explicit research state machine (see app.research.status)."""

    queued = "queued"
    planning = "planning"
    searching = "searching"
    retrieving = "retrieving"
    extracting = "extracting"
    verifying = "verifying"
    synthesizing = "synthesizing"
    citing = "citing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    interrupted = "interrupted"  # lease expired (restart/crash); requeued or failed by the sweeper


class StepStatus(StrEnum):
    pending = "pending"
    active = "active"
    complete = "complete"
    skipped = "skipped"
    failed = "failed"


class ClaimStatus(StrEnum):
    supported = "supported"
    partially_supported = "partially_supported"
    unsupported = "unsupported"
    insufficient_evidence = "insufficient_evidence"


class SourceType(StrEnum):
    academic = "academic"
    web = "web"
    news = "news"
    documentation = "documentation"
    report = "report"
    library = "library"
    encyclopedia = "encyclopedia"  # Wikipedia (stored as VARCHAR, so adding a value needs no migration)


class DocumentKind(StrEnum):
    pdf = "pdf"
    docx = "docx"
    txt = "txt"
    markdown = "markdown"
    paper = "paper"
    website = "website"
    note = "note"


class DocumentStatus(StrEnum):
    uploading = "uploading"
    extracting = "extracting"
    chunking = "chunking"
    embedding = "embedding"
    indexing = "indexing"
    ready = "ready"
    failed = "failed"


class ActivityKind(StrEnum):
    research_completed = "research_completed"
    document_added = "document_added"
    instructions_updated = "instructions_updated"
    member_joined = "member_joined"
    project_created = "project_created"
    research_shared = "research_shared"


# ----------------------------------------------------------------- identity


class JobLease:
    """Neon-backed job state (app/services/jobs.py). Nothing about a job lives only in process memory."""

    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    lease_owner: Mapped[str | None] = mapped_column(String(120))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    interrupted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class User(Timestamps, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    auth_provider: Mapped[str] = mapped_column(String(32), default="password")
    plan: Mapped[str] = mapped_column(String(16), default="free")
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ----------------------------------------------------------------- projects


class Project(Timestamps, Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = _uuid_pk()
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(24), default="sparkle")
    visibility: Mapped[Visibility] = mapped_column(_enum(Visibility, "visibility"), default=Visibility.private)

    members: Mapped[list[ProjectMember]] = relationship(back_populates="project", cascade="all, delete-orphan", lazy="selectin")
    instruction: Mapped[ProjectInstruction | None] = relationship(cascade="all, delete-orphan", lazy="selectin", uselist=False)


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    role: Mapped[ProjectRole] = mapped_column(_enum(ProjectRole, "project_role"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="members")
    user: Mapped[User] = relationship(lazy="selectin")


class ProjectInstruction(Base):
    __tablename__ = "project_instructions"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    content: Mapped[str] = mapped_column(Text, default="")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (CheckConstraint("char_length(content) <= 4000", name="instructions_length"),)


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    kind: Mapped[ActivityKind] = mapped_column(_enum(ActivityKind, "activity_kind"))
    title: Mapped[str] = mapped_column(Text)
    detail: Mapped[str | None] = mapped_column(Text)
    href: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    actor: Mapped[User] = relationship(lazy="selectin")

    __table_args__ = (
        Index("ix_activity_project_created", "project_id", "created_at"),
        Index("ix_activity_user_created", "user_id", "created_at"),
    )


# ----------------------------------------------------------------- library


class Document(JobLease, Timestamps, Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(Text)
    filename: Mapped[str] = mapped_column(String(300))
    kind: Mapped[DocumentKind] = mapped_column(_enum(DocumentKind, "document_kind"))
    mime_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    content_hash: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[DocumentStatus] = mapped_column(_enum(DocumentStatus, "document_status"), default=DocumentStatus.uploading)
    error: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(64))
    author: Mapped[str | None] = mapped_column(String(300))
    source: Mapped[str | None] = mapped_column(String(300))
    published_at: Mapped[date | None] = mapped_column(Date)
    page_count: Mapped[int | None] = mapped_column(Integer)
    chunk_count: Mapped[int | None] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text, default="")
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)

    project_links: Mapped[list[ProjectDocument]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    collection_links: Mapped[list[CollectionDocument]] = relationship(cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("user_id", "content_hash", name="uq_documents_user_hash"),
        Index("ix_documents_job", "status", "lease_expires_at"),
    )


class ProjectDocument(Base):
    __tablename__ = "project_documents"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True, index=True)
    added_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document_links: Mapped[list[CollectionDocument]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class CollectionDocument(Base):
    __tablename__ = "collection_documents"

    collection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True, index=True)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = _uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    # Denormalised owner for scoped retrieval without joins on the hot path.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))
    tsv: Mapped[Any] = mapped_column(TSVECTOR, Computed("to_tsvector('english', content)", persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_chunks_doc_index"),
        Index("ix_chunks_user", "user_id"),
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
        Index(
            "ix_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


# ----------------------------------------------------------------- research


class ResearchSession(JobLease, Base):
    __tablename__ = "research_sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    query: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    mode: Mapped[ResearchMode] = mapped_column(_enum(ResearchMode, "research_mode"))
    channels: Mapped[list[str]] = mapped_column(ARRAY(String(16)))
    status: Mapped[ResearchStatus] = mapped_column(_enum(ResearchStatus, "research_status"), default=ResearchStatus.queued)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # A revision regenerates an earlier report with the user's changes (asked as a follow-up). The original
    # is never modified; the revision is a separate session that points back to it.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("research_sessions.id", ondelete="SET NULL"), index=True)
    revision_instructions: Mapped[str | None] = mapped_column(Text)
    saved: Mapped[bool] = mapped_column(Boolean, default=False)
    visibility: Mapped[Visibility] = mapped_column(_enum(Visibility, "visibility"), default=Visibility.private)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_research_user_created", "user_id", "created_at"),
        Index("ix_research_project_created", "project_id", "created_at"),
        Index("ix_research_job", "status", "lease_expires_at"),
    )


class ResearchStep(Base):
    __tablename__ = "research_steps"

    id: Mapped[uuid.UUID] = _uuid_pk()
    research_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(32))
    position: Mapped[int] = mapped_column(Integer)
    status: Mapped[StepStatus] = mapped_column(_enum(StepStatus, "step_status"), default=StepStatus.pending)
    detail: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (UniqueConstraint("research_id", "key", name="uq_steps_research_key"),)


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = _uuid_pk()
    research_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(600))  # normalised URL or library document id — dedupe key
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(String(300))
    publisher: Mapped[str] = mapped_column(String(300))
    authors: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    published_at: Mapped[date | None] = mapped_column(Date)
    type: Mapped[SourceType] = mapped_column(_enum(SourceType, "source_type"))
    relevance: Mapped[float] = mapped_column(Float, default=0)
    doi: Mapped[str | None] = mapped_column(String(200))
    abstract: Mapped[str | None] = mapped_column(Text)
    document_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), index=True)

    __table_args__ = (UniqueConstraint("research_id", "key", name="uq_sources_research_key"),)


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[uuid.UUID] = _uuid_pk()
    research_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True)
    # Indexed: re-indexing a document deletes chunks, and ON DELETE SET NULL must not scan all evidence.
    chunk_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("document_chunks.id", ondelete="SET NULL"), index=True)
    passage: Mapped[str] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(120))
    relevance: Mapped[float] = mapped_column(Float, default=0)


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[uuid.UUID] = _uuid_pk()
    research_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[ClaimStatus] = mapped_column(_enum(ClaimStatus, "claim_status"))
    confidence: Mapped[float] = mapped_column(Float)


class ClaimEvidence(Base):
    __tablename__ = "claim_evidence"

    claim_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"), primary_key=True)
    evidence_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("evidence.id", ondelete="CASCADE"), primary_key=True, index=True)


class Citation(Base):
    __tablename__ = "citations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    research_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"))
    index: Mapped[int] = mapped_column(Integer)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True)

    __table_args__ = (UniqueConstraint("research_id", "index", name="uq_citations_research_index"),)


class Share(Base):
    __tablename__ = "shares"

    id: Mapped[uuid.UUID] = _uuid_pk()
    research_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), unique=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Conversation(Base):
    """Follow-up thread attached to a research session (PRD §30)."""

    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    research_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("research_sessions.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = _uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[list[str]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(16), default="running")
    # "answer": a question answered from the report plus fresh web/academic search.
    # "revision": a request to change the report — answered by a new research session (revision_id).
    kind: Mapped[str] = mapped_column(String(16), default="answer", server_default="answer")
    revision_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("research_sessions.id", ondelete="SET NULL"), index=True)
    # Sources cited by this answer, numbered [1..n] in the answer text (report sources and new search results).
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
