"""Remove repeated content from a research paper draft.

Models tend to restate the same claim in several sections. In the body of the paper (introduction through
discussion) this pass keeps the first occurrence of each statement and drops later sentences that say the
same thing (same key terms), moving any claim markers they carried onto the sentence that was kept so no
source is lost. The abstract and the conclusion are exempt: summarising is their job.
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


def _ids(sentence: str) -> list[str]:
    return [i for m in _MARK.finditer(sentence) for i in re.split(r"\s*[,;]\s*", m.group(1))]


def _key(sentence: str) -> set[str]:
    return terms(_MARK.sub(" ", sentence))


def similar(a: set[str], b: set[str]) -> bool:
    if len(a) < MIN_TERMS or len(b) < MIN_TERMS:
        return False
    return len(a & b) / min(len(a), len(b)) >= SIMILAR


_SUMMARISING = re.compile(r"^(?:conclusions?|concluding remarks|summary and conclusions?)$", re.I)


@dataclass
class _Kept:
    key: set[str]
    ids: list[str]
    where: tuple[int, int, int]  # (section, block, sentence)


def dedupe_report(draft: ReportDraft) -> ReportDraft:
    d = copy.deepcopy(draft)
    kept: list[_Kept] = []
    sentences: dict[tuple[int, int], list[str]] = {}
    for si, section in enumerate(d.sections):
        if _SUMMARISING.match(str(section.get("heading", ""))):
            continue
        for bi, block in enumerate(section["blocks"]):
            if block.get("type") != "paragraph":
                continue
            out: list[str] = []
            for s in _SPLIT.split(str(block.get("text", "")).strip()):
                if not s.strip():
                    continue
                key = _key(s)
                match = next((k for k in kept if similar(key, k.key)), None)
                if match is None:
                    kept.append(_Kept(key, _ids(s), (si, bi, len(out))))
                    out.append(s.strip())
                    continue
                missing = [i for i in _ids(s) if i not in match.ids]
                if missing:  # keep the sourcing of the dropped copy
                    msi, mbi, idx = match.where
                    target = out if (msi, mbi) == (si, bi) else sentences[(msi, mbi)]
                    sentence = target[idx]
                    end = sentence[-1] if sentence[-1:] in ".!?" else ""
                    target[idx] = (sentence[:-1] if end else sentence) + f" [{', '.join(missing)}]" + end
                    match.ids += missing
            sentences[(si, bi)] = out
    for (si, bi), out in sentences.items():
        d.sections[si]["blocks"][bi]["text"] = " ".join(out)
    for section in d.sections:
        section["blocks"] = [b for b in section["blocks"] if b.get("type") != "paragraph" or b.get("text")]
    d.sections = [s for s in d.sections if s["blocks"]]
    d.limitations = _unique(d.limitations)
    return d


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
