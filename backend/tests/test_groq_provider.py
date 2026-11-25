"""GroqProvider via a mocked HTTP transport (no network, no API key)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.services.llm.base import ChatMessage, MalformedOutput, ModelNotInstalled, ModelTimeout, ModelUnavailable
from app.services.llm.groq import GroqProvider

MSG = [ChatMessage("system", "Respond with JSON."), ChatMessage("user", "hi")]
MODEL = "openai/gpt-oss-120b"


def provider(handler, key: str = "gsk_test", **kw) -> GroqProvider:  # type: ignore[no-untyped-def]
    return GroqProvider(key, MODEL, transport=httpx.MockTransport(handler), **kw)


def completion(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}]})


@pytest.fixture(autouse=True)
def no_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    async def instant(_: float) -> None:
        return None

    monkeypatch.setattr("app.services.llm.hosted.asyncio.sleep", instant)


async def test_generate_sends_openai_compatible_json_request() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return completion('{"ok": true}')

    assert await provider(handler).generate(MSG, json=True, temperature=0.1, max_tokens=400) == '{"ok": true}'
    req = seen[0]
    body = json.loads(req.content)
    assert req.url.path == "/openai/v1/chat/completions" and req.headers["authorization"] == "Bearer gsk_test"
    assert body["model"] == MODEL and body["response_format"] == {"type": "json_object"}
    assert body["max_completion_tokens"] == 400 and body["temperature"] == 0.1 and body["stream"] is False
    assert body["messages"][0] == {"role": "system", "content": "Respond with JSON."}


async def test_plain_generation_has_no_json_mode() -> None:
    bodies = []

    def handler(req: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(req.content))
        return completion("text")

    await provider(handler).generate(MSG)
    assert "response_format" not in bodies[0] and "max_completion_tokens" not in bodies[0]


async def test_missing_key_is_unavailable_without_a_request() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        raise AssertionError("no request without a key")

    with pytest.raises(ModelUnavailable, match="GROQ_API_KEY"):
        await provider(handler, key="").generate(MSG)
    with pytest.raises(ModelUnavailable, match="GROQ_API_KEY"):
        await provider(handler, key="").preflight()


async def test_rate_limit_retries_with_retry_after_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    waits: list[float] = []

    async def record(s: float) -> None:
        waits.append(s)

    monkeypatch.setattr("app.services.llm.hosted.asyncio.sleep", record)
    responses = iter([httpx.Response(429, headers={"retry-after": "3"}, json={"error": {"message": "Rate limit reached"}}), completion("fine")])
    assert await provider(lambda req: next(responses)).generate(MSG) == "fine"
    assert waits == [3.0]


async def test_persistent_rate_limit_becomes_unavailable_after_bounded_retries() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"retry-after": "999"}, json={"error": {"message": "Rate limit reached"}})

    with pytest.raises(ModelUnavailable, match="rate limited"):
        await provider(handler, retries=2).generate(MSG)
    assert calls == 3


async def test_retry_after_is_capped(monkeypatch: pytest.MonkeyPatch) -> None:
    waits: list[float] = []

    async def record(s: float) -> None:
        waits.append(s)

    monkeypatch.setattr("app.services.llm.hosted.asyncio.sleep", record)
    responses = iter([httpx.Response(429, headers={"retry-after": "999"}), completion("ok")])
    await provider(lambda req: next(responses)).generate(MSG)
    assert waits == [20.0]


async def test_connection_errors_and_timeouts() -> None:
    calls = 0

    def refused(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("refused", request=req)

    def connect_timeout(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("slow", request=req)

    def read_timeout(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=req)

    with pytest.raises(ModelUnavailable):
        await provider(refused, retries=2).generate(MSG)
    assert calls == 3
    with pytest.raises(ModelUnavailable):
        await provider(connect_timeout).generate(MSG)
    with pytest.raises(ModelTimeout):
        await provider(read_timeout).generate(MSG)


async def test_transient_5xx_is_retried_then_succeeds() -> None:
    responses = iter([httpx.Response(503), completion("fine")])
    assert await provider(lambda req: next(responses)).generate(MSG) == "fine"


async def test_bad_key_is_unavailable_and_not_retried() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(401, json={"error": {"message": "Invalid API Key", "code": "invalid_api_key"}})

    with pytest.raises(ModelUnavailable, match="credentials"):
        await provider(handler).generate(MSG)
    assert calls == 1


async def test_unknown_model_is_not_installed() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": {"message": "The model `x` does not exist", "code": "model_not_found"}})

    with pytest.raises(ModelNotInstalled):
        await provider(handler).generate(MSG)


async def test_oversized_prompt_and_invalid_json_are_malformed_so_fallbacks_run() -> None:
    def too_big(req: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "Please reduce the length of the messages", "code": "context_length_exceeded"}})

    def bad_json(req: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "Failed to generate JSON", "code": "json_validate_failed"}})

    def no_content(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": []})

    def html(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>gateway</html>")

    for handler in (too_big, bad_json, no_content, html):
        with pytest.raises(MalformedOutput):
            await provider(handler).generate(MSG, json=True)


async def test_preflight_checks_model_list_and_caches() -> None:
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert req.url.path == "/openai/v1/models"
        return httpx.Response(200, json={"object": "list", "data": [{"id": MODEL}, {"id": "llama-3.1-8b-instant"}]})

    p = provider(handler)
    await p.preflight()
    await p.preflight()
    assert calls == 1

    def other_models(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "llama-3.1-8b-instant"}]})

    with pytest.raises(ModelNotInstalled, match=MODEL):
        await provider(other_models).preflight()


async def test_short_rate_limit_windows_get_more_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-minute token limits ask for a few seconds' wait: retried up to 5 times, then unavailable."""
    waits: list[float] = []

    async def record(s: float) -> None:
        waits.append(s)

    monkeypatch.setattr("app.services.llm.hosted.asyncio.sleep", record)
    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls <= 4:
            return httpx.Response(429, headers={"retry-after": "3.1"}, json={"error": {"message": "Rate limit reached ... tokens per minute"}})
        return completion("recovered")

    assert await provider(handler, retries=2).generate(MSG) == "recovered"
    assert calls == 5 and waits == [3.1, 3.1, 3.1, 3.1]

    calls = 0

    def always(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"retry-after": "2"}, json={"error": {"message": "Rate limit reached"}})

    with pytest.raises(ModelUnavailable):
        await provider(always, retries=2).generate(MSG)
    assert calls == 6  # bounded
