"""SSRF-safe page fetching. Every hop (including redirects) must resolve to a public address."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import urllib.robotparser
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


@dataclass
class SitePage:
    url: str
    title: str
    text: str  # with section headings ("## Use Cases")


# "Add website" reads the page and, when the page is an index of its own sub-pages (a documentation hub, a
# guide's contents page), those sub-pages too — so the library gets the content, not just the table of contents.
MAX_SUBPAGES = 15
MAX_SITE_CHARS = 400_000
HUB_TEXT_CHARS = 6000  # a page with more of its own text than this is an article: its links aren't followed
_SKIP_EXTENSIONS = (".pdf", ".zip", ".gz", ".tar", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".mp4", ".mp3", ".xml", ".json", ".css", ".js")


def child_links(page_url: str, links: list[str]) -> list[str]:
    """Links to pages beneath this one: same host, a path under the page's own folder, not files or the page itself."""
    base = urlparse(page_url)
    folder = base.path if base.path.endswith("/") else base.path.rsplit("/", 1)[0] + "/"
    out: list[str] = []
    for link in links:
        p = urlparse(link)
        if p.scheme not in ("http", "https") or p.hostname != base.hostname or p.port != base.port:
            continue
        path = p.path or "/"
        if not path.startswith(folder) or path.rstrip("/") == base.path.rstrip("/") or path.lower().endswith(_SKIP_EXTENSIONS):
            continue
        clean = p._replace(fragment="").geturl()
        if clean not in out:
            out.append(clean)
    return out


async def _robots(client: httpx.AsyncClient, page_url: str) -> urllib.robotparser.RobotFileParser | None:
    """The site's robots.txt rules (None when there are none, or they can't be read — then crawling is allowed)."""
    p = urlparse(page_url)
    url = f"{p.scheme}://{p.netloc}/robots.txt"
    try:
        await _assert_public_host(p.hostname or "")
        r = await client.get(url, timeout=6)
    except (ValidationFailed, httpx.HTTPError):
        return None
    if r.status_code != 200:
        return None
    rules = urllib.robotparser.RobotFileParser()
    rules.parse(r.text[:200_000].splitlines())
    return rules


async def fetch_site(url: str, *, max_subpages: int = MAX_SUBPAGES, transport: httpx.AsyncBaseTransport | None = None) -> list[SitePage]:
    """The page at `url` and — if it is an index of sub-pages — up to `max_subpages` of them, each parsed with
    BeautifulSoup. Sub-pages that can't be read are skipped; the first page must be readable."""
    from app.services.content.html import parse_html

    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    async with httpx.AsyncClient(timeout=15, follow_redirects=False, headers=headers, transport=transport) as client:
        first = await fetch_html(url, client=client)
        parsed = await asyncio.to_thread(parse_html, first.body, first.url, encoding=first.encoding)
        pages = [SitePage(first.url, parsed.title, parsed.document_text())]
        children = child_links(first.url, parsed.links) if len(parsed.text) < HUB_TEXT_CHARS else []
        if not children:
            return pages
        rules = await _robots(client, first.url)
        allowed = [c for c in children if rules is None or rules.can_fetch(USER_AGENT, c)][:max_subpages]
        gate = asyncio.Semaphore(4)

        async def one(link: str) -> SitePage | None:
            async with gate:
                try:
                    page = await fetch_html(link, client=client, timeout_s=12, max_bytes=2 * 1024 * 1024)
                except (ValidationFailed, httpx.HTTPError):
                    return None
            sub = await asyncio.to_thread(parse_html, page.body, page.url, encoding=page.encoding)
            text = sub.document_text()
            return SitePage(page.url, sub.title, text) if len(text) >= 200 else None

        total = len(pages[0].text)
        for sub_page in await asyncio.gather(*(one(c) for c in allowed)):
            if sub_page is None or total >= MAX_SITE_CHARS:
                continue
            sub_page.text = sub_page.text[: MAX_SITE_CHARS - total]
            total += len(sub_page.text)
            pages.append(sub_page)
        return pages


async def fetch_page(url: str) -> tuple[str, str]:
    """A web page's (title, readable text), parsed with BeautifulSoup."""
    pages = await fetch_site(url, max_subpages=0)
    return pages[0].title, pages[0].text
