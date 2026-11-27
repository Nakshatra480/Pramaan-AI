"""Voice input: POST /speech/transcriptions, POST /speech/refinements, the Whisper client and dictation clean-up."""

from __future__ import annotations

import json

import httpx
import pytest
from httpx import AsyncClient

from app.api.routes.speech import speech_limiter
from app.core.rate_limit import SlidingWindowLimiter
from app.main import app
from app.services.llm.base import ChatMessage, MalformedOutput, ModelUnavailable
from app.services.speech import DictationRefiner, GroqTranscriber, audio_extension, get_transcriber, is_silence, plausible_rewrite, tidy_dictation
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
    assert r.json() == {"text": "How do heat pumps perform in cold climates?", "original": "How do heat pumps perform in cold climates?"}
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


# ------------------------------------------------------------------ dictation clean-up


async def test_recordings_are_cleaned_up_and_the_original_kept(client: AsyncClient, recorder: Recorder) -> None:
    recorder.result = "um so what is the the uh effect of remote work on productivity"
    r = await client.post(URL, headers=ALICE, files={"audio": ("voice.webm", CLIP, "audio/webm")})
    assert r.json() == {"text": "What is the effect of remote work on productivity?", "original": recorder.result}


async def test_silence_is_not_transcribed_into_a_question(client: AsyncClient, recorder: Recorder) -> None:
    recorder.result = ""
    r = await client.post(URL, headers=ALICE, files={"audio": ("voice.webm", CLIP, "audio/webm")})
    assert r.json() == {"text": "", "original": ""}


async def test_refinement_endpoint(client: AsyncClient) -> None:
    app.dependency_overrides[speech_limiter] = lambda: SlidingWindowLimiter(0)
    try:
        r = await client.post("/api/v1/speech/refinements", headers=ALICE, json={"text": "uh how do heat pumps uh work in in cold weather", "context": ""})
        assert r.status_code == 200 and r.json() == {
            "text": "How do heat pumps work in cold weather?",
            "original": "uh how do heat pumps uh work in in cold weather",
        }
        assert (await client.post("/api/v1/speech/refinements", json={"text": "x"})).status_code == 401
        assert (await client.post("/api/v1/speech/refinements", headers=ALICE, json={"text": ""})).status_code == 422
    finally:
        app.dependency_overrides.pop(speech_limiter, None)


def test_tidy_and_silence_rules() -> None:
    assert tidy_dictation("okay so like um what are the the latest solid state battery results") == "What are the latest solid state battery results?"
    assert tidy_dictation("[Music] compare RAG and long context models") == "Compare RAG and long context models."
    assert tidy_dictation("Thank you.") == ""
    assert is_silence("Thanks for watching!") and is_silence("[BLANK_AUDIO]") and not is_silence("Thank you notes etiquette")


class ScriptedModel:
    def __init__(self, reply: str | Exception) -> None:
        self.reply = reply
        self.calls: list[dict[str, object]] = []

    async def generate(self, messages: list[ChatMessage], **kw: object) -> str:
        self.calls.append({"prompt": messages[-1].content, **kw})
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


async def test_refiner_fixes_misheard_words_and_keeps_meaning() -> None:
    model = ScriptedModel(json.dumps({"text": "How effective are GLP-1 drugs at reducing cardiovascular events?"}))
    out = await DictationRefiner(model).refine("uh how effective are glp one drugs at reducing cardio vascular events", context="")
    assert out == "How effective are GLP-1 drugs at reducing cardiovascular events?"
    assert model.calls[0]["json"] is True and model.calls[0]["temperature"] == 0 and model.calls[0]["reasoning_effort"] == "low"


async def test_refiner_rejects_drift_and_falls_back_on_outages() -> None:
    raw = "what are the uh main causes of urban heat islands in cities"
    answer = json.dumps({"text": "Urban heat islands are caused by dark surfaces, missing vegetation, waste heat and dense building geometry trapping warmth."})
    assert await DictationRefiner(ScriptedModel(answer)).refine(raw) == "What are the main causes of urban heat islands in cities?"
    assert await DictationRefiner(ScriptedModel(ModelUnavailable("down"))).refine(raw) == "What are the main causes of urban heat islands in cities?"
    assert await DictationRefiner(ScriptedModel(MalformedOutput("bad"))).refine(raw) == "What are the main causes of urban heat islands in cities?"
    assert await DictationRefiner(ScriptedModel("not json")).refine(raw) == "What are the main causes of urban heat islands in cities?"
    assert await DictationRefiner(ScriptedModel(json.dumps({"text": ""}))).refine("um uh hmm") == ""


def test_plausible_rewrite() -> None:
    assert plausible_rewrite("compare rag and long context models for question answering", "Compare RAG and long-context models for question answering.")
    assert not plausible_rewrite("compare rag and long context models", "Retrieval augmented generation " * 20)
    assert plausible_rewrite("anything at all", "")
