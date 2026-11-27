"""Speech-to-text and dictation clean-up for voice input.

Browsers with built-in speech recognition (Chrome, Edge, Safari) transcribe on the device side; others
(Firefox) record a short clip and send it here, where Groq Whisper transcribes it and the audio is discarded —
never stored or logged. Either way the raw transcript is then cleaned up (`DictationRefiner`): filler words,
false starts, repeated words and transcribed background noise are removed, misheard terms and spelling are
fixed, and the result is the question the speaker meant — never an answer, never new content.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import get_settings
from app.research.text import terms
from app.services.llm.base import AVAILABILITY_ERRORS, ChatMessage, MalformedOutput, ProviderError
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


logger = logging.getLogger("pramaan.speech")
_PLAIN_PUNCTUATION = str.maketrans({"\u2010": "-", "\u2011": "-", "\u00a0": " ", "\u202f": " "})

# Whisper "hears" these in silence or noise; a transcript that is only one of them means nothing was said.
_SILENCE_PHRASES = {
    "thank you", "thanks", "thank you very much", "thanks for watching", "thank you for watching", "thanks for listening",
    "please subscribe", "subscribe", "bye", "you", "okay", "ok", "so", "um", "uh", "hmm", "music", "applause", "silence",
}  # fmt: skip
_BRACKETED = re.compile(r"[\[(](?:music|applause|laughter|noise|silence|inaudible|background noise|blank_audio)[\])]", re.I)
_FILLERS = re.compile(r"(?<![\w'])(?:u+h+m*|u+m+|e+r+m+|e+r+|a+h+|h+m+|m+h*m+|uh[- ]huh)(?![\w'])[,.]?\s*", re.I)
_REPEAT = re.compile(r"\b(\w+)(?:[,\s]+\1\b)+", re.I)
_LEAD = re.compile(r"^(?:(?:so|okay|ok|well|like|right|alright|hey|basically|actually)[,.]?\s+)+", re.I)
_QUESTION = re.compile(r"^(?:what|which|who|whom|whose|when|where|why|how|is|are|was|were|does|do|did|can|could|should|would|will|has|have)\b", re.I)


def is_silence(text: str) -> bool:
    """True when a transcript is only a phrase speech models produce from silence or noise."""
    plain = _BRACKETED.sub(" ", text).lower()
    plain = re.sub(r"[^a-z' ]+", " ", plain)
    plain = " ".join(plain.split())
    return not plain or plain in _SILENCE_PHRASES


def tidy_dictation(text: str) -> str:
    """Deterministic clean-up, used when the model is unavailable: drops noise tags, filler sounds and stutters
    ("the the"), fixes spacing and capitalisation, and ends a question with "?"."""
    t = _BRACKETED.sub(" ", text)
    t = _FILLERS.sub(" ", t)
    t = _REPEAT.sub(r"\1", t)
    t = re.sub(r"\s+([,.;:!?])", r"\1", " ".join(t.split())).strip(" ,;")
    t = _LEAD.sub("", t)
    if not t or is_silence(t):
        return ""
    t = t[0].upper() + t[1:]
    if not re.search(r"[.!?]$", t):
        t += "?" if _QUESTION.match(t) else "."
    return t


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
        form: dict[str, str] = {
            "model": self.model,
            "response_format": "json",
            "temperature": "0",
            # Context for Whisper: it biases spelling and punctuation towards a written research question.
            "prompt": "A research question for an academic research assistant, with correct spelling of technical terms.",
        }
        if language:
            form["language"] = language
        upload = (f"voice.{ext}", audio, content_type.split(";", 1)[0])
        data = await self._request("POST", "/audio/transcriptions", what="transcribe", data=form, files={"file": upload})
        text = data.get("text")
        if not isinstance(text, str):
            raise MalformedOutput("groq transcribe: response missing text")
        text = " ".join(_BRACKETED.sub(" ", text).split())
        return "" if is_silence(text) else text


class FakeTranscriber:
    """Tests and offline development: a fixed transcript, so no provider is called."""

    async def transcribe(self, audio: bytes, *, content_type: str, language: str | None = None) -> str:
        return "What does the evidence say about remote work and productivity?"


REFINE_SYSTEM = (
    "You clean up dictated text for a research assistant. You only rewrite what the speaker said; you never answer it, "
    "never add facts, examples, constraints or opinions, and never change its meaning or language. Respond with JSON only."
)


class Refiner(Protocol):
    async def refine(self, text: str, *, context: str = "") -> str: ...


def plausible_rewrite(original: str, rewritten: str) -> bool:
    """Guards against a rewrite that drifted from what was said (an answer, a different question, an essay)."""
    if not rewritten:
        return True  # "nothing meaningful was said" is a valid outcome
    if len(rewritten) > max(2 * len(original), len(original) + 80):
        return False
    said, kept = terms(original), terms(rewritten)
    if len(said) < 4:
        return True
    return len(said & kept) / len(said) >= 0.4 and len(kept - said) <= max(4, len(said) // 2)


class DictationRefiner:
    """Turns a raw transcript into the clear, correctly spelled question the speaker meant."""

    def __init__(self, provider: object) -> None:
        self.provider = provider

    async def refine(self, text: str, *, context: str = "") -> str:
        raw = " ".join(text.split())[:4000]
        fallback = tidy_dictation(raw)
        if not raw or is_silence(raw):
            return ""
        prompt = (
            "Dictated text (speech-to-text output; it may contain misrecognised words, filler words, false starts, repeated "
            f"words and background speech or noise transcribed as words):\n<<<{raw}>>>\n"
            + (f"Text the user had already typed before dictating (context only, do not repeat it):\n<<<{context[:600]}>>>\n" if context.strip() else "")
            + "\nRewrite the dictated text as the clear research question or request the speaker intended:\n"
            "- remove fillers (um, uh, like, you know, I mean, so, okay, basically), stutters, false starts and repeated words;\n"
            "- drop fragments that are clearly background speech or noise unrelated to the request;\n"
            "- fix misrecognised words from context (technical terms, names, acronyms, units) and correct spelling, grammar, "
            "capitalisation and punctuation;\n"
            "- keep the speaker's meaning, scope, language and level of detail; if they corrected themselves, keep the correction.\n"
            'If nothing meaningful was said, return an empty string. Return {"text": "..."}'
        )
        try:
            out = await self.provider.generate(  # type: ignore[attr-defined]
                [ChatMessage("system", REFINE_SYSTEM), ChatMessage("user", prompt)],
                json=True,
                temperature=0,
                max_tokens=min(2000, 400 + 3 * len(raw.split())),
                reasoning_effort="low",
            )
            data = json.loads(out)
            refined = " ".join(str(data.get("text", "")).split()).strip("\"'“”") if isinstance(data, dict) else None
            if refined:
                refined = refined.translate(_PLAIN_PUNCTUATION)  # "GLP‑1" (non-breaking hyphen) → "GLP-1"
        except AVAILABILITY_ERRORS as e:
            logger.info("dictation_refine_unavailable", extra={"fields": {"error": e.code}})
            return fallback
        except (ProviderError, ValueError, TypeError) as e:
            logger.info("dictation_refine_fallback", extra={"fields": {"reason": type(e).__name__}})
            return fallback
        if refined is None or not plausible_rewrite(raw, refined):
            logger.info("dictation_refine_rejected")
            return fallback
        return refined


class TidyRefiner:
    """Tests and offline development: the deterministic clean-up only."""

    async def refine(self, text: str, *, context: str = "") -> str:
        return tidy_dictation(text)


@lru_cache
def get_refiner() -> Refiner:
    s = get_settings()
    if s.llm_provider != "groq":
        return TidyRefiner()
    from app.services.llm.groq import GroqProvider

    return DictationRefiner(
        GroqProvider(
            s.groq_api_key.get_secret_value(),
            s.groq_refine_model,
            base_url=s.groq_base_url,
            timeout_s=20,
            connect_timeout_s=s.groq_connect_timeout_s,
            retries=1,
        )
    )


@lru_cache
def get_transcriber() -> Transcriber:
    s = get_settings()
    if s.llm_provider == "groq":
        return GroqTranscriber(s.groq_api_key.get_secret_value(), s.groq_stt_model, base_url=s.groq_base_url, connect_timeout_s=s.groq_connect_timeout_s)
    return FakeTranscriber()
