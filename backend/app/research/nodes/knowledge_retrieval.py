from __future__ import annotations

from typing import Any

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ResearchState


@node("knowledge_retrieval")
async def knowledge_retrieval(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    doc_ids = state.get("allowed_document_ids", [])
    if not doc_ids:
        await deps.reporter.skip("retrieving", "No private library selected")
        return {}
    await deps.reporter.start("retrieving", "Searching your private library")
    limit = MODE_LIMITS[state["mode"]]["chunks"]
    seen, hits = set(), []
    for q in state["subqueries"][:3]:
        for h in await deps.retrieve(q, doc_ids, limit):
            if h.chunk_id not in seen:
                seen.add(h.chunk_id)
                hits.append(h)
    hits.sort(key=lambda h: -h.score)
    hits = hits[:limit]
    docs = len({h.document_id for h in hits})
    await deps.reporter.complete("retrieving", f"{len(hits)} relevant passage{'s' * (len(hits) != 1)} from {docs} document{'s' * (docs != 1)}")
    return {"retrieved_chunks": hits}
