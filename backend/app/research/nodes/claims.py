from __future__ import annotations

from typing import Any

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ResearchState


@node("claims")
async def claims(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("cross_checking", "Drafting candidate claims from evidence")
    items = await deps.llm.extract_claims(state["query"], state["evidence"], MODE_LIMITS[state["mode"]]["claims"])
    await deps.reporter.complete("cross_checking", f"{len(items)} candidate claims compared across sources", candidateClaims=len(items))
    return {"claims": items}
