"""Academic research via OpenAlex (free, no key). Keeps authors, DOI, dates and abstracts."""

from __future__ import annotations

from datetime import date
from typing import Protocol
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings
from app.db.models import SourceType
from app.research.state import SourceItem
from app.services import cache
from app.services.tavily import normalize_url


class AcademicSearch(Protocol):
    async def search(self, query: str, *, max_results: int) -> list[SourceItem]: ...


def _abstract(inverted: dict[str, list[int]] | None) -> str:
    if not inverted:
        return ""
    words: dict[int, str] = {}
    for word, positions in inverted.items():
        for p in positions:
            words[p] = word
    return " ".join(words[i] for i in sorted(words))


class OpenAlexService:
    def __init__(self, mailto: str = "", timeout_s: float = 20) -> None:
        self._params = {"mailto": mailto} if mailto else {}
        self._client = httpx.AsyncClient(base_url="https://api.openalex.org", timeout=timeout_s)

    async def search(self, query: str, *, max_results: int) -> list[SourceItem]:
        params: dict[str, str | int] = {
            "search": query[:300],
            "per-page": max_results,
            "filter": "has_abstract:true,type:article|preprint|review",
            "sort": "relevance_score:desc",
        }
        results = await cache.get_json("openalex", params)  # public scholarly metadata — safe to share across users
        if not isinstance(results, list):
            r = await self._client.get("/works", params={**self._params, **params})
            r.raise_for_status()
            results = r.json().get("results", [])
            await cache.set_json("openalex", params, results, get_settings().cache_ttl_search_s)
        return self.normalize(results)

    @staticmethod
    def normalize(results: list[dict]) -> list[SourceItem]:  # type: ignore[type-arg]
        out = []
        for w in results:
            doi = (w.get("doi") or "").removeprefix("https://doi.org/") or None
            loc = w.get("primary_location") or {}
            url = loc.get("landing_page_url") or (f"https://doi.org/{doi}" if doi else w.get("id"))
            if not url:
                continue
            venue = ((loc.get("source") or {}).get("display_name")) or "Academic publication"
            abstract = _abstract(w.get("abstract_inverted_index"))
            try:
                published = date.fromisoformat(w["publication_date"]) if w.get("publication_date") else None
            except ValueError:
                published = None
            domain = (urlparse(url).hostname or "doi.org").removeprefix("www.")
            out.append(
                SourceItem(
                    key=f"doi:{doi.lower()}" if doi else normalize_url(url),
                    title=(w.get("title") or "Untitled")[:500],
                    url=url,
                    domain=domain,
                    publisher=venue[:300],
                    type=SourceType.academic,
                    snippet=abstract[:6000],
                    relevance=min(1.0, float(w.get("relevance_score") or 0) / 1000) if w.get("relevance_score") else 0.5,
                    authors=[a["author"]["display_name"] for a in (w.get("authorships") or [])[:6] if a.get("author")],
                    published_at=published,
                    doi=doi,
                    abstract=abstract[:2000] or None,
                )
            )
        return out
