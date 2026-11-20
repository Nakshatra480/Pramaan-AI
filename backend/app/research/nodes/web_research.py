from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ResearchMode, ResearchState

logger = logging.getLogger("pramaan.research")


@node("web_research")
async def web_research(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    if "web" not in state["channels"]:
        return {}
    if not deps.web.configured:
        return {"errors": ["web_search_not_configured"]}
    per_query = MODE_LIMITS[state["mode"]]["web"]
    deep = state["mode"] == ResearchMode.deep
    results = await asyncio.gather(*(deps.web.search(q, max_results=per_query, deep=deep) for q in state["subqueries"]), return_exceptions=True)
    sources, errors = [], []
    for r in results:
        if isinstance(r, httpx.HTTPError | ValueError):
            errors.append("web_search_failed")
        elif isinstance(r, BaseException):
            raise r
        else:
            sources.extend(r)
    return {"sources": sources, "errors": errors}
