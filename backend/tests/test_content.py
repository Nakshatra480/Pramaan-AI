"""BeautifulSoup content parsing, page reading and Wikipedia search (offline: HTTP is mocked)."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.db.models import SourceType
from app.research.state import SourceItem
from app.services.content import fetch as fetch_mod
from app.services.content.html import parse_html
from app.services.content.reader import WebPageReader
from app.services.search.wikipedia import WikipediaService

ARTICLE = """<!doctype html><html><head>
<title>Solid-state batteries near production | Battery Weekly</title>
<meta property="og:site_name" content="Battery Weekly">
<meta name="author" content="Asha Rao">
<meta property="article:published_time" content="2026-03-14T09:00:00Z">
<script>var tracking = "do not read me";</script>
<style>.x{color:red}</style>
</head><body class="has-sidebar">
<header><nav><a href="/">Home</a><a href="/news">News</a></nav></header>
<div class="cookie-banner">We use cookies to improve your experience on this website and for advertising.</div>
<main>
  <article>
    <h1>Solid-state batteries near production</h1>
    <div class="share-tools"><a href="#">Share on X</a> Share this story with your friends and family today</div>
    <p>Toyota said its first solid-state battery ( SSB ) cells would enter limited production in 2027 , after pilot lines in Japan met their targets.</p>
    <p>Samsung SDI reported an energy density of 900 Wh/L for its prototype cells, roughly 40 percent higher than current lithium-ion packs.</p>
    <ul><li>Analysts expect costs to fall below 100 dollars per kWh only after 2030, once volumes rise.</li>
        <li><a href="/a">Read more</a></li></ul>
    <table><tr><th>Maker</th><th>Target year</th></tr><tr><td>Toyota Motor Corporation</td><td>2027 limited production</td></tr></table>
    <h2>Related stories</h2>
    <p>Lithium prices hit a new low this quarter as supply grows across Australia and Chile.</p>
  </article>
  <aside class="sidebar"><p>Subscribe to our newsletter for weekly battery industry insights and news.</p></aside>
