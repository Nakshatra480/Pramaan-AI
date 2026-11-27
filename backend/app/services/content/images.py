"""Checks that a figure chosen for a report is a real, reachable image before it is shown.

Every hop is SSRF-checked like page fetches; only the response headers (and at most a few KB) are read.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Protocol
from urllib.parse import urlparse

import httpx

from app.core.exceptions import ValidationFailed
from app.services.content.fetch import USER_AGENT, _assert_public_host, validate_url

logger = logging.getLogger("pramaan.content")

MAX_IMAGE_BYTES = 12 * 1024 * 1024
MIN_IMAGE_BYTES = 2 * 1024  # smaller is a pixel, a spacer or an error placeholder
_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif")


class ImageVerifier(Protocol):
    async def verify(self, urls: list[str]) -> set[str]:
        """The URLs (of those given) that serve a usable image."""
        ...


class AcceptAllImages:
    """Tests and offline development: every candidate counts as reachable."""

    async def verify(self, urls: list[str]) -> set[str]:
        return set(urls)


class HttpImageVerifier:
    def __init__(self, *, timeout_s: float = 6.0, concurrency: int = 4, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.timeout_s = timeout_s
        self.concurrency = concurrency
        self.transport = transport

    async def _ok(self, client: httpx.AsyncClient, url: str) -> bool:
        try:
            for _ in range(4):
                url = validate_url(url)
                await _assert_public_host(urlparse(url).hostname or "")
                async with client.stream("GET", url) as r:
                    if r.is_redirect:
                        url = str(r.url.join(r.headers.get("location", "")))
                        continue
                    ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                    size = int(r.headers.get("content-length") or 0)
                    return r.status_code == 200 and ctype in _TYPES and (size == 0 or MIN_IMAGE_BYTES <= size <= MAX_IMAGE_BYTES)
            return False
        except (ValidationFailed, httpx.HTTPError, ValueError):
            return False

    async def verify(self, urls: list[str]) -> set[str]:
        if not urls:
            return set()
        gate = asyncio.Semaphore(self.concurrency)
        headers = {"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8"}
        async with httpx.AsyncClient(timeout=self.timeout_s, follow_redirects=False, headers=headers, transport=self.transport) as client:

            async def one(u: str) -> tuple[str, bool]:
                async with gate:
                    return u, await self._ok(client, u)

            results = await asyncio.gather(*(one(u) for u in dict.fromkeys(urls)))
        ok = {u for u, good in results if good}
        if len(ok) < len(set(urls)):
            logger.info("figures_unreachable", extra={"fields": {"checked": len(set(urls)), "ok": len(ok)}})
        return ok
