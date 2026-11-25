"""SSRF-safe page fetching. Every hop (including redirects) must resolve to a public address."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from app.core.exceptions import ValidationFailed

MAX_BYTES = 3 * 1024 * 1024
USER_AGENT = "PramaanBot/1.0 (+https://pramaan-ai-seven.vercel.app; research assistant)"
_HTML_TYPES = ("text/html", "application/xhtml+xml")


@dataclass
class FetchedPage:
    url: str  # final URL after redirects
    body: bytes
    encoding: str | None  # charset from the Content-Type header, if any


async def _assert_public_host(host: str) -> None:
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
    except socket.gaierror as e:
        raise ValidationFailed("That website couldn't be reached.", code="URL_UNREACHABLE") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValidationFailed("That address isn't allowed.", code="URL_NOT_ALLOWED")


def validate_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValidationFailed("Enter a full http(s) URL.", code="URL_INVALID")
    if parsed.port not in (None, 80, 443):
        raise ValidationFailed("That address isn't allowed.", code="URL_NOT_ALLOWED")
    return parsed.geturl()


async def fetch_html(url: str, *, client: httpx.AsyncClient | None = None, timeout_s: float = 15, max_bytes: int = MAX_BYTES) -> FetchedPage:
    """GETs an HTML page. Redirects are followed manually so each hop's host is re-checked; the body is capped."""
    own = client is None
    http = client or httpx.AsyncClient(timeout=timeout_s, follow_redirects=False, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        url = validate_url(url)
        for _ in range(5):
            await _assert_public_host(urlparse(url).hostname or "")
            async with http.stream("GET", url, timeout=timeout_s) as r:
                if r.is_redirect:
                    url = validate_url(str(r.url.join(r.headers.get("location", ""))))
                    continue
                if r.status_code >= 400:
                    raise ValidationFailed("That website couldn't be read.", code="URL_UNREACHABLE")
                ctype = r.headers.get("content-type", "").lower()
                if ctype and not any(t in ctype for t in _HTML_TYPES):
                    raise ValidationFailed("Only web pages can be added.", code="URL_UNSUPPORTED")
                body = bytearray()
                async for part in r.aiter_bytes():
                    body.extend(part)
                    if len(body) > max_bytes:
                        break
                return FetchedPage(url=str(r.url), body=bytes(body[:max_bytes]), encoding=r.charset_encoding)
        raise ValidationFailed("Too many redirects.", code="URL_UNREACHABLE")
    finally:
        if own:
            await http.aclose()


async def fetch_page(url: str) -> tuple[str, str]:
    """A web page's (title, readable text), parsed with BeautifulSoup — used by "Add website"."""
    from app.services.content.html import parse_html

    page = await fetch_html(url)
    parsed = await asyncio.to_thread(parse_html, page.body, page.url, encoding=page.encoding)
    return parsed.title, parsed.text
