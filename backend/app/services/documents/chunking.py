"""Paragraph-aware chunking with overlap; keeps page metadata for citations."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.documents.extract import ExtractedDocument


@dataclass(frozen=True)
class Chunk:
    index: int
    content: str
    page: int | None


def _sentences(paragraph: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", paragraph) if s]


def chunk_document(doc: ExtractedDocument, target_chars: int = 1200, overlap_chars: int = 200) -> list[Chunk]:
    chunks: list[Chunk] = []
    buf: list[str] = []
    buf_page: int | None = None
    size = 0

    def flush() -> None:
        nonlocal buf, size
        text = " ".join(buf).strip()
        if len(text) >= 40:
            chunks.append(Chunk(len(chunks), text, buf_page))
        tail = text[-overlap_chars:]
        cut = tail.find(". ")
        carry = tail[cut + 2 :] if cut != -1 else ""
        buf, size = ([carry] if carry else []), len(carry)

    for page in doc.pages:
        for para in (p.strip() for p in page.text.split("\n\n")):
            if not para:
                continue
            units = [para] if len(para) <= target_chars else _sentences(para)
            for unit in units:
                if size + len(unit) > target_chars and size > 0:
                    flush()
                if not buf:
                    buf_page = page.page
                buf.append(unit)
                size += len(unit) + 1
    if buf:
        flush()
    return chunks
