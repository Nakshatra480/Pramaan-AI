"""Deterministic citation mapping (PRD §25).

The model writes claim markers ([C3]). Here each marker is resolved:
claim → its evidence → the stored sources behind that evidence → numbered
citations [1][2] assigned in order of first appearance. Unknown ids, claims
without adequate support, raw URLs, markdown links and any numeric citations
the model tried to write itself are all removed.
"""

from __future__ import annotations

import re

from app.db.models import ClaimStatus
from app.research.state import CitationMap, ClaimItem, EvidenceItem, ReportDraft
from app.research.text import overlap, terms

_CLAIM_MARK = re.compile(r"\s*\[(C\d+(?:\s*[,;]\s*C\d+)*)\]")
_EVIDENCE_MARK = re.compile(r"\s*\[(E\d+(?:\s*[,;]\s*E\d+)*)\]")
_NUMERIC = re.compile(r"\s*\[\d{1,3}\]")
_MD_LINK = re.compile(r"\[([^\]]+)\]\((?:https?://|www\.)[^)]*\)")
_URL = re.compile(r"\s*(?:https?://|www\.)\S+")
# Models sometimes drop the brackets: "supported by C1", "(C2, C3)". Normalise to [C1] form first —
# but only in citation position (parenthesised, or after a cue like "supported by") and only for ids
# that exist in this report, so real terms such as the "C4" dataset or an "E10" road survive.
_BARE = {
    "claim": re.compile(r"(\()?\b(C\d+(?:\s*(?:,|;|and)\s*C\d+)*)\b(\))?(?!\])"),
    "evidence": re.compile(r"(\()?\b(E\d+(?:\s*(?:,|;|and)\s*E\d+)*)\b(\))?(?!\])"),
}
_CUE = re.compile(r"(?:\b(?:claims?|evidence|passages?|see|per|by|from|as|cf\.?|in))\s*$", re.IGNORECASE)
_ID_SPLIT = re.compile(r"\s*(?:,|;|and)\s*")
CITABLE = {ClaimStatus.supported, ClaimStatus.partially_supported}
# Minimum lexical overlap between a sentence and a claim it cites (see CitationMapper._faithful_markers).
FIDELITY = 0.2
# Sentence boundary that keeps a trailing marker ("… storage [C1]. Next") with its own sentence.
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9“\"(])|(?<=\])\s+(?=[A-Z“\"(])")


_PLAIN = str.maketrans({"\u2010": "-", "\u2011": "-", "\u00a0": " ", "\u202f": " ", "\u2009": " "})
_PERCENT = re.compile(r"(\d)\s+%")
# A claim id written in parentheses where a value belongs ("99.5% (C3)") — never shown to readers.
_PAREN_IDS = re.compile(r"\s*[(\[]\s*[CE]\d+(?:\s*(?:,|;|and)\s*[CE]\d+)*\s*[)\]]")

# Adjacent citation groups ("[1] [2] [2][3]") — merged into one ordered, de-duplicated run: " [1][2][3]".
_RUN = re.compile(r"(?:\s*\[\d{1,3}\]){2,}")


def _tidy_run(m: re.Match[str]) -> str:
    nums = list(dict.fromkeys(int(n) for n in re.findall(r"\d+", m.group(0))))
    return " " + "".join(f"[{n}]" for n in nums)


