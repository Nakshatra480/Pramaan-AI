"""Small, dependency-free text helpers used by extractive fallbacks."""

from __future__ import annotations

import math
import re

# Sentence boundary — but not after titles, common abbreviations or initials ("Dr. Ilse Varga",
# "J. Smith", "e.g. X"), which used to cut evidence passages off mid-name.
_ABBREV = "".join(
    rf"(?<!\b{a})"
    for a in (r"Dr\.", r"Mr\.", r"Ms\.", r"Mrs\.", r"Prof\.", r"St\.", r"Jr\.", r"Sr\.", r"vs\.", r"No\.", r"Fig\.", r"al\.", r"e\.g\.", r"i\.e\.", r"[A-Z]\.")
)
_SENT = re.compile(rf"(?<=[.!?]){_ABBREV}\s+(?=[A-Z0-9“\"(])")
_WORD = re.compile(r"[a-z0-9][a-z0-9\-]{2,}")
STOP = set(
    [
        "the",
        "and",
        "for",
        "with",
        "that",
        "this",
        "from",
        "are",
        "was",
        "were",
        "have",
        "has",
        "had",
        "not",
        "but",
        "you",
        "your",
        "its",
        "their",
        "them",
        "into",
        "over",
        "under",
        "than",
        "then",
        "there",
        "these",
        "those",
        "which",
        "what",
        "when",
        "where",
        "who",
        "how",
        "why",
        "about",
        "also",
        "such",
        "can",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "more",
        "most",
        "less",
        "many",
        "much",
        "very",
        "been",
        "being",
        "does",
        "did",
        "done",
        "using",
        "used",
        "use",
        "per",
        "via",
        "among",
        "between",
        "within",
        "without",
        "across",
    ]
)


def sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENT.split(" ".join(text.split())) if 25 <= len(s.strip()) <= 600]


def terms(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in STOP}


def overlap(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / math.sqrt(len(a) * len(b))


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def title_case_query(q: str) -> str:
    q = " ".join(q.split()).rstrip("?.! ")
    return q[:1].upper() + q[1:]
