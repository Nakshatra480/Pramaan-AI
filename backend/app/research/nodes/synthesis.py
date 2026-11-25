from __future__ import annotations

from typing import Any

from app.research.dedupe import dedupe_report
from app.research.deps import ResearchDeps
from app.research.llm import cover_claims
from app.research.nodes.common import node
from app.research.state import ResearchState


@node("synthesis")
async def synthesis(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("synthesizing", "Writing the research report")
    draft = await deps.llm.synthesize(
        state["query"],
        state["verified_claims"],
        state.get("project_instructions"),
        mode=state["mode"].value,
        length=state.get("response_length", "balanced"),
    )
    draft = cover_claims(draft, state["verified_claims"])  # every verified claim (and its sources) is credited
    draft = dedupe_report(draft)  # no fact stated twice, in any mode or fallback
    await deps.reporter.complete("synthesizing", "Report drafted from verified claims")
    return {"draft": draft}
