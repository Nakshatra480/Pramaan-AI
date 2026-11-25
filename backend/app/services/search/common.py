"""Helpers shared by the search clients: URL normalisation (dedupe keys) and source-type classification."""

from __future__ import annotations

from urllib.parse import urlparse, urlunparse

from app.db.models import SourceType

NEWS = {
    "reuters.com",
    "bloomberg.com",
    "ft.com",
    "nytimes.com",
    "theguardian.com",
    "bbc.co.uk",
    "bbc.com",
    "wsj.com",
    "apnews.com",
    "cnbc.com",
    "theverge.com",
    "techcrunch.com",
    "economist.com",
}
ACADEMIC = {
    "arxiv.org",
    "nature.com",
    "science.org",
    "sciencedirect.com",
    "springer.com",
    "ieee.org",
    "ieeexplore.ieee.org",
    "acm.org",
    "pnas.org",
    "nejm.org",
    "thelancet.com",
    "jamanetwork.com",
    "plos.org",
    "journals.plos.org",
    "openreview.net",
    "aclanthology.org",
    "ncbi.nlm.nih.gov",
    "pubmed.ncbi.nlm.nih.gov",
}
REPORTS = {"iea.org", "mckinsey.com", "who.int", "worldbank.org", "imf.org", "oecd.org", "bis.org", "ipcc.ch"}


def normalize_url(url: str) -> str:
    p = urlparse(url.strip())
    host = (p.hostname or "").lower().removeprefix("www.")
    path = p.path.rstrip("/") or "/"
    query = "&".join(q for q in p.query.split("&") if q and not q.lower().startswith(("utm_", "ref=", "fbclid", "gclid")))
    return urlunparse((p.scheme.lower() or "https", host, path, "", query, ""))


def classify(domain: str) -> SourceType:
    d = domain.lower()
    if d == "wikipedia.org" or d.endswith(".wikipedia.org"):
        return SourceType.encyclopedia
    if any(d == x or d.endswith("." + x) for x in ACADEMIC):
        return SourceType.academic
    if any(d == x or d.endswith("." + x) for x in NEWS):
        return SourceType.news
    if any(d == x or d.endswith("." + x) for x in REPORTS) or d.endswith(".gov") or d.endswith(".int"):
        return SourceType.report
    if d.startswith("docs.") or "/docs" in d or d in {"github.com", "developer.mozilla.org"}:
        return SourceType.documentation
    return SourceType.web
