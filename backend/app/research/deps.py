"""Dependency container for graph nodes. Nodes never import providers directly."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app.research.llm import ResearchLLM
from app.research.progress import ProgressReporter
from app.research.state import ChunkHit, SourceItem
from app.services.academic import AcademicSearch
from app.services.embeddings import EmbeddingService
from app.services.tavily import WebSearch

Retrieve = Callable[[str, list[uuid.UUID], int], Awaitable[list[ChunkHit]]]
PersistSources = Callable[[uuid.UUID, list[SourceItem]], Awaitable[None]]


@dataclass
class ResearchDeps:
    llm: ResearchLLM
    embeddings: EmbeddingService
    web: WebSearch
    academic: AcademicSearch
    retrieve: Retrieve
    reporter: ProgressReporter
    persist_sources: PersistSources
