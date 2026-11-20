from sqlalchemy import func, select

from app.db.database import get_sessionmaker
from app.db.models import DocumentChunk, User
from app.services.embeddings import EmbeddingService
from app.services.jobs import get_job_runner
from app.services.retrieval import HybridRetriever
from tests.conftest import ALICE

TEXT = b"""Solid-state batteries use a solid electrolyte instead of a liquid one.

Manufacturing yield at the electrolyte layering step is the largest contributor to projected cell cost.

Sulfide electrolytes now exceed one thousand cycles in pouch cells under high stack pressure."""


async def test_chunks_embeddings_and_hybrid_retrieval(client) -> None:  # type: ignore[no-untyped-def]
    doc = (await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("ssb.md", TEXT)})).json()
    await get_job_runner().drain()
    async with get_sessionmaker()() as db:
        chunks = (await db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc["id"]))).all()
        assert chunks and all(c.embedding is not None and len(c.embedding) == 768 for c in chunks)
        owner = await db.scalar(select(User.id).where(User.firebase_uid == "uid-alice"))
        assert all(c.user_id == owner for c in chunks)
        assert await db.scalar(
            select(func.count()).select_from(DocumentChunk).where(DocumentChunk.tsv.op("@@")(func.plainto_tsquery("english", "electrolyte")))
        )
        hits = await HybridRetriever(db, EmbeddingService()).search("What limits solid-state battery cost?", [c.document_id for c in chunks[:1]], 3)
        assert hits and "yield" in hits[0].content
        # Scope is enforced by the caller-provided document list: empty scope → nothing.
        assert await HybridRetriever(db).search("electrolyte", [], 3) == []
