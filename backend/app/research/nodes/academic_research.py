from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ResearchState


@node("academic_research")
async def academic_research(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    if "academic" not in state["channels"]:
        return {}
    limits = MODE_LIMITS[state["mode"]]
    per_query = limits["academic"]
    queries = state["subqueries"][: limits["academic_queries"]]  # the question + best angles; scholarly search is precision-oriented
    results = await asyncio.gather(*(deps.academic.search(q, max_results=per_query) for q in queries), return_exceptions=True)
    sources, errors = [], []
    for r in results:
        if isinstance(r, httpx.HTTPError | ValueError):
            errors.append("academic_search_failed")
        elif isinstance(r, BaseException):
            raise r
        else:
            sources.extend(r)
    return {"sources": sources, "errors": errors}