class CitationMapper:
    def __init__(self, claims: list[ClaimItem], evidence: list[EvidenceItem]) -> None:
        self.claims = {c.id: c for c in claims}
        self.evidence = {e.id: e for e in evidence}
        self.order: list[str] = []  # source keys by citation index

    def _index(self, source_key: str) -> int:
        if source_key not in self.order:
            self.order.append(source_key)
        return self.order.index(source_key) + 1

    def _sources_for_claim(self, claim_id: str) -> list[str]:
        c = self.claims.get(claim_id)
        if c is None or c.status not in CITABLE:
            return []
        ev = sorted((self.evidence[e] for e in c.evidence_ids if e in self.evidence), key=lambda e: -e.relevance)
        return list(dict.fromkeys(e.source_key for e in ev))

    def _sources_for_evidence(self, evidence_id: str) -> list[str]:
        e = self.evidence.get(evidence_id)
        return [e.source_key] if e else []

    @staticmethod
    def _clean(text: str) -> str:
        text = _MD_LINK.sub(r"\1", text)
        text = _URL.sub("", text)
        text = text.translate(_PLAIN)  # non-breaking hyphens and spaces → plain (search, copy and screen readers)
        text = _PERCENT.sub(r"\1%", text)  # "85 %" → "85%"
        return _NUMERIC.sub("", text)

    def render(self, text: str, *, kind: str = "claim") -> str:
        text = self._clean(str(text))
        text = "".join(part if part.startswith("[") else self._bracket_bare(part, kind) for part in re.split(r"(\[[^\]]*\])", text))
        if kind == "claim":
            text = " ".join(self._faithful_markers(sentence) for sentence in _SENTENCE.split(text))
        pattern, resolve = (_CLAIM_MARK, self._sources_for_claim) if kind == "claim" else (_EVIDENCE_MARK, self._sources_for_evidence)

        def repl(m: re.Match[str]) -> str:
            keys: list[str] = []
            for cid in re.split(r"\s*[,;]\s*", m.group(1)):
                keys += [k for k in resolve(cid) if k not in keys]
            return " " + "".join(f"[{self._index(k)}]" for k in sorted(keys, key=self._index)) if keys else ""

        out = pattern.sub(repl, text)
        # Strip markers of the other kind too — nothing unresolved survives.
        out = _CLAIM_MARK.sub("", out) if kind != "claim" else _EVIDENCE_MARK.sub("", out)
        out = _RUN.sub(_tidy_run, out)
        return re.sub(r"\s+([.,;:])", r"\1", out).strip()

    def _faithful_markers(self, sentence: str) -> str:
        """Keep a claim marker only if the sentence actually restates that claim (shares enough of its
        wording). Interpretation the model added on its own stays in the text but loses the citation,
        so commentary is never presented as sourced evidence (audit M-05)."""
        plain = terms(_CLAIM_MARK.sub(" ", sentence))

        def keep(m: re.Match[str]) -> str:
            ids = [c for c in re.split(r"\s*[,;]\s*", m.group(1)) if c in self.claims and overlap(plain, terms(self.claims[c].text)) >= FIDELITY]
            return f" [{', '.join(ids)}]" if ids else ""

        return _CLAIM_MARK.sub(keep, sentence)

    def _bracket_bare(self, part: str, kind: str) -> str:
        known = self.claims if kind == "claim" else self.evidence

        def repl(m: re.Match[str]) -> str:
            ids = _ID_SPLIT.split(m.group(2))
            cited = (m.group(1) and m.group(3)) or _CUE.search(part[: m.start()])
            if not cited or not all(i in known for i in ids):
                return m.group(0)
            return "[" + ", ".join(ids) + "]"

        return _BARE[kind].sub(repl, part)

    def markers(self, claim_ids: list[str], limit: int = 4) -> str:
        """Citation markers (" [1][2]") for a list of claims — for table rows and diagrams, whose text is too terse
        for the sentence-level fidelity check. At most `limit` sources (the strongest evidence of each claim first),
        so a caption isn't a wall of numbers."""
        keys: list[str] = []
        for cid in claim_ids:
            keys += [k for k in self._sources_for_claim(cid) if k not in keys]
        return " " + "".join(f"[{self._index(k)}]" for k in sorted(keys[:limit], key=self._index)) if keys else ""

    def source_index(self, source_key: str) -> int:
        """The citation number of a source (numbering it if the text hasn't cited it yet) — for figure credits."""
        return self._index(source_key)

    def citations(self) -> list[CitationMap]:
        return [CitationMap(index=i + 1, source_key=k) for i, k in enumerate(self.order)]


def _plain(text: object, limit: int) -> str:
    """Text that may not carry citation markers of its own (table cells, headings, captions before markers)."""
    text = _PAREN_IDS.sub("", CitationMapper._clean(str(text or "")))
    return " ".join(_EVIDENCE_MARK.sub("", _CLAIM_MARK.sub("", text)).split())[:limit]


def map_report(draft: ReportDraft, claims: list[ClaimItem], evidence: list[EvidenceItem]) -> tuple[dict[str, object], list[CitationMap]]:
    """Resolves the paper's claim markers into numbered citations, in reading order (abstract → sections →
    limitations), and returns the stored report with its citation list."""
    m = CitationMapper(claims, evidence)
    valid = {c.id for c in claims if c.status in CITABLE}
    abstract = [s for s in (m.render(p) for p in draft.abstract) if s]
    sections: list[dict[str, object]] = []
    for sec in draft.sections:
        blocks: list[dict[str, object]] = []
        for b in sec.get("blocks", []):
            kind = b.get("type")
            if kind == "paragraph":
                if text := m.render(str(b.get("text", ""))):
                    blocks.append({"type": "paragraph", "text": text})
            elif kind == "list":
                items = [t for t in (m.render(str(x)) for x in b.get("items", []) if isinstance(x, str)) if t]
                if items:
                    blocks.append({"type": "list", "items": items})
            elif kind == "table":
                rows = []
                for r in b.get("rows", []):
                    ids = [c for c in r.get("claims", []) if c in valid]
                    cells = [_plain(c, 160) for c in r.get("cells", [])]
                    if ids and cells:
                        cells[-1] = cells[-1] + m.markers(ids)
                        rows.append(cells)
                if len(rows) >= 2:
                    blocks.append(
                        {"type": "table", "caption": _plain(b.get("caption"), 240), "columns": [_plain(c, 80) for c in b.get("columns", [])], "rows": rows}
                    )
            elif kind == "diagram":
                ids = [c for c in b.get("claims", []) if c in valid]
                if ids and b.get("code"):
                    blocks.append({"type": "diagram", "caption": _plain(b.get("caption"), 240) + m.markers(ids), "code": str(b["code"])})
            elif kind == "figure" and b.get("url"):
                blocks.append(
                    {
                        "type": "figure",
                        "caption": _plain(b.get("caption"), 240),
                        "url": str(b["url"]),
                        "credit": _plain(b.get("credit"), 120),
                        "sourceUrl": str(b.get("page_url") or ""),
                        "sourceIndex": m.source_index(str(b["source_key"])) if b.get("source_key") else None,
                    }
                )
        if blocks:
            sections.append({"heading": _plain(sec.get("heading"), 160), "blocks": blocks})
    limitations = [s for s in (m.render(x) for x in draft.limitations) if s]
    report: dict[str, object] = {
        "format": "paper",
        "title": _plain(draft.title, 200),
        "keywords": [_plain(k, 40) for k in draft.keywords if _plain(k, 40)],
        "summary": abstract,  # the abstract; older readers (follow-ups, revisions) use "summary"
        "findings": [],
        "analysis": [],
        "sections": sections,
        "limitations": limitations,
    }
    return report, m.citations()
