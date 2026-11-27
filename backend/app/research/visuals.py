"""Tables, diagrams and figures for a research paper — validated against the evidence before they are used.

The model proposes visuals as structured data (rows with the claims behind them; diagram nodes, events or
branches; the id of a figure found on a source page). This module is the gate:

- a table row survives only if it cites verified claims and every figure in it appears in those claims or
  their evidence — a table can't introduce a number the evidence doesn't contain;
- a diagram survives only if its labels are drawn from the claims it cites; its Mermaid code is generated
  here from the structure (quoted, escaped labels; no directives, links or styles), so it is always valid
  and never carries model-written markup;
- a figure must be one of the images found on the report's own sources, keeps that page's caption and
  credit, and is shown only after the image URL was checked to serve a real image.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.db.models import ClaimStatus
from app.research.state import ClaimItem, EvidenceItem, ReportDraft, SourceItem
from app.research.text import terms

USABLE = (ClaimStatus.supported, ClaimStatus.partially_supported)

# Per mode: how many of each visual a paper may carry.
VISUAL_LIMITS: dict[str, dict[str, int]] = {
    "quick": {"tables": 1, "diagrams": 1, "figures": 1},
    "standard": {"tables": 2, "diagrams": 1, "figures": 2},
    "deep": {"tables": 3, "diagrams": 2, "figures": 3},
}

MAX_COLUMNS = 6
MAX_ROWS = 12
MAX_CELL = 140
MAX_LABEL = 60
LABEL_SUPPORT = 0.5  # share of a diagram's label words that must come from its claims (or the question)
_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
_CAPTION_PREFIX = re.compile(r"^\s*(?:table|figure|fig\.?|diagram|chart)\s*\d*\s*[:.\-–—]\s*", re.I)
_CLAIM_MARK = re.compile(r"\s*[\[(]\s*[CE]\d+(?:\s*(?:,|;|and)\s*[CE]\d+)*\s*[\])]")


@dataclass
class ImageCandidate:
    id: str  # I1…
    url: str
    caption: str
    credit: str  # the source's publisher
    page_url: str
    source_key: str


@dataclass
class Visuals:
    tables: list[dict[str, Any]] = field(default_factory=list)  # {"section", "caption", "columns", "rows"}
    diagrams: list[dict[str, Any]] = field(default_factory=list)  # {"section", "caption", "code", "claims"}
    figures: list[dict[str, Any]] = field(default_factory=list)  # {"section", "caption", "url", "credit", "page_url", "source_key"}


def _text(value: object, limit: int) -> str:
    text = str(value or "").translate(_PLAIN)
    return " ".join(_CLAIM_MARK.sub("", text).split())[:limit].strip()


_PLAIN = str.maketrans({"\u2010": "-", "\u2011": "-", "\u00a0": " ", "\u202f": " ", "\u2009": " "})


def caption(value: object) -> str:
    return _CAPTION_PREFIX.sub("", _text(value, 220)).rstrip(".")


def _numbers(text: str) -> set[str]:
    out = set()
    for n in _NUMBER.findall(text):
        plain = n.replace(",", "")
        out.add(plain)
        if "." in plain:
            out.add(plain.rstrip("0").rstrip("."))
    return out


# ------------------------------------------------------------------ figures


def image_candidates(sources: list[SourceItem], claims: list[ClaimItem], evidence: list[EvidenceItem], limit: int = 12) -> list[ImageCandidate]:
    """Images found on the sources the verified claims rest on (most relevant first, at most two per source)."""
    ev_source = {e.id: e.source_key for e in evidence}
    cited = {ev_source[e] for c in claims if c.status in USABLE for e in c.evidence_ids if e in ev_source}
    out: list[ImageCandidate] = []
    seen: set[str] = set()
    for s in sorted((s for s in sources if s.key in cited and s.images), key=lambda s: -s.relevance):
        for img in s.images[:2]:
            url, cap = img.get("url", ""), caption(img.get("caption"))  # without the page's own "Figure 3." numbering
            if not url or not cap or url in seen:
                continue
            seen.add(url)
            out.append(ImageCandidate(f"I{len(out) + 1}", url, cap, s.publisher or s.domain, s.url, s.key))
            if len(out) >= limit:
                return out
    return out


# ------------------------------------------------------------------ diagrams → Mermaid


def _label(value: object, limit: int = MAX_LABEL) -> str:
    """A diagram label safe inside a quoted Mermaid string (no quotes, brackets, pipes or markup), shortened at a
    word boundary with "…" rather than cut mid-word."""
    text = " ".join(re.sub(r"[\"`<>{}\[\]|#]", " ", _text(value, 400).replace(";", ",")).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:-–") + "…"


def _wrap(label: str, width: int = 26) -> str:
    words, lines, cur = label.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return "<br>".join(lines[:3])


def _flow(nodes: list[dict[str, Any]], edges: list[dict[str, Any]], direction: str) -> tuple[str, list[str]] | None:
    ids: dict[str, str] = {}
    lines = [f"flowchart {direction}"]
    labels: list[str] = []
    for n in nodes[:14]:
        key, text = str(n.get("id") or ""), _label(n.get("label"))
        if not key or not text or key in ids:
            continue
        ids[key] = f"n{len(ids) + 1}"
        labels.append(text)
        lines.append(f'    {ids[key]}["{_wrap(text)}"]')
    if len(ids) < 3:
        return None
    links = 0
    for e in edges[:24]:
        a, b = ids.get(str(e.get("from") or "")), ids.get(str(e.get("to") or ""))
        if not a or not b or a == b:
            continue
        text = _label(e.get("label"))[:40]
        lines.append(f'    {a} -->|"{text}"| {b}' if text else f"    {a} --> {b}")
        labels.append(text)
        links += 1
    return ("\n".join(lines), labels) if links >= 2 else None


def _timeline(events: list[dict[str, Any]]) -> tuple[str, list[str]] | None:
    """A chronology as a vertical chain of dated steps: readable at any length (Mermaid's own timeline lays
    events side by side and shrinks them to illegibility once there are more than a few)."""
    lines: list[str] = ["flowchart TD"]
    labels: list[str] = []
    for e in events[:10]:
        period = _label(e.get("period"), 24)
        text = _label(e.get("text"), 96)
        if period and text:
            n = len(labels) + 1
            lines.append(f'    n{n}["{period}<br>{_wrap(text, 54)}"]')
            labels.append(text)
    if len(labels) < 3:
        return None
    lines += [f"    n{i} --> n{i + 1}" for i in range(1, len(labels))]
    return "\n".join(lines), labels


def _hierarchy(root: object, children: list[Any]) -> tuple[str, list[str]] | None:
    top = _label(root)
    if not top:
        return None
    lines, labels = ["flowchart TD", f'    n1["{_wrap(top)}"]'], [top]
    count = 1
    for child in children[:8]:
        label = _label(child.get("label") if isinstance(child, dict) else child)
        if not label:
            continue
        count += 1
        cid = f"n{count}"
        lines += [f'    {cid}["{_wrap(label)}"]', f"    n1 --> {cid}"]
        labels.append(label)
        for leaf in (child.get("children") if isinstance(child, dict) else None) or []:
            text = _label(leaf.get("label") if isinstance(leaf, dict) else leaf)
            if text and count < 20:
                count += 1
                lines += [f'    n{count}["{_wrap(text)}"]', f"    {cid} --> n{count}"]
                labels.append(text)
    return ("\n".join(lines), labels) if count >= 3 else None


def build_diagram(d: dict[str, Any]) -> tuple[str, list[str]] | None:
    """Mermaid code (and the labels it shows) for a structured diagram, or None if the structure is unusable."""
    kind = str(d.get("kind") or "")
    if kind == "flow":
        nodes_ = d.get("nodes")
        many = isinstance(nodes_, list) and len(nodes_) > 5  # a long left-to-right chain would shrink to illegibility
        direction = "TD" if many or str(d.get("direction") or "").upper() in ("TD", "TB") else "LR"
        nodes, edges = d.get("nodes"), d.get("edges")
        return _flow(nodes, edges, direction) if isinstance(nodes, list) and isinstance(edges, list) else None
    if kind == "timeline":
        events = d.get("events")
        return _timeline([e for e in events if isinstance(e, dict)]) if isinstance(events, list) else None
    if kind == "hierarchy":
        children = d.get("children")
        return _hierarchy(d.get("root"), children) if isinstance(children, list) else None
    return None


# ------------------------------------------------------------------ validation


def _claims(raw: object, usable: dict[str, ClaimItem]) -> list[str]:
    return list(dict.fromkeys(c for c in raw if isinstance(c, str) and c in usable)) if isinstance(raw, list) else []


def _support_text(ids: list[str], usable: dict[str, ClaimItem], evidence: dict[str, EvidenceItem]) -> str:
    parts = []
    for cid in ids:
        c = usable[cid]
        parts.append(c.text)
        parts += [evidence[e].passage for e in c.evidence_ids if e in evidence]
    return " ".join(parts)


def _section(raw: object, n_sections: int) -> int | None:
    try:
        i = int(str(raw)) - 1
    except ValueError:
        return None
    return i if 0 <= i < n_sections else None


def _table(t: dict[str, Any], usable: dict[str, ClaimItem], evidence: dict[str, EvidenceItem]) -> dict[str, Any] | None:
    columns = [_text(c, 60) for c in t.get("columns") or [] if _text(c, 60)] if isinstance(t.get("columns"), list) else []
    if not 2 <= len(columns) <= MAX_COLUMNS:
        return None
    rows: list[dict[str, Any]] = []
    for r in t.get("rows") or []:
        if not isinstance(r, dict) or not isinstance(r.get("cells"), list):
            continue
        cells = [_text(c, MAX_CELL) for c in r["cells"]]
        ids = _claims(r.get("claims"), usable)
        if len(cells) != len(columns) or not ids or not all(cells):
            continue
        # Every figure in the row must be stated by the claims it cites (or their evidence).
        if not _numbers(" ".join(cells)) <= _numbers(_support_text(ids, usable, evidence)):
            continue
        rows.append({"cells": cells, "claims": ids})
        if len(rows) >= MAX_ROWS:
            break
    if len(rows) < 2 or not caption(t.get("caption")):
        return None
    # A comparison must compare: rows that all carry the same values (one claim's figure copied down) say nothing.
    values = {tuple(r["cells"][1:]) for r in rows}
    if len(values) < 2 or len({r["cells"][0] for r in rows}) < len(rows):
        return None
    return {"caption": caption(t.get("caption")), "columns": columns, "rows": rows}


def _diagram(d: dict[str, Any], usable: dict[str, ClaimItem], question: str) -> dict[str, Any] | None:
    ids = _claims(d.get("claims"), usable)
    built = build_diagram(d)
    if not ids or built is None or not caption(d.get("caption")):
        return None
    code, labels = built
    shown = terms(" ".join(labels))
    allowed = terms(" ".join(usable[c].text for c in ids) + " " + question)
    if not shown or len(shown & allowed) / len(shown) < LABEL_SUPPORT:
        return None  # the diagram says things its claims don't
    return {"caption": caption(d.get("caption")), "code": code, "claims": ids}


def parse_visuals(
    data: object,
    *,
    claims: list[ClaimItem],
    evidence: list[EvidenceItem],
    candidates: list[ImageCandidate],
    n_sections: int,
    mode: str,
    question: str,
) -> Visuals:
    """Validated visuals from the model's proposal; anything that fails a check is left out."""
    out = Visuals()
    if not isinstance(data, dict) or n_sections < 1:
        return out
    limits = VISUAL_LIMITS.get(mode, VISUAL_LIMITS["standard"])
    usable = {c.id: c for c in claims if c.status in USABLE}
    ev = {e.id: e for e in evidence}
    for t in data.get("tables") or []:
        if isinstance(t, dict) and len(out.tables) < limits["tables"] and (table := _table(t, usable, ev)):
            out.tables.append({**table, "section": _section(t.get("section"), n_sections)})
    for d in data.get("diagrams") or []:
        if isinstance(d, dict) and len(out.diagrams) < limits["diagrams"] and (diagram := _diagram(d, usable, question)):
            out.diagrams.append({**diagram, "section": _section(d.get("section"), n_sections)})
    by_id = {c.id: c for c in candidates}
    used: set[str] = set()
    for f in data.get("figures") or []:
        image = by_id.get(str(f.get("image") or "")) if isinstance(f, dict) else None
        if image is None or image.url in used or len(out.figures) >= limits["figures"]:
            continue
        used.add(image.url)
        out.figures.append(
            {
                "section": _section(f.get("section"), n_sections),  # type: ignore[union-attr]
                "caption": image.caption,  # the source's own caption, never model-written
                "url": image.url,
                "credit": image.credit,
                "page_url": image.page_url,
                "source_key": image.source_key,
            }
        )
    return out


