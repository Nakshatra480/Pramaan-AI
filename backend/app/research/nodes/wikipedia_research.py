from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ResearchState, SourceItem


@node("wikipedia_research")
async def wikipedia_research(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    """Wikipedia articles for the question, read in full. Part of the public-web channel."""
    if "web" not in state["channels"] or not deps.wikipedia.configured:
        return {}
    limits = MODE_LIMITS[state["mode"]]
    queries = state["subqueries"][: limits["wikipedia_queries"]]
    per_query = max(2, -(-limits["wikipedia"] // max(1, len(queries))))
    results = await asyncio.gather(*(deps.wikipedia.search(q, max_results=per_query) for q in queries), return_exceptions=True)
    found: dict[str, SourceItem] = {}
    errors: list[str] = []
    for r in results:
        if isinstance(r, httpx.HTTPError | ValueError):
            errors.append("wikipedia_search_failed")
        elif isinstance(r, BaseException):
            raise r
        else:
            for s in r:
                found.setdefault(s.key, s)
    return {"sources": list(found.values())[: limits["wikipedia"]], "errors": errors}
