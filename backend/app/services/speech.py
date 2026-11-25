"""Speech-to-text for voice input.

Browsers with built-in speech recognition (Chrome, Edge, Safari) transcribe on the device side and never
call this. Others (Firefox) record a short clip and send it here; it is transcribed with Groq Whisper and
discarded — audio is never stored or logged.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import get_settings
from app.services.llm.base import MalformedOutput
from app.services.llm.groq import DEFAULT_BASE_URL
from app.services.llm.hosted import HostedProvider

# Containers MediaRecorder produces (plus common uploads); Whisper accepts all of them.
AUDIO_TYPES = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
}


def audio_extension(content_type: str | None) -> str | None:
    """File extension for a supported audio MIME type ("audio/webm;codecs=opus" → "webm"), else None."""
    base = (content_type or "").split(";", 1)[0].strip().lower()
    return AUDIO_TYPES.get(base)


class Transcriber(Protocol):
    async def transcribe(self, audio: bytes, *, content_type: str, language: str | None = None) -> str: ...


class GroqTranscriber(HostedProvider):
    name = "groq"

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = 60.0,
        connect_timeout_s: float = 10.0,
        retries: int = 1,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        super().__init__(base_url, api_key, timeout_s=timeout_s, connect_timeout_s=connect_timeout_s, retries=retries, transport=transport)
        self.model = model

    async def transcribe(self, audio: bytes, *, content_type: str, language: str | None = None) -> str:
        self._require_key("transcribe", "GROQ_API_KEY")
        ext = audio_extension(content_type) or "webm"
        form: dict[str, str] = {"model": self.model, "response_format": "json", "temperature": "0"}
        if language:
            form["language"] = language
        upload = (f"voice.{ext}", audio, content_type.split(";", 1)[0])
        data = await self._request("POST", "/audio/transcriptions", what="transcribe", data=form, files={"file": upload})
        text = data.get("text")
        if not isinstance(text, str):
            raise MalformedOutput("groq transcribe: response missing text")
        return " ".join(text.split())


class FakeTranscriber:
    """Tests and offline development: a fixed transcript, so no provider is called."""

    async def transcribe(self, audio: bytes, *, content_type: str, language: str | None = None) -> str:
        return "What does the evidence say about remote work and productivity?"


@lru_cache
def get_transcriber() -> Transcriber:
    s = get_settings()
    if s.llm_provider == "groq":
        return GroqTranscriber(s.groq_api_key.get_secret_value(), s.groq_stt_model, base_url=s.groq_base_url, connect_timeout_s=s.groq_connect_timeout_s)
    return FakeTranscriber()
