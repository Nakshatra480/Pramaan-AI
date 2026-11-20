"""Content-based file validation — extensions are hints, bytes are the truth."""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

from app.core.exceptions import PayloadTooLarge, ValidationFailed
from app.db.models import DocumentKind

UNSUPPORTED = "Supported files: PDF, DOCX, TXT and Markdown."


@dataclass(frozen=True)
class DetectedFile:
    kind: DocumentKind
    mime_type: str


def _looks_like_text(data: bytes) -> bool:
    sample = data[:65536]
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        # A multi-byte char may be cut at the sample boundary.
        try:
            sample[:-4].decode("utf-8")
        except UnicodeDecodeError:
            return False
    return True


def detect(filename: str, data: bytes, max_bytes: int) -> DetectedFile:
    if not data:
        raise ValidationFailed("The file is empty.", code="FILE_EMPTY")
    if len(data) > max_bytes:
        raise PayloadTooLarge(f"Files can be up to {max_bytes // (1024 * 1024)} MB.")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if data.startswith(b"%PDF-"):
        if ext != "pdf":
            raise ValidationFailed("File contents don't match its extension.", code="FILE_TYPE_MISMATCH")
        return DetectedFile(DocumentKind.pdf, "application/pdf")

    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = set(z.namelist())
                total = sum(i.file_size for i in z.infolist())
        except zipfile.BadZipFile as e:
            raise ValidationFailed(UNSUPPORTED, code="FILE_UNSUPPORTED") from e
        if "word/document.xml" not in names or ext != "docx":
            raise ValidationFailed(UNSUPPORTED, code="FILE_UNSUPPORTED")
        if total > max_bytes * 10:  # zip-bomb guard
            raise ValidationFailed("This document is too large to process.", code="FILE_TOO_COMPLEX")
        return DetectedFile(DocumentKind.docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    if ext in {"txt", "md", "markdown"} and _looks_like_text(data):
        return DetectedFile(DocumentKind.markdown if ext != "txt" else DocumentKind.txt, "text/markdown" if ext != "txt" else "text/plain")

    raise ValidationFailed(UNSUPPORTED, code="FILE_UNSUPPORTED")
