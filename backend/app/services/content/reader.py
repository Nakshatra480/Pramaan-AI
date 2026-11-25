"""Opens search results and reads the pages themselves.

Search APIs return a short snippet per result. For evidence, Pramaan fetches the top results' pages
(SSRF-safe), parses them with BeautifulSoup and keeps their passages on the source, so claims can rest
on what the page actually says. Pages that can't be read (blocked, paywalled, slow, not HTML) keep their
search snippet; reading never fails a research run.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import date
from typing import Protocol

import httpx

from app.core.config import get_settings
from app.core.exceptions import ValidationFailed
from app.db.models import SourceType
from app.research.state import SourceItem
from app.services import cache
from app.services.content.fetch import USER_AGENT, fetch_html
from app.services.content.html import parse_html

logger = logging.getLogger("pramaan.content")

MAX_PASSAGES = 40
# Results whose pages are worth opening: the open web. Scholarly records carry their abstract and their landing
# pages are mostly paywalls; library documents and encyclopedia articles are already full text.
_READABLE = {SourceType.web, SourceType.news, SourceType.report, SourceType.documentation}


class PageReader(Protocol):
    async def read(self, sources: list[SourceItem], *, limit: int) -> int:
        """Fills `passages` (and missing metadata) on up to `limit` sources, best first. Returns how many were read."""
        ...


def apply(source: SourceItem, data: dict[str, object]) -> bool:
    """Copies a parsed page's passages and metadata onto a search result."""
    raw = data.get("passages")
    passages = [p for p in raw if isinstance(p, str)] if isinstance(raw, list) else []
    if not passages:
        return False
    source.passages = passages[:MAX_PASSAGES]
    site = data.get("site_name")
    if isinstance(site, str) and site and source.publisher == source.domain:
        source.publisher = site[:300]
    author = data.get("author")
    if isinstance(author, str) and author and not source.authors:
        source.authors = [author[:200]]
    published = data.get("published")
    if isinstance(published, str) and not source.published_at:
        with contextlib.suppress(ValueError):
            source.published_at = date.fromisoformat(published)
    return True


class WebPageReader:
    def __init__(
        self,
        *,
        concurrency: int = 8,
        timeout_s: float = 8.0,
        max_bytes: int = 1_500_000,
        deadline_s: float = 25.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.transport = transport
        self.concurrency = concurrency
        self.timeout_s = timeout_s
        self.max_bytes = max_bytes
        self.deadline_s = deadline_s

    async def _page(self, client: httpx.AsyncClient, url: str) -> dict[str, object] | None:
        cached = await cache.get_json("page", {"url": url})  # public pages: shared across users, like search results
        if isinstance(cached, dict):
            return cached
        try:
            page = await fetch_html(url, client=client, timeout_s=self.timeout_s, max_bytes=self.max_bytes)
        except (ValidationFailed, httpx.HTTPError, UnicodeError):
            return None
        parsed = await asyncio.to_thread(parse_html, page.body, page.url, encoding=page.encoding)  # CPU work off the event loop
        data: dict[str, object] = {
            "passages": parsed.passages()[:MAX_PASSAGES],
            "site_name": parsed.site_name,
            "author": parsed.author,
            "published": parsed.published.isoformat() if parsed.published else None,
        }
        await cache.set_json("page", {"url": url}, data, get_settings().cache_ttl_search_s)
        return data

    async def read(self, sources: list[SourceItem], *, limit: int) -> int:
        targets = [s for s in sorted(sources, key=lambda s: -s.relevance) if s.type in _READABLE and not s.passages and s.url.startswith("http")]
        targets = targets[:limit]
        if not targets:
            return 0
        gate = asyncio.Semaphore(self.concurrency)
        headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}

        async with httpx.AsyncClient(follow_redirects=False, headers=headers, timeout=self.timeout_s, transport=self.transport) as client:

            async def one(s: SourceItem) -> bool:
                async with gate:
                    try:
                        data = await self._page(client, s.url)
                    except Exception as e:  # a page must never fail the run
                        logger.info("page_read_failed", extra={"fields": {"domain": s.domain, "error": type(e).__name__}})
                        return False
                return bool(data) and apply(s, data or {})

            tasks = [asyncio.create_task(one(s)) for s in targets]
            done, pending = await asyncio.wait(tasks, timeout=self.deadline_s)
            for t in pending:
                t.cancel()
            return sum(1 for t in done if not t.cancelled() and t.exception() is None and t.result())


class NoReader:
    """Reads nothing (tests, or when page reading is turned off)."""

    async def read(self, sources: list[SourceItem], *, limit: int) -> int:
        return 0
