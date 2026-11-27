"""Regression tests for the fixes from the product audit (C-01…L-14; one or more per finding)."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update

from app.db.database import get_sessionmaker
from app.db.models import Document, ResearchSession, User
from app.research import runner
from app.research.llm import claims_budget, report_shape, verify_budget
from app.research.nodes.evidence import source_cap
from app.services.jobs import get_job_runner
from app.services.llm.base import ModelUnavailable
from app.services.llm.fake import FakeProvider
from tests.conftest import ALICE, BOB, CAROL
from tests.fakes import FakeAcademic, FakeWeb, make_deps

Q = "What are the latest developments in humanoid robots?"
MEMO = (
    b"Zephyr-9 Turbine Programme - Internal Trial Memo. This memo records the March 2026 trial at the Kestrel facility.\n\n"
    b"The Zephyr-9 turbine achieved a thermal efficiency of 47.3 percent during the March 2026 trial. The trial ran for 312 hours.\n\n"
    b"The lead engineer for the Zephyr-9 programme is Dr. Ilse Varga. The programme budget approved for 2026 is 3.2 million euros.\n\n"
    b"The main open risk is blade coating erosion of 0.4 millimetres on the first-stage blades."
)


@pytest.fixture(autouse=True)
def fake_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "default_deps", make_deps(FakeWeb(), FakeAcademic()))


async def research(client: AsyncClient, headers=ALICE, **body) -> dict:  # type: ignore[no-untyped-def,type-arg]
    r = await client.post("/api/v1/research", headers=headers, json={"query": Q, "mode": "standard", "sources": ["web", "academic"], **body})
    assert r.status_code == 202, r.text
    await get_job_runner().drain()
    return (await client.get(f"/api/v1/research/{r.json()['researchId']}", headers=headers)).json()


async def upload(client: AsyncClient, name: str, data: bytes, headers=ALICE, **form) -> dict:  # type: ignore[no-untyped-def,type-arg]
    r = await client.post("/api/v1/library/upload", headers=headers, files={"file": (name, data)}, data=form)
    assert r.status_code in (200, 201), r.text
    await get_job_runner().drain()
    return r.json()


# ---------------------------------------------------------------- C-01 delete account


async def test_delete_account_removes_all_user_data_and_files_but_nothing_else(client: AsyncClient) -> None:
    from app.services.storage.base import get_storage

    project = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Alice project"})).json()
    doc = await upload(client, "memo.txt", MEMO, projectId=project["id"])
    r = await research(client)
    assert r["status"] == "completed"
    bob_project = (await client.post("/api/v1/projects", headers=BOB, json={"name": "Bob project"})).json()
    keys = [k for k in await get_storage().list_keys("users/") if doc["id"] in k]
    assert keys  # original + extracted text

    assert (await client.delete("/api/v1/me", headers=ALICE)).status_code == 204
    await get_job_runner().drain()

    async with get_sessionmaker()() as db:
        assert await db.scalar(select(func.count()).select_from(User).where(User.firebase_uid == "uid-alice")) == 0
        assert await db.scalar(select(func.count()).select_from(Document).where(Document.id == uuid.UUID(doc["id"]))) == 0
        assert await db.scalar(select(func.count()).select_from(ResearchSession).where(ResearchSession.id == uuid.UUID(r["id"]))) == 0
    assert [k for k in await get_storage().list_keys("users/") if doc["id"] in k] == []
    assert (await client.get(f"/api/v1/projects/{bob_project['id']}", headers=BOB)).status_code == 200  # others untouched
    # The same (still valid) token now maps to a brand-new, empty profile — nothing was kept.
    assert (await client.get("/api/v1/research", headers=ALICE)).json() == []
    assert (await client.get("/api/v1/projects", headers=ALICE)).json() == []


# ---------------------------------------------------------------- H-05 export / usage / retention


async def test_export_contains_only_the_callers_data(client: AsyncClient) -> None:
    await client.post("/api/v1/projects", headers=ALICE, json={"name": "Exported project"})
    await upload(client, "memo.txt", MEMO)
    await research(client)
    await research(client, headers=BOB)
    r = await client.get("/api/v1/me/export", headers=ALICE)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = json.loads(r.content)
    assert data["format"] == "pramaan-export/1" and data["profile"]["email"] == "alice@example.com"
    assert [p["name"] for p in data["projects"]] == ["Exported project"]
    assert [d["filename"] for d in data["documents"]] == ["memo.txt"]
    assert len(data["research"]) == 1 and data["research"][0]["report"]["summary"]


async def test_usage_reports_real_counts(client: AsyncClient) -> None:
    await upload(client, "memo.txt", MEMO)
    await research(client)
    await research(client, mode="deep")
    u = (await client.get("/api/v1/me/usage", headers=ALICE)).json()
    assert u["researchRunsThisMonth"] == 2 and u["deepRunsThisMonth"] == 1 and u["researchTotal"] == 2
    assert u["documents"] == 1 and u["storageBytes"] == len(MEMO) and u["limitsEnforced"] is False


async def test_retention_deletes_only_old_unsaved_research_of_users_who_opted_in(client: AsyncClient) -> None:
    from app.services.account import enforce_retention

    old_unsaved, old_saved, recent = (await research(client))["id"], (await research(client))["id"], (await research(client))["id"]
    bob_old = (await research(client, headers=BOB))["id"]
    await client.patch(f"/api/v1/research/{old_saved}", headers=ALICE, json={"saved": True})
    await client.patch("/api/v1/me", headers=ALICE, json={"preferences": {"retentionDays": 30}})
    long_ago = datetime.now(UTC) - timedelta(days=45)
    async with get_sessionmaker()() as db:
        await db.execute(
            update(ResearchSession).where(ResearchSession.id.in_([uuid.UUID(x) for x in (old_unsaved, old_saved, bob_old)])).values(created_at=long_ago)
        )
        await db.commit()
        assert await enforce_retention(db) == 1
    ids = {r["id"] for r in (await client.get("/api/v1/research", headers=ALICE)).json()}
    assert ids == {old_saved, recent}
    assert len((await client.get("/api/v1/research", headers=BOB)).json()) == 1  # Bob keeps everything (no retention set)


# ---------------------------------------------------------------- H-06 search


async def test_search_finds_own_research_projects_and_documents_only(client: AsyncClient) -> None:
    await client.post("/api/v1/projects", headers=ALICE, json={"name": "Zephyr turbine programme"})
    await upload(client, "zephyr-memo.txt", MEMO)
    await research(client)
    await client.post("/api/v1/projects", headers=BOB, json={"name": "Bob zephyr secrets"})
    hits = (await client.get("/api/v1/search", headers=ALICE, params={"q": "zephyr"})).json()
    kinds = {(h["kind"], h["title"]) for h in hits}
    assert ("project", "Zephyr turbine programme") in kinds
    assert any(k == "document" for k, _ in kinds)
    assert not any("Bob" in t for _, t in kinds)
    assert any(h["kind"] == "research" for h in (await client.get("/api/v1/search", headers=ALICE, params={"q": "humanoid"})).json())
    assert (await client.get("/api/v1/search", headers=ALICE, params={"q": "%_\\"})).json() == []
    assert (await client.get("/api/v1/search", headers=ALICE, params={"q": "<script>"})).status_code == 200


# ---------------------------------------------------------------- M-03 project members


async def test_owner_adds_viewer_who_can_read_but_not_edit_and_can_leave(client: AsyncClient) -> None:
    await client.get("/api/v1/me", headers=BOB)  # Bob has an account
    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Shared work"})).json()
    doc = await upload(client, "memo.txt", MEMO, projectId=p["id"])
    r = await research(client, projectId=p["id"], sources=["project"])

    added = await client.post(f"/api/v1/projects/{p['id']}/members", headers=ALICE, json={"email": "BOB@example.com", "role": "viewer"})
    assert added.status_code == 201, added.text
    assert {m["name"]: m["role"] for m in added.json()["members"]} == {"Alice Rao": "owner", "Bob Chen": "viewer"}
    assert [x["name"] for x in (await client.get("/api/v1/projects", headers=BOB, params={"scope": "shared"})).json()] == ["Shared work"]
    assert (await client.get(f"/api/v1/research/{r['id']}", headers=BOB)).status_code == 200
    assert (await client.get(f"/api/v1/library/{doc['id']}", headers=BOB)).status_code == 200
    assert (await client.patch(f"/api/v1/projects/{p['id']}", headers=BOB, json={"name": "x"})).status_code == 403  # viewer
    assert (await client.post(f"/api/v1/projects/{p['id']}/members", headers=BOB, json={"email": "carol@example.com"})).status_code == 403

    bob_id = next(m["userId"] for m in added.json()["members"] if m["role"] == "viewer")
    changed = await client.patch(f"/api/v1/projects/{p['id']}/members/{bob_id}", headers=ALICE, json={"role": "editor"})
    assert changed.status_code == 200, changed.text
    assert {m["role"] for m in changed.json()["members"]} == {"owner", "editor"}
    assert (await client.delete(f"/api/v1/projects/{p['id']}/members/{bob_id}", headers=BOB)).status_code == 204  # leave
    assert (await client.get(f"/api/v1/research/{r['id']}", headers=BOB)).status_code == 404


async def test_member_errors(client: AsyncClient) -> None:
    await client.get("/api/v1/me", headers=BOB)
    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "P"})).json()
    url = f"/api/v1/projects/{p['id']}/members"
    assert (await client.post(url, headers=ALICE, json={"email": "nobody@example.com"})).json()["error"]["code"] == "ACCOUNT_NOT_FOUND"
    assert (await client.post(url, headers=ALICE, json={"email": "alice@example.com"})).status_code == 409
    assert (await client.post(url, headers=ALICE, json={"email": "bob@example.com", "role": "owner"})).status_code == 422
    assert (await client.post(url, headers=ALICE, json={"email": "bob@example.com"})).status_code == 201
    assert (await client.post(url, headers=ALICE, json={"email": "bob@example.com"})).status_code == 409
    owner_id = p["ownerId"]
    assert (await client.delete(f"{url}/{owner_id}", headers=ALICE)).json()["error"]["code"] == "OWNER_CANNOT_LEAVE"
    assert (await client.post(url, headers=CAROL, json={"email": "carol@example.com"})).status_code == 404  # non-member: not found


# ---------------------------------------------------------------- C-02 / H-01 embedding outage


class _EmbedDown(FakeProvider):
    async def embed(self, texts, *, task="document"):  # type: ignore[no-untyped-def]
        raise ModelUnavailable("embeddings down")

    async def preflight(self) -> None:
        raise ModelUnavailable("embeddings down")


async def test_embedding_outage_degrades_research_with_a_visible_limitation(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.embeddings import EmbeddingService

    base = make_deps(FakeWeb(), FakeAcademic())

    def deps(research_id):  # type: ignore[no-untyped-def]
        d = base(research_id)
        d.embeddings = EmbeddingService(_EmbedDown(768))
        return d

    monkeypatch.setattr(runner, "default_deps", deps)
    r = await research(client)
    assert r["status"] == "completed", r.get("errorCode")
    assert r["report"]["limitations"] and any("keyword overlap only" in x for x in r["report"]["limitations"])


async def test_library_retrieval_falls_back_to_keywords_when_embeddings_are_down(client: AsyncClient) -> None:
    from app.services.embeddings import EmbeddingService
    from app.services.retrieval import HybridRetriever

    doc = await upload(client, "memo.txt", MEMO)
    async with get_sessionmaker()() as db:
        hits = await HybridRetriever(db, EmbeddingService(_EmbedDown(768))).search(
            "Who is the lead engineer of the Zephyr-9 programme?", [uuid.UUID(doc["id"])], 4
        )
    assert hits and "Varga" in hits[0].content


# ---------------------------------------------------------------- H-03 per-source cap


def test_source_cap_scales_with_the_number_of_sources() -> None:
    assert source_cap(24, 1) == 24 and source_cap(24, 4) == 6 and source_cap(24, 28) == 2 and source_cap(12, 0) == 12


async def test_single_document_answers_use_more_than_two_passages(client: AsyncClient) -> None:
    p = (await client.post("/api/v1/projects", headers=ALICE, json={"name": "Zephyr"})).json()
    await upload(client, "memo.txt", MEMO, projectId=p["id"])
    r = await research(client, projectId=p["id"], sources=["project"], query="What efficiency did the Zephyr-9 turbine reach and who is the lead engineer?")
    assert r["status"] == "completed"
    assert len(r["evidence"]) > 2
    assert any("Varga" in e["passage"] for e in r["evidence"])


# ---------------------------------------------------------------- H-02 / M-04 budgets and report shape


def test_token_budgets_grow_with_the_number_of_claims() -> None:
    assert claims_budget(16) > claims_budget(6) >= 1600 and verify_budget(16) > verify_budget(4) >= 1200


def test_report_shape_by_mode_and_response_length() -> None:
    quick, standard, deep = (report_shape(m, "balanced", 12) for m in ("quick", "standard", "deep"))
    assert quick.body < standard.body < deep.body and quick.tokens < standard.tokens < deep.tokens
    assert report_shape("standard", "concise", 12).tokens < standard.tokens < report_shape("standard", "comprehensive", 12).tokens
    assert report_shape("deep", "balanced", 2).body == 1  # never asks for more sections than the claims can fill


async def test_response_length_preference_reaches_the_pipeline(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.research.llm import ResearchLLM

    seen: dict[str, str] = {}
    original = ResearchLLM.synthesize

    async def spy(self, query, claims, instructions, *, mode="standard", length="balanced"):  # type: ignore[no-untyped-def]
        seen.update(mode=mode, length=length)
        return await original(self, query, claims, instructions, mode=mode, length=length)

    monkeypatch.setattr(ResearchLLM, "synthesize", spy)
    await client.patch("/api/v1/me", headers=ALICE, json={"preferences": {"responseLength": "comprehensive"}})
    await research(client, mode="deep")
    assert seen == {"mode": "deep", "length": "comprehensive"}


# ---------------------------------------------------------------- H-04 website fetch failures


async def test_unreachable_website_fails_with_a_clear_message(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.exceptions import ValidationFailed
    from app.services.documents import processor

    async def unreachable(url: str) -> tuple[str, str]:
        raise ValidationFailed("That website couldn't be read.", code="URL_UNREACHABLE")

    monkeypatch.setattr(processor, "fetch_page", unreachable)
    r = await client.post("/api/v1/library/urls", headers=ALICE, json={"url": "https://example.com/missing"})
    await get_job_runner().drain()
    d = (await client.get(f"/api/v1/library/{r.json()['id']}", headers=ALICE)).json()
    assert d["status"] == "failed" and d["error"] == "That website couldn't be read."


# ---------------------------------------------------------------- L-06 duplicate upload


async def test_duplicate_upload_is_flagged(client: AsyncClient) -> None:
    first = await upload(client, "memo.txt", MEMO)
    again = await client.post("/api/v1/library/upload", headers=ALICE, files={"file": ("copy.txt", MEMO)})
    assert first["duplicate"] is False and again.status_code == 200 and again.json()["duplicate"] is True and again.json()["id"] == first["id"]


# ---------------------------------------------------------------- M-12 API docs


def test_api_docs_are_disabled_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings
    from app.main import create_app

    assert create_app().docs_url == "/docs"  # development

    for k, v in {
        "ENVIRONMENT": "production",
        "FIREBASE_PROJECT_ID": "p",
        "DATABASE_URL": "postgresql://u:p@ep-x.neon.tech/db?sslmode=require",
        "STORAGE_BACKEND": "s3",
        "S3_ENDPOINT": "https://x.supabase.co/storage/v1/s3",
        "S3_BUCKET": "b",
        "S3_ACCESS_KEY_ID": "k",
        "S3_SECRET_ACCESS_KEY": "s",
        "LLM_PROVIDER": "groq",
        "MODEL_PROVIDER": "groq",
        "GROQ_API_KEY": "g",
        "EMBEDDING_PROVIDER": "openrouter",
        "OPENROUTER_API_KEY": "o",
    }.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    try:
        prod = create_app()
        assert prod.docs_url is None and prod.redoc_url is None and prod.openapi_url is None
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_sentence_splitter_keeps_titles_and_initials_with_the_name() -> None:
    from app.research.text import sentences

    out = sentences("The lead engineer for the programme is Dr. Ilse Varga. The report was written by J. R. Smith et al. in 2025. It ends here today.")
    assert out[0] == "The lead engineer for the programme is Dr. Ilse Varga."
    assert out[1].startswith("The report was written by J. R. Smith et al. in 2025.")


def test_provider_error_logs_include_status_and_message() -> None:
    import httpx

    from app.services.llm.hosted import error_detail

    req = httpx.Request("POST", "https://api.example/v1/embeddings", headers={"Authorization": "Bearer sk-secret"})
    resp = httpx.Response(502, request=req, json={"error": {"message": "Upstream   provider\nerror", "code": 502}}, headers={"x-request-id": "req_1"})
    d = error_detail(httpx.HTTPStatusError("x", request=req, response=resp))
    assert d == {"exc_type": "HTTPStatusError", "status": 502, "provider_message": "Upstream provider error", "provider_request_id": "req_1"}
    assert "sk-secret" not in str(d)
    assert error_detail(httpx.ReadTimeout("t")) == {"exc_type": "ReadTimeout"}


def test_embedding_calls_are_bounded_so_outages_degrade_quickly() -> None:
    from app.core.config import Settings
    from app.services.llm.openrouter import OpenRouterEmbedder

    s = Settings(_env_file=None)
    assert s.openrouter_timeout_s <= 30 and s.openrouter_retries <= 1
    e = OpenRouterEmbedder(api_key="k", timeout_s=s.openrouter_timeout_s, retries=s.openrouter_retries)
    assert e.retries == 1 and e._client.timeout.read == s.openrouter_timeout_s
