from __future__ import annotations

from typing import Any

from app.research.deps import ResearchDeps
from app.research.nodes.common import node
from app.research.state import MODE_LIMITS, ChunkHit, ResearchState


@node("knowledge_retrieval")
async def knowledge_retrieval(state: ResearchState, deps: ResearchDeps) -> dict[str, Any]:
    doc_ids = state.get("allowed_document_ids", [])
    if not doc_ids:
        await deps.reporter.skip("retrieving", "No private library selected")
        return {}
    focus = state.get("focus_document_ids") or []
    limits = MODE_LIMITS[state["mode"]]
    if focus:
        await deps.reporter.start("retrieving", "Reading your document" if len(focus) == 1 else "Reading your documents")
        hits = await _read_focus(state, deps, focus, limits["focus_chunks"])
    else:
        await deps.reporter.start("retrieving", "Searching your private library")
        hits = await _search(state, deps, doc_ids, limits["chunks"])
    docs = len({h.document_id for h in hits})
    await deps.reporter.complete("retrieving", f"{len(hits)} relevant passage{'s' * (len(hits) != 1)} from {docs} document{'s' * (docs != 1)}")
    return {"retrieved_chunks": hits}


async def _search(state: ResearchState, deps: ResearchDeps, doc_ids: list[Any], limit: int) -> list[ChunkHit]:
    seen, hits = set(), []
    for q in state["subqueries"][:3]:
        for h in await deps.retrieve(q, doc_ids, limit):
            if h.chunk_id not in seen:
                seen.add(h.chunk_id)
                hits.append(h)
    hits.sort(key=lambda h: -h.score)
    return hits[:limit]


async def _read_focus(state: ResearchState, deps: ResearchDeps, focus: list[Any], limit: int) -> list[ChunkHit]:
    """Research built from specific documents reads them in full when they fit the budget; a longer document
    contributes its opening (what it is about) and the passages most relevant to the question."""
    whole = await deps.read_documents(focus, limit) if deps.read_documents else []
    if whole and len(whole) <= limit:
        return whole
    opening = whole[: max(4, limit // 6)]
    relevant = await _search(state, deps, focus, limit)
    seen = {h.chunk_id for h in opening}
    return (opening + [h for h in relevant if h.chunk_id not in seen])[:limit]