</main>
<footer><p>Copyright Battery Weekly 2026. All rights reserved. Terms and privacy apply.</p></footer>
</body></html>"""


def test_parser_keeps_the_article_and_drops_boilerplate() -> None:
    page = parse_html(ARTICLE, "https://batteryweekly.example/ssb")
    text = page.text
    assert page.title == "Solid-state batteries near production | Battery Weekly"
    assert page.site_name == "Battery Weekly" and page.author == "Asha Rao" and page.published == date(2026, 3, 14)
    assert "Toyota said its first solid-state battery (SSB) cells would enter limited production in 2027," in text  # tidy spacing
    assert "900 Wh/L" in text and "below 100 dollars per kWh" in text
    assert "Toyota Motor Corporation | 2027 limited production" in text  # table rows kept as rows
    for noise in ("tracking", "cookies", "Share this story", "Subscribe", "Copyright", "Home", "Read more", "Lithium prices"):
        assert noise not in text, noise  # scripts, banners, share widgets, sidebars, footers, link lists, "related" sections


def test_passages_are_sized_and_stay_within_a_section() -> None:
    body = "".join(f"<p>Sentence number {i} explains a separate fact about grid storage deployment in detail.</p>" for i in range(30))
    page = parse_html(f"<html><body><article><h2>Storage</h2>{body}<h2>Costs</h2><p>{'Costs fell sharply. ' * 6}</p></article></body></html>")
    ps = page.passages()
    assert len(ps) >= 4 and all(80 <= len(p) <= 650 for p in ps)
    assert not any("Sentence number" in p and "Costs fell" in p for p in ps)  # never spans the heading


def test_wikipedia_html_loses_citations_infobox_and_reference_sections() -> None:
    html = """<html><body><section><p>The <b>solid-state battery</b> uses a solid electrolyte<sup class="reference"><a href="#c1">[1]</a></sup>
    instead of a liquid one, which can improve safety and energy density considerably.</p>
    <table class="infobox"><tr><td>Specific energy</td><td>Unknown value from infobox</td></tr></table>
    <h2>References</h2><ol class="references"><li>Smith, J. (2020). A very long citation entry about batteries and more.</li></ol></section></body></html>"""
    text = parse_html(html, "https://en.wikipedia.org/wiki/Solid-state_battery").text
    assert "solid electrolyte instead of a liquid one" in text
    assert "[1]" not in text and "infobox" not in text and "Smith, J." not in text


async def test_reader_fills_passages_and_metadata_and_survives_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    async def public(host: str) -> None:
        return None

    monkeypatch.setattr(fetch_mod, "_assert_public_host", public)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "ok.example":
            return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, text=ARTICLE)
        if request.url.host == "moved.example":
            return httpx.Response(301, headers={"location": "https://ok.example/final"})
        if request.url.host == "pdf.example":
            return httpx.Response(200, headers={"content-type": "application/pdf"}, content=b"%PDF")
        return httpx.Response(403)

    def src(url: str, rel: float, kind: SourceType = SourceType.web) -> SourceItem:
        host = httpx.URL(url).host
        return SourceItem(key=url, title=url, url=url, domain=host, publisher=host, type=kind, snippet="snippet", relevance=rel)

    sources = [
        src("https://ok.example/a", 0.9),
        src("https://moved.example/b", 0.8),
        src("https://blocked.example/c", 0.7),
        src("https://pdf.example/d", 0.6),
        src("https://doi.org/10.1/x", 0.95, SourceType.academic),  # scholarly records keep their abstract
    ]
    n = await WebPageReader(transport=httpx.MockTransport(handler)).read(sources, limit=10)
    assert n == 2
    ok = sources[0]
    assert ok.passages and ok.publisher == "Battery Weekly" and ok.authors == ["Asha Rao"] and ok.published_at == date(2026, 3, 14)
    assert sources[1].passages  # redirect followed (host re-checked)
    assert not sources[2].passages and not sources[3].passages and not sources[4].passages


async def test_reader_respects_the_limit_best_first(monkeypatch: pytest.MonkeyPatch) -> None:
    async def public(host: str) -> None:
        return None

    monkeypatch.setattr(fetch_mod, "_assert_public_host", public)
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        return httpx.Response(200, headers={"content-type": "text/html"}, text=ARTICLE)

    sources = [
        SourceItem(
            key=str(i), title="t", url=f"https://s{i}.example/", domain=f"s{i}.example", publisher="p", type=SourceType.web, snippet="", relevance=i / 10
        )
        for i in range(6)
    ]
    assert await WebPageReader(transport=httpx.MockTransport(handler)).read(sources, limit=2) == 2
    assert sorted(seen) == ["s4.example", "s5.example"]


async def test_private_addresses_are_never_read() -> None:
    s = SourceItem(key="k", title="t", url="http://127.0.0.1/admin", domain="127.0.0.1", publisher="p", type=SourceType.web, snippet="x", relevance=1)
    assert await WebPageReader().read([s], limit=1) == 0 and not s.passages


def _wiki_transport(seen: list[httpx.Request]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/w/api.php":
            hits = [{"title": "Mercury (disambiguation)"}, {"title": "Solid-state battery", "snippet": "a <b>solid</b> electrolyte"}, {"title": "Battery list"}]
            return httpx.Response(200, json={"query": {"search": hits}})
        if "disambiguation" in request.url.path:
            return httpx.Response(200, text='<html><head><link rel="mw:PageProp/disambiguation"></head><body><p>may refer to</p></body></html>')
        if "Battery_list" in request.url.path:
            return httpx.Response(200, text="<html><body><ul><li><a href='/a'>Battery A</a></li><li><a href='/b'>Battery B</a></li></ul></body></html>")
        body = "".join(f"<p>A solid-state battery fact number {i} with enough words to form a full passage of text.</p>" for i in range(12))
        return httpx.Response(200, text=f"<html><body><section>{body}<sup class='reference'>[3]</sup></section></body></html>")

    return httpx.MockTransport(handler)


async def test_wikipedia_search_reads_articles_and_skips_disambiguation_and_lists() -> None:
    seen: list[httpx.Request] = []
    w = WikipediaService("wiki-token", user_agent="PramaanAI/test", transport=_wiki_transport(seen))
    results = await w.search("solid-state battery", max_results=3)
    assert [r.title for r in results] == ["Solid-state battery"]
    r = results[0]
    assert r.type == SourceType.encyclopedia and r.publisher == "Wikipedia" and r.url == "https://en.wikipedia.org/wiki/Solid-state_battery"
    assert r.passages and all("[3]" not in p for p in r.passages)
    assert seen[0].headers["authorization"] == "Bearer wiki-token" and seen[0].headers["user-agent"] == "PramaanAI/test"


async def test_wikipedia_works_without_a_key() -> None:
    seen: list[httpx.Request] = []
    results = await WikipediaService(transport=_wiki_transport(seen)).search("solid-state battery", max_results=2)
    assert results and "authorization" not in seen[0].headers
