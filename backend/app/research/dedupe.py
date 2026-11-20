"""Remove repeated content from a report draft.

Models asked for a summary, findings and analysis tend to restate the same claim in every section.
This pass keeps the first occurrence of each statement and drops later sentences that say the same
thing (same key terms), moving any claim markers they carried onto the sentence that was kept so no
source is lost. Order of precedence: summary → findings → analysis. If that would remove most of the
findings (the summary just listed them), the findings win instead and the summary keeps what's left.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass

from app.research.state import ReportDraft
from app.research.text import terms

_MARK = re.compile(r"\s*\[(C\d+(?:\s*[,;]\s*C\d+)*)\]")
_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9“\"(])|(?<=\])\s+(?=[A-Z“\"(])")
MIN_TERMS = 4  # shorter sentences ("Evidence is limited.") are never treated as duplicates
SIMILAR = 0.8  # share of the shorter sentence's key terms that must appear in the other
# Analysis must add something: a sentence whose key terms were (almost) all said earlier in the
# report — e.g. two findings glued together — is a restatement, not analysis.
COVERED = 0.85
MIN_COVER_TERMS = 4
# Connective / generic words that carry no new information when judging whether analysis adds anything.
FILLER = set(
    [
        "while",
        "whereas",
        "although",
        "though",
        "however",
        "meanwhile",
        "also",
        "both",
        "either",
        "neither",
        "alongside",
        "additionally",
        "furthermore",
        "moreover",
        "aimed",
        "aims",
        "aiming",
        "suggest",
        "suggests",
        "suggesting",
        "suggested",
        "indicate",
        "indicates",
        "indicating",
        "indicated",
        "appear",
        "appears",
        "appearing",
        "seem",
        "seems",
        "likely",
        "possibly",
        "potentially",
        "generally",
        "typically",
        "often",
        "various",
        "several",
        "multiple",
        "many",
        "numerous",
        "diverse",
        "different",
        "range",
        "ranging",
        "across",
        "including",
        "include",
        "includes",
        "included",
        "such",
        "others",
        "other",
        "major",
        "firms",
        "companies",
        "organisations",
        "organizations",
        "offer",
        "offers",
        "offered",
        "offering",
        "provide",
        "provides",
        "provided",
        "providing",
        "available",
        "options",
        "opportunities",
        "pathways",
        "approach",
        "approaches",
        "together",
        "overall",
        "combined",
        "collectively",
        "broadly",
        "similar",
        "similarly",
        "highlight",
        "highlights",
        "highlighting",
        "reflect",
        "reflects",
        "reflecting",
        "show",
        "shows",
        "showing",
    ]
)


def _ids(sentence: str) -> list[str]:
    return [i for m in _MARK.finditer(sentence) for i in re.split(r"\s*[,;]\s*", m.group(1))]


def _key(sentence: str) -> set[str]:
    return terms(_MARK.sub(" ", sentence))


def similar(a: set[str], b: set[str]) -> bool:
    if len(a) < MIN_TERMS or len(b) < MIN_TERMS:
        return False
    return len(a & b) / min(len(a), len(b)) >= SIMILAR


@dataclass
class _Kept:
    key: set[str]
    ids: list[str]
    slot: tuple[str, int, int, int]  # (section, item, paragraph, sentence) — where to add carried markers


class _Pass:
    def __init__(self, draft: ReportDraft) -> None:
        self.d = copy.deepcopy(draft)
        self.kept: list[_Kept] = []
        # sentences per (section, item, paragraph) so carried markers can be appended in place
        self.text: dict[tuple[str, int, int], list[str]] = {}
        self.said: set[str] = set()  # every key term kept so far

    def paragraph(self, section: str, item: int, para: int, value: str) -> None:
        out: list[str] = []
        for s in _SPLIT.split(str(value).strip()):
            if not s.strip():
                continue
            key = _key(s)
            match = next((k for k in self.kept if similar(key, k.key)), None)
            content = key - FILLER
            if match is None and section == "analysis" and len(content) >= MIN_COVER_TERMS and len(content & self.said) / len(content) >= COVERED:
                continue  # nothing new — every point in it is already in the report
            if match is None:
                self.said |= key
                self.kept.append(_Kept(key, _ids(s), (section, item, para, len(out))))
                out.append(s.strip())
                continue
            missing = [i for i in _ids(s) if i not in match.ids]
            if missing:  # keep the sourcing of the dropped copy
                sec, it, pa, idx = match.slot
                target = out if (sec, it, pa) == (section, item, para) else self.text[(sec, it, pa)]
                sentence = target[idx]
                end = sentence[-1] if sentence[-1:] in ".!?" else ""
                target[idx] = (sentence[:-1] if end else sentence) + f" [{', '.join(missing)}]" + end
                match.ids += missing
        self.text[(section, item, para)] = out

    def run(self, order: tuple[str, ...]) -> ReportDraft:
        d = self.d
        for section in order:
            if section == "summary":
                for i, p in enumerate(d.summary):
                    self.paragraph("summary", i, 0, p)
            elif section == "findings":
                for i, f in enumerate(d.findings):
                    self.paragraph("findings", i, 0, f.get("body", ""))
            else:
                for i, a in enumerate(d.analysis):
                    for j, p in enumerate(a.get("paragraphs", [])):
                        self.paragraph("analysis", i, j, p)
        join = lambda key: " ".join(self.text.get(key, []))  # noqa: E731
        summary = [t for i in range(len(d.summary)) if (t := join(("summary", i, 0)))]
        findings = [{**f, "body": b} for i, f in enumerate(d.findings) if (b := join(("findings", i, 0)))]
        analysis = []
        for i, a in enumerate(d.analysis):
            paras = [t for j in range(len(a.get("paragraphs", []))) if (t := join(("analysis", i, j)))]
            if paras:
                analysis.append({**a, "paragraphs": paras})
        return ReportDraft(summary=summary, findings=findings, analysis=analysis, limitations=_unique(d.limitations))


def _unique(items: list[str]) -> list[str]:
    out: list[str] = []
    keys: list[set[str]] = []
    for x in items:
        k = _key(x)
        if any(similar(k, y) for y in keys) or x in out:
            continue
        keys.append(k)
        out.append(x)
    return out


def dedupe_report(draft: ReportDraft) -> ReportDraft:
    result = _Pass(draft).run(("summary", "findings", "analysis"))
    # A summary that just lists the findings would empty the Key Findings section. Then the
    # findings keep their detail and the summary keeps only what they don't already say.
    if len(result.findings) * 2 < len(draft.findings):
        alt = _Pass(draft).run(("findings", "analysis", "summary"))
        if not alt.summary and alt.findings:
            # The summary was nothing but the findings: lead with the first one instead of repeating it.
            alt.summary, alt.findings = [alt.findings[0]["body"]], alt.findings[1:]
        return alt
    return result
