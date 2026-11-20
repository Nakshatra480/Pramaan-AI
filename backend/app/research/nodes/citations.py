from __future__ import annotations

from typing import Any

from app.research.citations import map_report
from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import ResearchState


@node("citations")
async def citations(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    await deps.reporter.start("citing", "Mapping passages to sources")
    answer, cites = map_report(state["draft"], state["verified_claims"], state["evidence"])
    notes = run_limitations(state.get("errors", []))
    if notes:
        limits = answer.get("limitations")
        answer["limitations"] = [*(limits if isinstance(limits, list) else []), *notes]
    await deps.reporter.complete("citing", f"{len(cites)} sources cited")
    return {"answer": answer, "citations": cites}


# Degradations recorded during the run → plain-language limitations in the report (audit H-01).
RUN_LIMITATIONS = {
    "semantic_ranking_unavailable": "The semantic ranking service was unavailable during this research, so evidence was ranked by keyword "
    "overlap only. Relevant passages that use different wording may have been missed.",
    "web_search_failed": "Web search failed for part of this research, so some web sources may be missing.",
    "academic_search_failed": "Academic search failed for part of this research, so some papers may be missing.",
    "web_search_not_configured": "Web search is not available on this server, so no web sources were consulted.",
}


def run_limitations(errors: list[str]) -> list[str]:
    return [RUN_LIMITATIONS[e] for e in dict.fromkeys(errors) if e in RUN_LIMITATIONS]
