"""TavilyService — web search, normalisation and dedupe. Key stays server-side. Result pages are read separately
(BeautifulSoup, see app/services/content/reader.py)."""

from __future__ import annotations

import logging
from datetime import date
from typing import Protocol
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings
from app.research.state import SourceItem
from app.services import cache
from app.services.search.common import classify, normalize_url

logger = logging.getLogger("pramaan.tavily")


def _date(value: object) -> date | None:
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


class WebSearch(Protocol):
    configured: bool

    async def search(self, query: str, *, max_results: int, deep: bool) -> list[SourceItem]: ...


class TavilyService:
    endpoint = "https://api.tavily.com"

    def __init__(self, api_key: str, timeout_s: float = 25) -> None:
        self._key = api_key
        self.configured = bool(api_key)
        self._client = httpx.AsyncClient(base_url=self.endpoint, timeout=timeout_s)

    async def search(self, query: str, *, max_results: int, deep: bool) -> list[SourceItem]:
        if not self.configured:
            return []
        body = {
            "query": query[:400],
            "search_depth": "advanced" if deep else "basic",
            "max_results": max_results,
            "include_answer": False,
            "include_raw_content": False,
        }
        # Public web results are shared across users, so they can be cached (saves Tavily credits).
        results = await cache.get_json("tavily", body)
        if not isinstance(results, list):
            r = await self._client.post("/search", headers={"Authorization": f"Bearer {self._key}"}, json=body)
            r.raise_for_status()
            results = r.json().get("results", [])
            await cache.set_json("tavily", body, results, get_settings().cache_ttl_search_s)
        return self.normalize(results)

    @staticmethod
    def normalize(results: list[dict[str, object]]) -> list[SourceItem]:
        out: list[SourceItem] = []
        seen: set[str] = set()
        for item in results:
            url = str(item.get("url") or "")
            if not url.startswith(("http://", "https://")):
                continue
            key = normalize_url(url)
            if key in seen:
                continue
            seen.add(key)
            domain = (urlparse(url).hostname or "").removeprefix("www.")
            out.append(
                SourceItem(
                    key=key,
                    title=str(item.get("title") or domain)[:500],
                    url=url,
                    domain=domain,
                    publisher=domain,
                    type=classify(domain),
                    snippet=str(item.get("content") or "")[:6000],
                    relevance=float(item.get("score") or 0.0),  # type: ignore[arg-type]
                    published_at=_date(item.get("published_date")),
                )
            )
        return out
