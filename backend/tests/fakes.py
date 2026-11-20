from __future__ import annotations

import uuid
from datetime import date

from app.db.models import SourceType
from app.research.deps import ResearchDeps
from app.research.llm import ResearchLLM
from app.research.progress import ProgressReporter
from app.research.runner import _persist_sources, _retrieve
from app.research.state import SourceItem
from app.services.embeddings import EmbeddingService
from app.services.llm.fake import FakeProvider

WEB = [
    SourceItem(
        key="https://robotics.example/humanoids",
        title="Humanoid robots move to factory pilots",
        url="https://robotics.example/humanoids",
        domain="robotics.example",
        publisher="robotics.example",
        type=SourceType.news,
        relevance=0.8,
        published_at=date(2026, 6, 1),
        snippet="Humanoid robots are now being piloted on automotive assembly lines. At least four automakers run humanoid pilots, "
        "though none has announced full production deployment. Learned locomotion policies now transfer reliably from simulation to hardware.",
    ),
    SourceItem(
        key="https://costs.example/actuators",
        title="Actuator costs fall",
        url="https://costs.example/actuators",
        domain="costs.example",
        publisher="costs.example",
        type=SourceType.report,
        relevance=0.7,
        snippet="Actuator costs for humanoid robots declined sharply between 2023 and 2025 because of shared electric vehicle supply chains. "
        "Dexterous manipulation of unfamiliar objects remains the main bottleneck for humanoid robots.",
    ),
]
ACADEMIC = [
    SourceItem(
        key="doi:10.1/humanoid",
        title="Learned whole-body control for humanoid robots",
        url="https://doi.org/10.1/humanoid",
        domain="doi.org",
        publisher="Nature Machine Intelligence",
        type=SourceType.academic,
        relevance=0.9,
        authors=["L. Moreau"],
        doi="10.1/humanoid",
        snippet="Sim-to-real transfer of learned locomotion policies for humanoid robots is now routine across surveyed platforms. "
        "Dexterous manipulation remains the dominant bottleneck, with few controllers generalising to unseen objects.",
    )
]


class FakeWeb:
    def __init__(self, results: list[SourceItem] | None = None) -> None:
        self.results = WEB if results is None else results
        self.configured = True

    async def search(self, query: str, *, max_results: int, deep: bool) -> list[SourceItem]:
        return [SourceItem(**{**s.__dict__}) for s in self.results]


class FakeAcademic:
    def __init__(self, results: list[SourceItem] | None = None) -> None:
        self.results = ACADEMIC if results is None else results

    async def search(self, query: str, *, max_results: int) -> list[SourceItem]:
        return [SourceItem(**{**s.__dict__}) for s in self.results]


def make_deps(web: FakeWeb, academic: FakeAcademic):  # type: ignore[no-untyped-def]
    def factory(research_id: uuid.UUID) -> ResearchDeps:
        provider = FakeProvider(768)
        return ResearchDeps(
            llm=ResearchLLM(provider),
            embeddings=EmbeddingService(provider),
            web=web,
            academic=academic,
            retrieve=_retrieve,
            reporter=ProgressReporter(research_id),
            persist_sources=_persist_sources,
        )

    return factory
