"""Database URL handling.

Neon hands out libpq-style URLs (`postgresql://…?sslmode=require&channel_binding=require`).
asyncpg needs `postgresql+asyncpg://` and `ssl=`; libpq-only options are dropped.
Nothing here ever logs the URL itself — use `redact()`.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"}  # noqa: S104
_LIBPQ_ONLY = {"channel_binding", "gssencmode", "target_session_attrs", "options", "application_name"}


@dataclass(frozen=True)
class DbTarget:
    url: str  # normalised asyncpg URL
    host: str
    ssl: bool
    pooled: bool  # Neon PgBouncer ("-pooler") endpoint


def normalize(raw: str) -> DbTarget:
    parts = urlsplit(raw.strip())
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql", "postgresql+psycopg", "postgresql+psycopg2"):
        scheme = "postgresql+asyncpg"
    if scheme != "postgresql+asyncpg":
        raise ValueError("DATABASE_URL must be a PostgreSQL URL.")
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    if sslmode and "ssl" not in query:
        query["ssl"] = sslmode  # asyncpg accepts require / verify-ca / verify-full / disable
    for k in _LIBPQ_ONLY:
        query.pop(k, None)
    host = (parts.hostname or "").lower()
    url = urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), ""))
    ssl = query.get("ssl", "disable") not in ("disable", "allow", "prefer", "false")
    return DbTarget(url=url, host=host, ssl=ssl, pooled="-pooler." in host)


def redact(raw: str) -> str:
    """host/db only — never credentials or query options."""
    parts = urlsplit(raw)
    return f"{parts.hostname or '?'}{parts.path or ''}"
