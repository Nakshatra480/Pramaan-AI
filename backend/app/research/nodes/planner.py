from __future__ import annotations

from typing import Any

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ResearchState


@node("planner")
async def planner(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("planning", "Planning research directions")
    n = MODE_LIMITS[state["mode"]]["subqueries"]
    plan = await deps.llm.plan(state["query"], n, state.get("project_instructions"), state.get("prior_research", []))
    await deps.reporter.complete("planning", f"{len(plan.subqueries)} research directions planned")
    web_like = [c for c in state["channels"] if c in ("web", "academic")]
    await deps.reporter.start("searching", f"Searching {' and '.join(web_like)} sources" if web_like else "Preparing sources")
    return {"research_plan": plan, "subqueries": plan.subqueries}
