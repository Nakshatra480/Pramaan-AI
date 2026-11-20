"""Text extraction + normalisation per document kind."""

from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from app.db.models import DocumentKind


@dataclass
class ExtractedPage:
    text: str
    page: int | None = None


@dataclass
class ExtractedDocument:
    pages: list[ExtractedPage]
    title: str | None = None
    author: str | None = None
    meta: dict[str, str] = field(default_factory=dict)


class ExtractionError(Exception):
    pass


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).replace("\x00", "")
    text = re.sub(r"-\n(?=[a-z])", "", text)  # de-hyphenate line breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract(kind: DocumentKind, data: bytes) -> ExtractedDocument:
    if kind == DocumentKind.pdf:
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError

        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise ExtractionError("The PDF is password-protected. Remove protection and try again.")
            pages = [ExtractedPage(normalize(p.extract_text() or ""), i + 1) for i, p in enumerate(reader.pages)]
            info: Any = reader.metadata or {}
            doc = ExtractedDocument(pages, title=getattr(info, "title", None), author=getattr(info, "author", None))
        except PdfReadError as e:
            raise ExtractionError("The PDF appears to be damaged.") from e
    elif kind == DocumentKind.docx:
        import docx

        try:
            d = docx.Document(io.BytesIO(data))
        except Exception as e:
            raise ExtractionError("The document could not be opened.") from e
        body = "\n\n".join(p.text for p in d.paragraphs if p.text.strip())
        doc = ExtractedDocument([ExtractedPage(normalize(body))], title=d.core_properties.title or None, author=d.core_properties.author or None)
    else:
        doc = ExtractedDocument([ExtractedPage(normalize(data.decode("utf-8", errors="replace")))])

    if not any(p.text for p in doc.pages):
        raise ExtractionError("No text could be extracted. The file may be scanned images.")
    return doc
