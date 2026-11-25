"""OpenRouterEmbedder + EmbeddingService via a mocked HTTP transport (no network, no API key)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.services.embeddings import EmbeddingService
from app.services.llm.base import MalformedOutput, ModelNotInstalled, ModelUnavailable
from app.services.llm.openrouter import OpenRouterEmbedder

MODEL = "nvidia/nemotron-3.5-embed-8b:free"


def embedder(handler, key: str = "sk-or-test", **kw) -> OpenRouterEmbedder:  # type: ignore[no-untyped-def]
    return OpenRouterEmbedder(key, MODEL, transport=httpx.MockTransport(handler), **kw)


def vectors(body: dict, dim: int = 768, reverse: bool = False) -> httpx.Response:  # type: ignore[type-arg]
    data = [{"object": "embedding", "index": i, "embedding": [0.001 * (i + 1)] * dim} for i in range(len(body["input"]))]
    return httpx.Response(200, json={"object": "list", "data": list(reversed(data)) if reverse else data, "model": MODEL, "provider": "Nvidia"})


@pytest.fixture(autouse=True)
def no_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    async def instant(_: float) -> None:
        return None

    monkeypatch.setattr("app.services.llm.hosted.asyncio.sleep", instant)


async def test_documents_and_queries_use_input_types_and_768_dims() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return vectors(json.loads(req.content))

    svc = EmbeddingService(embedder(handler))
    assert len((await svc.embed_documents(["doc text"]))[0]) == 768
    assert len(await svc.embed_query("question")) == 768
    bodies = [json.loads(r.content) for r in seen]
    assert all(r.url.path == "/api/v1/embeddings" and r.headers["authorization"] == "Bearer sk-or-test" for r in seen)
    assert [b["input_type"] for b in bodies] == ["passage", "query"]
    assert {b["model"] for b in bodies} == {MODEL} and {b["dimensions"] for b in bodies} == {768}
    assert bodies[0]["input"] == ["doc text"] and bodies[1]["input"] == ["question"]


async def test_results_are_reordered_by_index() -> None:
    out = await embedder(lambda req: vectors(json.loads(req.content), reverse=True)).embed(["a", "b", "c"])
    assert [v[0] for v in out] == pytest.approx([0.001, 0.002, 0.003])


async def test_documents_are_batched_by_configured_size() -> None:
    sizes = []

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        sizes.append(len(body["input"]))
        return vectors(body)

    out = await EmbeddingService(embedder(handler), batch_size=128).embed_documents([f"t{i}" for i in range(300)])
    # Batches of the configured size (fewest requests), sent concurrently; results stay in input order.
    assert len(out) == 300 and sorted(sizes) == [44, 128, 128]
    assert out[0] == out[128] and out[1] != out[0]  # each batch's vectors are positional (index-derived in this fake)
    sizes.clear()
    await EmbeddingService(embedder(handler), batch_size=128).embed_documents([f"t{i}" for i in range(100)])
    assert sizes == [100]  # fits one request: one request


async def test_default_batch_size_comes_from_settings() -> None:
    from app.core.config import get_settings

    assert EmbeddingService(embedder(lambda r: vectors(json.loads(r.content)))).batch_size == get_settings().embedding_batch_size == 128


async def test_wrong_dimension_is_refused() -> None:
    with pytest.raises(MalformedOutput, match="dimension 2048 != 768"):
        await EmbeddingService(embedder(lambda req: vectors(json.loads(req.content), dim=2048))).embed_query("q")


async def test_out_of_credits_is_unavailable_not_malformed() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(402, json={"error": {"message": "Insufficient credits.", "code": 402}})

    with pytest.raises(ModelUnavailable, match="credits"):
        await embedder(handler).embed(["a"])
    assert calls == 1  # not retried


async def test_rate_limit_is_retried_then_unavailable() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, json={"error": {"message": "Rate limit exceeded: free-models-per-day", "code": 429}})

    with pytest.raises(ModelUnavailable, match="rate limited"):
        await embedder(handler, retries=2).embed(["a"])
    assert calls == 3


async def test_errors_reported_inside_a_200_body() -> None:
    def upstream_down(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": {"message": "Provider returned error", "code": 502}})

    def bad(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": {"message": "dimensions must be one of 2048", "code": 400}})

    with pytest.raises(ModelUnavailable):
        await embedder(upstream_down).embed(["a"])
    with pytest.raises(MalformedOutput):
        await embedder(bad).embed(["a"])


async def test_unknown_model_and_bad_shapes() -> None:
    def missing(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": {"message": "No endpoints found for this model", "code": 404}})

    def short(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": []})

    with pytest.raises(ModelNotInstalled):
        await embedder(missing).embed(["a"])
    with pytest.raises(MalformedOutput):
        await embedder(short).embed(["a", "b"])


async def test_outage_and_missing_key() -> None:
    def down(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=req)

    with pytest.raises(ModelUnavailable):
        await embedder(down).embed(["a"])

    def never(req: httpx.Request) -> httpx.Response:
        raise AssertionError("no request without a key")

    with pytest.raises(ModelUnavailable, match="OPENROUTER_API_KEY"):
        await embedder(never, key="").embed(["a"])


async def test_preflight_embeds_once_and_caches() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return vectors(json.loads(req.content))

    e = embedder(handler)
    await e.preflight()
    await e.preflight()
    assert calls == 1
