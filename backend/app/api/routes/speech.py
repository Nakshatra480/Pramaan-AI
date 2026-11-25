"""Voice input fallback: transcribe a short recording (browsers without built-in speech recognition)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import VerifiedUser
from app.core.config import get_settings
from app.core.exceptions import AppError, PayloadTooLarge, RateLimited, ValidationFailed
from app.core.rate_limit import RateLimiter, make_limiter
from app.schemas.common import ApiModel
from app.services.llm.base import ProviderError
from app.services.speech import Transcriber, audio_extension, get_transcriber

router = APIRouter(tags=["speech"])
logger = logging.getLogger("pramaan.speech")

_limiter: RateLimiter | None = None


def speech_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = make_limiter(get_settings().speech_per_minute, "speech")
    return _limiter


class Transcript(ApiModel):
    text: str


@router.post("/speech/transcriptions", response_model=Transcript, summary="Transcribe a voice question")
async def transcribe(
    user: VerifiedUser,
    audio: Annotated[UploadFile, File(description="A short recording: WebM/Ogg (Opus), MP4/M4A, MP3, WAV or FLAC")],
    language: Annotated[str | None, Form(pattern=r"^[a-z]{2}$", description="ISO-639-1 hint, e.g. 'en'")] = None,
    transcriber: Transcriber = Depends(get_transcriber),
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
    return Transcript(text=text)
