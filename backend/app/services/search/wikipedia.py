"""Wikipedia search via the MediaWiki API; articles are read in full and parsed with BeautifulSoup.

Search uses the Action API (`list=search`); each hit's article HTML comes from the REST endpoint
(`/api/rest_v1/page/html/{title}`) and is parsed into passages with citation markers, infoboxes,
navigation templates and the References / See also sections removed. An optional API key is sent as a
bearer token; anonymous access works too. Results are public and cached across users.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Protocol
from urllib.parse import quote

import httpx

from app.core.config import get_settings
from app.db.models import SourceType
from app.research.state import SourceItem
from app.research.text import STOP
from app.services import cache
from app.services.content.html import parse_html
from app.services.search.common import normalize_url

logger = logging.getLogger("pramaan.wikipedia")

MAX_PASSAGES = 40


# Words that make Wikipedia's full-text search look for the wrong articles ("vs", "how does it differ", "latest").
_QUERY_NOISE = {
    "vs", "versus", "compare", "compared", "comparison", "differ", "differs", "difference", "differences", "latest", "recent",
    "recently", "current", "currently", "developments", "development", "explain", "overview", "today", "now", "new", "best",
    "effective", "effectiveness", "impact", "impacts", "effect", "effects", "role", "main", "key", "major", "really", "evidence",
    "research", "study", "studies", "pros", "cons", "benefits", "risks", "work", "works", "happen", "happens",
}  # fmt: skip
_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-']*")


def search_terms(query: str, limit: int = 6) -> str:
    """A question or comparison → the few content words Wikipedia's search matches well:
    "What is direct air capture and how does it differ from point-source capture?" → "direct air capture point-source capture"."""
    words = [w for w in _TOKEN.findall(query) if w.lower() not in STOP and w.lower() not in _QUERY_NOISE and len(w) > 1]
    words = [
        w
        for w in words
        if w.lower()
        not in {
            "what",
            "which",
            "who",
            "whom",
            "how",
            "why",
            "when",
            "where",
            "does",
            "did",
            "is",
            "are",
            "was",
            "were",
            "do",
            "it",
            "a",
            "an",
            "of",
            "to",
            "in",
            "on",
            "or",
            "be",
        }
    ]
    return " ".join(words[:limit]) or query.strip()


class EncyclopediaSearch(Protocol):
    configured: bool

    async def search(self, query: str, *, max_results: int) -> list[SourceItem]: ...


def _plain(html_snippet: str) -> str:
    from bs4 import BeautifulSoup

    return " ".join(BeautifulSoup(html_snippet or "", "lxml").get_text(" ").split())


class WikipediaService:
    def __init__(
        self,
        api_key: str = "",
        *,
        language: str = "en",
        user_agent: str = "",
        timeout_s: float = 15,
        concurrency: int = 4,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.language = language or "en"
        self.configured = True  # anonymous access works; the key only raises rate limits
        headers = {"User-Agent": user_agent or "PramaanAI/1.0", "Api-User-Agent": user_agent or "PramaanAI/1.0", "Accept-Encoding": "gzip"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.AsyncClient(base_url=f"https://{self.language}.wikipedia.org", headers=headers, timeout=timeout_s, transport=transport)
        self._gate = asyncio.Semaphore(concurrency)

    def article_url(self, title: str) -> str:
        return f"https://{self.language}.wikipedia.org/wiki/{quote(title.replace(' ', '_'), safe='')}"

    async def _hits(self, query: str, limit: int) -> list[dict[str, object]]:
        params: dict[str, str | int] = {
            "action": "query",
            "list": "search",
            "srsearch": search_terms(query)[:300],
            "srlimit": limit,
            "srprop": "snippet",
            "srinfo": "",
            "format": "json",
            "formatversion": 2,
        }
        cached = await cache.get_json("wikipedia_search", {"lang": self.language, **params})
        if isinstance(cached, list):
            return cached
        r = await self._client.get("/w/api.php", params=params)
        r.raise_for_status()
        hits = [h for h in (r.json().get("query") or {}).get("search", []) if isinstance(h, dict) and h.get("title")]
        await cache.set_json("wikipedia_search", {"lang": self.language, **params}, hits, get_settings().cache_ttl_search_s)
        return hits

    async def _article(self, title: str) -> dict[str, object] | None:
        key = {"lang": self.language, "title": title}
        cached = await cache.get_json("wikipedia_article", key)
        if isinstance(cached, dict):
            return cached
        async with self._gate:
            r = await self._client.get(f"/api/rest_v1/page/html/{quote(title.replace(' ', '_'), safe='')}", follow_redirects=True)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        html = r.text
        if "mw:PageProp/disambiguation" in html:
            data: dict[str, object] = {"passages": [], "disambiguation": True}
        else:
            parsed = await asyncio.to_thread(parse_html, html, self.article_url(title))
            data = {"passages": parsed.passages()[:MAX_PASSAGES], "disambiguation": False}
        await cache.set_json("wikipedia_article", key, data, get_settings().cache_ttl_search_s)
        return data

    async def search(self, query: str, *, max_results: int) -> list[SourceItem]:
        hits = await self._hits(query, max_results + 2)  # a couple spare: disambiguation pages are dropped
        articles = await asyncio.gather(*(self._article(str(h["title"])) for h in hits), return_exceptions=True)
        out: list[SourceItem] = []
        for rank, (hit, art) in enumerate(zip(hits, articles, strict=True)):
            if isinstance(art, BaseException):
                if not isinstance(art, httpx.HTTPError):
                    raise art
                art = None  # the search snippet still stands in for the article
            if art is not None and not art.get("passages"):
                continue  # disambiguation and list-only pages have no prose to cite
            title = str(hit["title"])
            url = self.article_url(title)
            raw = (art or {}).get("passages")
            passages = [p for p in raw if isinstance(p, str)] if isinstance(raw, list) else []
            snippet = " ".join(passages[:2]) or _plain(str(hit.get("snippet") or ""))
            if not snippet:
                continue
            out.append(
                SourceItem(
                    key=normalize_url(url),
                    title=title[:500],
                    url=url,
                    domain=f"{self.language}.wikipedia.org",
                    publisher="Wikipedia",
                    type=SourceType.encyclopedia,
                    snippet=snippet[:6000],
                    relevance=round(max(0.3, 0.7 - 0.06 * rank), 3),  # search rank; evidence ranking re-scores the passages
                    passages=passages,
                )
            )
            if len(out) >= max_results:
                break
        return out


class NoWikipedia:
    configured = False

    async def search(self, query: str, *, max_results: int) -> list[SourceItem]:
        return []
