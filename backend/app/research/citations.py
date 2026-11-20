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

    def citations(self) -> list[CitationMap]:
        return [CitationMap(index=i + 1, source_key=k) for i, k in enumerate(self.order)]


def map_report(draft: ReportDraft, claims: list[ClaimItem], evidence: list[EvidenceItem]) -> tuple[dict[str, object], list[CitationMap]]:
    m = CitationMapper(claims, evidence)
    valid = {c.id for c in claims if c.status in CITABLE}
    summary = [s for s in (m.render(p) for p in draft.summary) if s]
    findings = []
    for f in draft.findings:
        body = m.render(str(f.get("body", "")))
        if not body:
            continue
        raw_ids = f.get("claims")
        ids = [c for c in raw_ids if isinstance(c, str) and c in valid] if isinstance(raw_ids, list) else []
        ids = ids or [c for c in re.findall(r"C\d+", str(f.get("body", ""))) if c in valid]
        findings.append({"title": m._clean(str(f.get("title", "")))[:200], "body": body, "claimIds": list(dict.fromkeys(ids))})
    analysis = []
    for a in draft.analysis:
        raw = a.get("paragraphs")
        paras = [p for p in (m.render(x) for x in (raw if isinstance(raw, list) else []) if isinstance(x, str)) if p]
        if paras:
            analysis.append({"heading": m._clean(str(a.get("heading", "")))[:200], "paragraphs": paras})
    limitations = [s for s in (m.render(x) for x in draft.limitations) if s]
    return {"summary": summary, "findings": findings, "analysis": analysis, "limitations": limitations}, m.citations()
