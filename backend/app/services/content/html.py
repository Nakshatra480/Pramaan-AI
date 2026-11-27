"""HTML → clean, structured text with BeautifulSoup.

One parser for every page Pramaan reads: web results opened during research and follow-ups, Wikipedia
articles, and websites added to the library. It keeps what a reader would read — the article's paragraphs,
list items, quotes and table rows — and drops navigation, cookie banners, share widgets, related-links
rails, comments, references sections and other boilerplate. The result is split into passages sized for
evidence extraction.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, NavigableString, Tag

from app.research.text import sentences

# Elements that never carry article content.
NOISE_TAGS = (
    "script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed", "video", "audio", "img", "picture",
    "form", "button", "input", "select", "textarea", "label", "nav", "footer", "header", "aside", "menu", "dialog",
)  # fmt: skip
NOISE_ROLES = {"navigation", "banner", "contentinfo", "complementary", "search", "dialog", "alertdialog", "menu", "menubar", "toolbar"}
# class / id tokens of boilerplate blocks ("site-nav", "cookie_banner", "share-tools", …).
_NOISE_TOKEN = re.compile(
    r"(?:^|[-_])(?:nav|navbar|navigation|menu|breadcrumbs?|footer|masthead|sidebar|cookies?|consent|gdpr|banner|advert|ads|adsbygoogle|"
    r"sponsor(?:ed)?|promo|newsletter|subscribe|signup|social|share|sharing|related|recommended|comments?|disqus|popup|modal|paywall|"
    r"toolbar|skip|print-only|visually-hidden|sr-only|hidden)(?:$|[-_])",
    re.I,
)
# Containers whose own class may look noisy ("has-sidebar") but which hold the article.
_PROTECTED = {"html", "body", "main", "article"}
# Sections that list references or links rather than say anything.
_STOP_SECTIONS = re.compile(
    r"^(?:references|external links|see also|further reading|notes(?: and references)?|bibliography|sources|citations|footnotes|"
    r"related (?:articles|posts|stories)|read more|more from|comments?)$",
    re.I,
)
_HEADINGS = ("h1", "h2", "h3", "h4", "h5", "h6")
_BLOCKS = ("p", "li", "blockquote", "pre", "dd", "figcaption", "tr", *_HEADINGS)
# Wikipedia (Parsoid / desktop HTML): citation markers, edit links, infobox and navigation templates.
_WIKI_DROP = (
    "sup.reference", ".reference", ".mw-ref", ".mw-editsection", ".navbox", ".vertical-navbox", ".reflist", ".refbegin",
    ".mw-references-wrap", "ol.references", ".hatnote", ".metadata", ".ambox", ".infobox", ".sidebar", ".thumb", ".gallery",
    ".noprint", ".shortdescription", ".mw-empty-elt", "table.wikitable", ".toc", "#toc", "figure", ".mw-file-description",
)  # fmt: skip

# Images that are page furniture rather than figures.
_IMG_SKIP = re.compile(
    r"(?:^|[/_.\-])(?:logos?|icons?|favicon|avatars?|sprites?|badges?|banners?|placeholder|pixel|spacer|blank|1x1|transparent|emoji|"
    r"buttons?|ads?|advert|tracking|gravatar|author|profile|headshot|share|social|default)(?:[/_.\-]|$)",
    re.I,
)
_REF_MARK = re.compile(r"\s*\[(?:\d{1,3}|[a-z]|citation needed|note \d+)\]", re.I)
MAX_IMAGES = 4

MIN_BLOCK = 40
PASSAGE_TARGET = 420
PASSAGE_MAX = 650


@dataclass
class Block:
    text: str
    section: str = ""


@dataclass
class PageImage:
    url: str
    caption: str


@dataclass
class ParsedPage:
    title: str = ""
    site_name: str = ""
    author: str = ""
    description: str = ""
    published: date | None = None
    blocks: list[Block] = field(default_factory=list)
    images: list[PageImage] = field(default_factory=list)
    links: list[str] = field(default_factory=list)  # from the article area only

    @property
    def text(self) -> str:
        return "\n\n".join(b.text for b in self.blocks)

    def document_text(self) -> str:
        """The page as a readable document for the library: section headings ("## Use Cases") before their text."""
        out: list[str] = []
        section = ""
        for b in self.blocks:
            if b.section and b.section != section:
                out.append(f"## {b.section}")
            section = b.section
            out.append(b.text)
        return "\n\n".join(out)

    def passages(self, *, target: int = PASSAGE_TARGET, maximum: int = PASSAGE_MAX, minimum: int = 80) -> list[str]:
        return passages(self.blocks, target=target, maximum=maximum, minimum=minimum)


_SPACE_BEFORE = re.compile(r"\s+([,.;:!?%)\]”’])")
_SPACE_AFTER = re.compile(r"([(\[“‘])\s+")


def _clean(text: str) -> str:
    """Collapses whitespace, and the gaps `get_text(" ")` leaves around inline tags ("( SSB )" → "(SSB)")."""
    text = " ".join(text.replace("\xa0", " ").replace("\ufeff", "").split())
    return _SPACE_AFTER.sub(r"\1", _SPACE_BEFORE.sub(r"\1", text))


def _is_wikipedia(url: str | None) -> bool:
    host = (urlparse(url).hostname or "") if url else ""
    return host == "wikipedia.org" or host.endswith(".wikipedia.org")


def _noisy(el: Tag) -> bool:
    if el.name in _PROTECTED:
        return False
    attrs = el.attrs or {}
    if str(attrs.get("role") or "").lower() in NOISE_ROLES:
        return True
    if attrs.get("aria-hidden") == "true" or "hidden" in attrs:
        return True
    style = str(attrs.get("style") or "").replace(" ", "").lower()
    if "display:none" in style or "visibility:hidden" in style:
        return True
    tokens = [*(attrs.get("class") or []), str(attrs.get("id") or "")]
    return any(t and _NOISE_TOKEN.search(t) for t in tokens)


def _meta(soup: BeautifulSoup, *names: str) -> str:
    for n in names:
        el = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n}) or soup.find("meta", attrs={"itemprop": n})
        if isinstance(el, Tag) and el.get("content"):
            return _clean(str(el["content"]))
    return ""


def _date(value: str) -> date | None:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", value.strip())
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None


def _json_ld(soup: BeautifulSoup) -> dict[str, str]:
    """Author / dates from schema.org JSON-LD, the most reliable metadata many news sites publish."""
    out: dict[str, str] = {}
    for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(s.string or "")
        except (ValueError, TypeError):
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            if "datePublished" in item and "published" not in out:
                out["published"] = str(item["datePublished"])
            author = item.get("author")
            if author and "author" not in out:
                first = author[0] if isinstance(author, list) and author else author
                name = first.get("name") if isinstance(first, dict) else first
                if isinstance(name, str):
                    out["author"] = name
    return out


def _link_density(el: Tag, text: str) -> float:
    linked = sum(len(_clean(a.get_text(" "))) for a in el.find_all("a"))
    return linked / max(1, len(text))


def _main(body: Tag) -> Tag:
    """The element holding the article: the largest <article>/<main>/[role=main]/articleBody, unless it holds
    too little of the page's paragraph text (a teaser card), in which case the whole body."""

    def para_len(el: Tag) -> int:
        return sum(len(_clean(p.get_text(" "))) for p in el.find_all("p"))

    candidates = [
        *body.find_all("article"),
        *body.find_all("main"),
        *body.select('[role="main"]'),
        *body.select('[itemprop="articleBody"]'),
    ]
    total = para_len(body)
    best = max(candidates, key=para_len, default=None)
    if best is not None and para_len(best) >= max(300, 0.35 * total):
        return best
    return body