# ------------------------------------------------------------------ placement


def _best_section(draft: ReportDraft, text: str) -> int:
    """The body section whose text best matches a visual's caption (never the introduction if avoidable)."""
    want = terms(text)
    scores = []
    for i, s in enumerate(draft.sections):
        body = " ".join(b.get("text", "") for b in s["blocks"] if b.get("type") == "paragraph")
        scores.append((len(want & terms(f"{s['heading']} {body}")), -i if i else -999, i))
    return max(scores)[2] if scores else 0


def place_visuals(draft: ReportDraft, visuals: Visuals) -> ReportDraft:
    """Puts each visual after the first paragraph of its section (or of the section that best matches it)."""
    if not draft.sections:
        return draft
    placed: dict[int, list[dict[str, Any]]] = {}
    for kind, items in (("table", visuals.tables), ("diagram", visuals.diagrams), ("figure", visuals.figures)):
        for v in items:
            i = v["section"] if v.get("section") is not None else _best_section(draft, v["caption"])
            placed.setdefault(i, []).append({"type": kind, **{k: val for k, val in v.items() if k != "section"}})
    for i, blocks in placed.items():
        section = draft.sections[i]
        at = next((n + 1 for n, b in enumerate(section["blocks"]) if b.get("type") == "paragraph"), len(section["blocks"]))
        section["blocks"][at:at] = blocks
    return draft
