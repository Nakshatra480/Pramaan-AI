"""Test harness: real PostgreSQL (pgvector) test database + fake Firebase verifier.

Tests never talk to Firebase or production Neon. DATABASE_URL defaults to the
local docker test database and is refused if it doesn't look like a test DB.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost:5432/pramaan_test")
os.environ["ENVIRONMENT"] = "test"
os.environ["ENV_FILE"] = os.devnull  # never read backend/.env (real keys, real Redis) during tests
os.environ["REDIS_URL"] = ""
os.environ["MODEL_PROVIDER"] = "fake"
os.environ["EMBEDDING_PROVIDER"] = "fake"
os.environ["RUN_JOB_WORKER"] = "false"
os.environ["TAVILY_API_KEY"] = ""
os.environ["RATE_LIMIT_PER_MINUTE"] = "0"
os.environ["LOCAL_STORAGE_DIR"] = "/tmp/pramaan-test-storage"  # noqa: S108
assert "test" in os.environ["DATABASE_URL"].rsplit("/", 1)[-1], "Refusing to run tests against a non-test database."

from collections.abc import AsyncIterator  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.exceptions import Unauthenticated  # noqa: E402
from app.core.security import VerifiedIdentity, get_token_verifier  # noqa: E402
from app.db.database import get_engine  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.main import app  # noqa: E402

IDENTITIES = {
    "token-alice": VerifiedIdentity("uid-alice", "alice@example.com", True, "Alice Rao", None, "password"),
    "token-bob": VerifiedIdentity("uid-bob", "bob@example.com", True, "Bob Chen", None, "google"),
    "token-carol": VerifiedIdentity("uid-carol", "carol@example.com", True, "Carol Diaz", None, "password"),
    "token-unverified": VerifiedIdentity("uid-new", "new@example.com", False, None, None, "password"),
}


class FakeVerifier:
    async def verify(self, token: str) -> VerifiedIdentity:
        if token == "token-expired":
            raise Unauthenticated("Your session has expired. Please sign in again.", code="TOKEN_EXPIRED")
        if token not in IDENTITIES:
            raise Unauthenticated("Your session is invalid. Please sign in again.", code="TOKEN_INVALID")
        return IDENTITIES[token]


app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()


@pytest.fixture(autouse=True)
async def clean_db() -> AsyncIterator[None]:
    yield
    tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
    async with get_engine().begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


ALICE, BOB, CAROL = auth("token-alice"), auth("token-bob"), auth("token-carol")