def _row_text(tr: Tag) -> str:
    cells = [_clean(c.get_text(" ")) for c in tr.find_all(["th", "td"])]
    return " | ".join(c for c in cells if c)


def _dimension(value: object) -> int | None:
    m = re.match(r"\s*(\d+)", str(value or ""))
    return int(m.group(1)) if m else None


def _image_url(img: Tag, base: str | None) -> str | None:
    """The best https URL for an <img> (largest srcset candidate first), or None for furniture and unusable images."""
    src = None
    srcset = str(img.get("srcset") or img.get("data-srcset") or "")
    if srcset:
        options = []
        for part in srcset.split(","):
            bits = part.strip().split()
            if bits:
                size = re.match(r"(\d+(?:\.\d+)?)[wx]", bits[1]) if len(bits) > 1 else None
                options.append((float(size.group(1)) if size else 1.0, bits[0]))
        src = max(options)[1] if options else None
    src = src or str(img.get("data-src") or img.get("src") or "")
    if not src or src.startswith("data:"):
        return None
    w, h = _dimension(img.get("width")), _dimension(img.get("height"))
    if (w is not None and w < 200) or (h is not None and h < 120):
        return None
    return usable_image_url(urljoin(base or "", src.strip()))


def usable_image_url(url: str) -> str | None:
    """An https, non-SVG image URL that doesn't look like a logo, icon or tracker; None otherwise."""
    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname or p.path.lower().endswith(".svg") or _IMG_SKIP.search(p.path):
        return None
    query = "&".join(q for q in p.query.split("&") if q and not q.lower().startswith("utm_"))
    return p._replace(query=query, fragment="").geturl()


