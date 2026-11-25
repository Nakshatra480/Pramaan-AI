"""Voice input fallback: POST /speech/transcriptions and the Groq Whisper client."""

from __future__ import annotations

import httpx
import pytest
from httpx import AsyncClient

from app.api.routes.speech import speech_limiter
from app.core.rate_limit import SlidingWindowLimiter
from app.main import app
from app.services.llm.base import ModelUnavailable
from app.services.speech import GroqTranscriber, audio_extension, get_transcriber
from tests.conftest import ALICE, auth

URL = "/api/v1/speech/transcriptions"
CLIP = b"\x1aE\xdf\xa3" + b"\x00" * 2048  # WebM magic + padding


class Recorder:
    def __init__(self, result: str | Exception = "How do heat pumps perform in cold climates?") -> None:
        self.result = result
        self.calls: list[tuple[int, str, str | None]] = []

    async def transcribe(self, audio: bytes, *, content_type: str, language: str | None = None) -> str:
        self.calls.append((len(audio), content_type, language))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def recorder() -> Recorder:
    rec = Recorder()
    app.dependency_overrides[get_transcriber] = lambda: rec
    app.dependency_overrides[speech_limiter] = lambda: SlidingWindowLimiter(0)
    yield rec
    app.dependency_overrides.pop(get_transcriber, None)
    app.dependency_overrides.pop(speech_limiter, None)


async def test_transcribes_a_recording(client: AsyncClient, recorder: Recorder) -> None:
    r = await client.post(URL, headers=ALICE, files={"audio": ("voice.webm", CLIP, "audio/webm;codecs=opus")}, data={"language": "en"})
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "How do heat pumps perform in cold climates?"}
    assert recorder.calls == [(len(CLIP), "audio/webm;codecs=opus", "en")]


async def test_requires_a_verified_user(client: AsyncClient, recorder: Recorder) -> None:
    assert (await client.post(URL, files={"audio": ("v.webm", CLIP, "audio/webm")})).status_code == 401
    assert (await client.post(URL, headers=auth("token-unverified"), files={"audio": ("v.webm", CLIP, "audio/webm")})).status_code == 403
    assert recorder.calls == []


async def test_rejects_non_audio_empty_and_oversized(client: AsyncClient, recorder: Recorder, monkeypatch: pytest.MonkeyPatch) -> None:
    r = await client.post(URL, headers=ALICE, files={"audio": ("x.pdf", CLIP, "application/pdf")})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "AUDIO_UNSUPPORTED")
    r = await client.post(URL, headers=ALICE, files={"audio": ("v.webm", b"\x00" * 10, "audio/webm")})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "AUDIO_EMPTY")
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "max_audio_bytes", 1024)
    r = await client.post(URL, headers=ALICE, files={"audio": ("v.webm", CLIP, "audio/webm")})
    assert r.status_code == 413
    r = await client.post(URL, headers=ALICE, files={"audio": ("v.webm", CLIP, "audio/webm")}, data={"language": "english"})
    assert r.status_code == 422
    assert recorder.calls == []


async def test_provider_outage_is_a_clear_503(client: AsyncClient, recorder: Recorder) -> None:
    recorder.result = ModelUnavailable("groq transcribe: HTTP 503")
    r = await client.post(URL, headers=ALICE, files={"audio": ("v.webm", CLIP, "audio/webm")})
    assert (r.status_code, r.json()["error"]["code"]) == (503, "TRANSCRIPTION_UNAVAILABLE")
    assert "groq" not in r.text


async def test_rate_limited_per_user(client: AsyncClient, recorder: Recorder) -> None:
    limiter = SlidingWindowLimiter(1)
    app.dependency_overrides[speech_limiter] = lambda: limiter
    files = {"audio": ("v.webm", CLIP, "audio/webm")}
    assert (await client.post(URL, headers=ALICE, files=files)).status_code == 200
    assert (await client.post(URL, headers=ALICE, files=files)).status_code == 429


def test_audio_extension() -> None:
    assert audio_extension("audio/webm;codecs=opus") == "webm"
    assert audio_extension("AUDIO/OGG") == "ogg"
    assert audio_extension("audio/mp4") == "mp4"
    assert audio_extension("video/webm") is None
    assert audio_extension(None) is None


async def test_groq_transcriber_sends_multipart_whisper_request() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json={"text": "  What is\n the evidence?  "})

    t = GroqTranscriber("gsk_test", "whisper-large-v3-turbo", transport=httpx.MockTransport(handler))
    assert await t.transcribe(CLIP, content_type="audio/webm;codecs=opus", language="en") == "What is the evidence?"
    req = seen[0]
    assert req.url.path.endswith("/audio/transcriptions")
    assert req.headers["authorization"] == "Bearer gsk_test"
    body = req.content
    assert b'name="model"' in body and b"whisper-large-v3-turbo" in body
    assert b'name="language"' in body
    assert b'filename="voice.webm"' in body and b"Content-Type: audio/webm" in body


async def test_groq_transcriber_requires_a_key() -> None:
    t = GroqTranscriber("", "whisper-large-v3-turbo", transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})))
    with pytest.raises(ModelUnavailable):
        await t.transcribe(CLIP, content_type="audio/webm")
