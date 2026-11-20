"""SSRF-safe URL fetching for "Add website"."""

from __future__ import annotations

import asyncio
import html
import ipaddress
import re
import socket
from urllib.parse import urlparse

import httpx

from app.core.exceptions import ValidationFailed

MAX_BYTES = 3 * 1024 * 1024


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


async def fetch_page(url: str) -> tuple[str, str]:
    """Returns (title, text). Follows redirects manually, re-checking each hop."""
    url = validate_url(url)
    async with httpx.AsyncClient(timeout=15, follow_redirects=False, headers={"User-Agent": "PramaanBot/1.0 (+https://pramaan.ai)"}) as client:
        for _ in range(4):
            host = urlparse(url).hostname or ""
            await _assert_public_host(host)
            async with client.stream("GET", url) as r:
                if r.is_redirect:
                    url = validate_url(str(r.url.join(r.headers.get("location", ""))))
                    continue
                if r.status_code >= 400:
                    raise ValidationFailed("That website couldn't be read.", code="URL_UNREACHABLE")
                if "html" not in r.headers.get("content-type", "") and "text" not in r.headers.get("content-type", ""):
                    raise ValidationFailed("Only web pages can be added.", code="URL_UNSUPPORTED")
                body = bytearray()
                async for part in r.aiter_bytes():
                    body.extend(part)
                    if len(body) > MAX_BYTES:
                        break
                return html_to_text(body.decode(r.encoding or "utf-8", errors="replace"))
    raise ValidationFailed("Too many redirects.", code="URL_UNREACHABLE")


def html_to_text(doc: str) -> tuple[str, str]:
    title_m = re.search(r"<title[^>]*>(.*?)</title>", doc, re.I | re.S)
    title = html.unescape(title_m.group(1)).strip() if title_m else ""
    doc = re.sub(r"<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>", " ", doc, flags=re.I | re.S)
    doc = re.sub(r"<(br|/p|/div|/h[1-6]|/li|/section|/article)[^>]*>", "\n\n", doc, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", doc))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return title[:300], text.strip()