def trim_caption(text: str, limit: int = 200) -> str:
    """A caption of at most `limit` characters, cut at a sentence end if possible, else at a word, with "…"."""
    text = _REF_MARK.sub("", " ".join(text.split())).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("; "))
    if end >= 60:
        return cut[: end + 1]
    return cut.rsplit(" ", 1)[0].rstrip(",;:") + "…"


def _caption(el: Tag | None) -> str:
    return trim_caption(_clean(el.get_text(" "))) if el is not None else ""


def _inside_noise(el: Tag) -> bool:
    return el.find_parent(["nav", "footer", "aside", "header", "form"]) is not None or any(_noisy(a) for a in el.parents if isinstance(a, Tag))


def _images(soup: BeautifulSoup, url: str | None, title: str) -> list[PageImage]:
    """Figures worth showing in a report: Wikipedia's lead image, captioned article figures, then the page's share
    image. Each needs a caption (the share image falls back to the page title)."""
    found: list[PageImage] = []
    seen: set[str] = set()

    def add(img: Tag | None, caption: str) -> None:
        u = _image_url(img, url) if img is not None else None
        if u and caption and u not in seen and len(found) < MAX_IMAGES:
            seen.add(u)
            found.append(PageImage(u, caption))

    if _is_wikipedia(url):
        for box in soup.select(".infobox-image, td.infobox-image"):
            add(box.find("img"), _caption(soup.select_one(".infobox-caption")))
    for fig in soup.find_all("figure"):
        if not _inside_noise(fig):
            img = fig.find("img")
            add(img, _caption(fig.find("figcaption")) or (trim_caption(_clean(str(img.get("alt") or ""))) if isinstance(img, Tag) else ""))
    # The share image only with a real description: a page title ("Carbon Capture") makes a useless caption.
    share = usable_image_url(_meta(soup, "og:image", "twitter:image") or "")
    alt = trim_caption(_meta(soup, "og:image:alt", "twitter:image:alt"))
    if share and share not in seen and len(alt) >= 25 and len(found) < MAX_IMAGES:
        found.append(PageImage(share, alt))
    return found


