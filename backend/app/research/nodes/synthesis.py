from __future__ import annotations

import logging
from typing import Any

from app.research.dedupe import dedupe_report
from app.research.deps import ResearchDeps
from app.research.llm import cover_claims
from app.research.nodes.common import node
from app.research.state import ResearchState, SourceItem
from app.research.visuals import Visuals, image_candidates, parse_visuals, place_visuals
from app.services.llm.base import ProviderError

logger = logging.getLogger("pramaan.research")


@node("synthesis")
async def synthesis(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("synthesizing", "Writing the research paper")
    mode = state["mode"].value
    claims = state["verified_claims"]
    draft = await deps.llm.synthesize(state["query"], claims, state.get("project_instructions"), mode=mode, length=state.get("response_length", "balanced"))

    # Tables, diagrams and figures: proposed by the model, kept only if the evidence backs them. Optional —
    # a failure here never costs the report.
    if draft.sections:
        await deps.reporter.start("synthesizing", "Preparing tables, diagrams and figures")
        sources: list[SourceItem] = list(state.get("metadata", {}).get("sources", []))  # type: ignore[call-overload]
        candidates = image_candidates(sources, claims, state["evidence"])
        visuals = Visuals()
        try:
            proposal = await deps.llm.design_visuals(state["query"], claims, [s["heading"] for s in draft.sections], candidates, mode=mode)
            visuals = parse_visuals(
                proposal, claims=claims, evidence=state["evidence"], candidates=candidates, n_sections=len(draft.sections), mode=mode, question=state["query"]
            )
            if visuals.figures:
                reachable = await deps.images.verify([f["url"] for f in visuals.figures])
                visuals.figures = [f for f in visuals.figures if f["url"] in reachable]
        except ProviderError as e:
            logger.warning("visuals_skipped", extra={"fields": {"error": e.code}})
            visuals = Visuals()
        draft = place_visuals(draft, visuals)

    draft = cover_claims(draft, claims)  # every verified claim (and its sources) is credited
    draft = dedupe_report(draft)  # no fact stated twice in the body of the paper
    parts = [f"{len(draft.sections)} sections"]
    blocks = [b.get("type") for s in draft.sections for b in s["blocks"]]
    for kind, label in (("table", "table"), ("diagram", "diagram"), ("figure", "figure")):
        if n := blocks.count(kind):
            parts.append(f"{n} {label}{'s' if n > 1 else ''}")
    await deps.reporter.complete("synthesizing", f"Paper written: {', '.join(parts)}")
    return {"draft": draft}
