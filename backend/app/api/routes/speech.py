"""Voice input: clean up dictated text, and transcribe recordings from browsers without built-in recognition."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import Field

from app.api.deps import VerifiedUser
from app.core.config import get_settings
from app.core.exceptions import AppError, PayloadTooLarge, RateLimited, ValidationFailed
from app.core.rate_limit import RateLimiter, make_limiter
from app.schemas.common import ApiModel
from app.services.llm.base import ProviderError
from app.services.speech import Refiner, Transcriber, audio_extension, get_refiner, get_transcriber

router = APIRouter(tags=["speech"])
logger = logging.getLogger("pramaan.speech")

_limiter: RateLimiter | None = None


def speech_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = make_limiter(get_settings().speech_per_minute, "speech")
    return _limiter


class Transcript(ApiModel):
    text: str  # cleaned up: the question the speaker meant
    original: str  # exactly what was recognised, so the user can undo the clean-up


class DictationIn(ApiModel):
    text: str = Field(min_length=1, max_length=4000)
    context: str = Field(default="", max_length=2000, description="Text typed before dictating (context only)")


@router.post("/speech/refinements", response_model=Transcript, summary="Clean up a dictated question")
async def refine(
    data: DictationIn,
    user: VerifiedUser,
    refiner: Refiner = Depends(get_refiner),
    limiter: RateLimiter = Depends(speech_limiter),
) -> Transcript:
    """Removes filler words, false starts and transcribed noise, and fixes misheard words and spelling, keeping the
    speaker's meaning. Falls back to a deterministic tidy-up when the model is unavailable."""
    if not await limiter.hit(str(user.id)):
        raise RateLimited("Too many voice requests. Wait a moment and try again.")
    original = " ".join(data.text.split())
    return Transcript(text=await refiner.refine(original, context=data.context), original=original)


@router.post("/speech/transcriptions", response_model=Transcript, summary="Transcribe a voice question")
async def transcribe(
    user: VerifiedUser,
    audio: Annotated[UploadFile, File(description="A short recording: WebM/Ogg (Opus), MP4/M4A, MP3, WAV or FLAC")],
    language: Annotated[str | None, Form(pattern=r"^[a-z]{2}$", description="ISO-639-1 hint, e.g. 'en'")] = None,
    context: Annotated[str, Form(max_length=2000, description="Text typed before dictating (context only)")] = "",
    transcriber: Transcriber = Depends(get_transcriber),
    refiner: Refiner = Depends(get_refiner),
    limiter: RateLimiter = Depends(speech_limiter),
) -> Transcript:
    if not await limiter.hit(str(user.id)):
        raise RateLimited("Too many voice requests. Wait a moment and try again.")
    content_type = audio.content_type or ""
    if audio_extension(content_type) is None:
        raise ValidationFailed("Unsupported audio format.", code="AUDIO_UNSUPPORTED")
    limit = get_settings().max_audio_bytes
    data = await audio.read(limit + 1)
    if len(data) > limit:
        raise PayloadTooLarge("That recording is too long. Keep voice questions under two minutes.")
    if len(data) < 512:
        raise ValidationFailed("No audio was recorded.", code="AUDIO_EMPTY")
    try:
        text = await transcriber.transcribe(data, content_type=content_type, language=language)
    except ProviderError as e:
        logger.warning("transcription_failed", extra={"fields": {"error": e.code}})
        raise AppError("Voice input is unavailable right now. Please type your question.", code="TRANSCRIPTION_UNAVAILABLE", status_code=503) from e
    return Transcript(text=await refiner.refine(text, context=context) if text else "", original=text)