def parse_html(html: str | bytes, url: str | None = None, *, encoding: str | None = None) -> ParsedPage:
    """Parse a page into title, metadata and content blocks. Never raises on malformed HTML."""
    soup = BeautifulSoup(html, "lxml", from_encoding=encoding) if isinstance(html, bytes) else BeautifulSoup(html, "lxml")
    ld = _json_ld(soup)
    title_tag = soup.find("title")
    page = ParsedPage(
        title=_meta(soup, "og:title", "twitter:title") or (_clean(title_tag.get_text()) if title_tag else ""),
        site_name=_meta(soup, "og:site_name", "application-name"),
        author=_meta(soup, "author", "article:author", "parsely-author") or ld.get("author", ""),
        description=_meta(soup, "description", "og:description", "twitter:description"),
        published=_date(_meta(soup, "article:published_time", "datePublished", "date", "pubdate", "dc.date") or ld.get("published", "")),
    )
    if page.published is None and (t := soup.find("time", attrs={"datetime": True})) and isinstance(t, Tag):
        page.published = _date(str(t["datetime"]))
    if page.author.startswith(("http://", "https://")):
        page.author = ""  # article:author is sometimes a profile URL
    page.images = _images(soup, url, page.title)  # before noise removal, which strips <img>

    for el in soup(NOISE_TAGS):
        el.decompose()
    if _is_wikipedia(url):
        for sel in _WIKI_DROP:
            for el in soup.select(sel):
                el.decompose()
    for el in soup.find_all(True):
        if el.decomposed or not isinstance(el, Tag):
            continue
        if _noisy(el):
            el.decompose()

    body = soup.body or soup
    root = _main(body)
    seen: set[str] = set()
    section = ""
    skip_level = 0  # inside a references / "see also" section of this heading level
    for el in root.find_all([*_BLOCKS, "div"]):
        if el.decomposed:
            continue
        # A <div> counts only for text directly inside it (a lead line, a card's description) with no blocks within.
        if el.name == "div" and (el.find([*_BLOCKS, "div"]) or el.find_parent(_BLOCKS) or not _own_text(el)):
            continue
        if el.name in _HEADINGS:
            level = int(el.name[1])
            heading = _clean(el.get_text(" "))
            if skip_level and level > skip_level:
                continue
            skip_level = level if _STOP_SECTIONS.match(heading.rstrip(":")) else 0
            section = "" if skip_level else heading[:120]
            continue
        if skip_level:
            continue
        # Use the innermost block only (a <li> wrapping a <p> yields the <p>), and table rows as a whole.
        if el.name != "tr" and el.find(_BLOCKS):
            continue
        if el.name != "tr" and el.find_parent("tr"):
            continue
        text = _row_text(el) if el.name == "tr" else _clean(el.get_text(" "))
        if len(text) < MIN_BLOCK or text in seen:
            continue
        if _link_density(el, text) > 0.6:  # link lists: tags, "read next", author bios
            continue
        seen.add(text)
        page.blocks.append(Block(text, section))
    if not page.title and (h1 := soup.find("h1")):
        page.title = _clean(h1.get_text(" "))
    page.title = page.title[:300]
    page.links = _content_links(root, url)
    return page


def _own_text(el: Tag) -> bool:
    return any(isinstance(c, NavigableString) and c.strip() for c in el.children)


def _content_links(root: Tag, url: str | None) -> list[str]:
    """Absolute http(s) links from the article area (navigation and sidebars were removed), in page order."""
    out: list[str] = []
    for a in root.find_all("a", href=True):
        href = str(a["href"]).strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(url or "", href).split("#", 1)[0]
        if absolute.startswith(("http://", "https://")) and absolute not in out:
            out.append(absolute)
    return out


def passages(blocks: list[Block], *, target: int = PASSAGE_TARGET, maximum: int = PASSAGE_MAX, minimum: int = 80) -> list[str]:
    """Consecutive blocks of one section merged into passages of about `target` characters; blocks longer than
    `maximum` are split at sentence boundaries. Passages never span a section heading."""
    out: list[str] = []
    cur = ""
    cur_section: str | None = None

    def flush() -> None:
        nonlocal cur
        if len(cur) >= minimum:
            out.append(cur)
        cur = ""

    for b in blocks:
        if b.section != cur_section:
            flush()
            cur_section = b.section
        pieces = [b.text] if len(b.text) <= maximum else _split(b.text, target, maximum)
        for piece in pieces:
            if cur and len(cur) + 1 + len(piece) > maximum:
                flush()
            cur = f"{cur} {piece}".strip()
            if len(cur) >= target:
                flush()
    flush()
    return out


def _split(text: str, target: int, maximum: int) -> list[str]:
    parts: list[str] = []
    cur = ""
    for s in sentences(text) or [text]:
        if cur and len(cur) + 1 + len(s) > target:
            parts.append(cur)
            cur = ""
        cur = f"{cur} {s}".strip()
    if cur:
        parts.append(cur)
    return [p[:maximum] for p in parts]
