from __future__ import annotations

from typing import Any

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import ResearchState


@node("query_understanding")
async def query_understanding(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("understanding", "Reading your question")
    scope = "within your project" if state.get("project_id") else "across your selected sources"
    await deps.reporter.complete("understanding", f"Identified the question and scope — researching {scope}")
    return {"metadata": {**state.get("metadata", {}), "scope": scope}}
