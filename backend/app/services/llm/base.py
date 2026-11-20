"""Model provider interfaces. The research graph depends only on this module.

Text generation (Groq) and embeddings (OpenRouter) are separate providers.

Availability errors (provider unreachable, timeout, unknown model, rate limit,
out of memory) are distinct from bad model output so callers can fail a job
explicitly and retryably instead of silently degrading. The error codes are part
of the API contract: the frontend shows specific copy for each of them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

EmbeddingTask = Literal["document", "query"]


@dataclass(frozen=True, slots=True)
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str


class ProviderError(Exception):
    """Base provider failure. Messages are safe to log (no prompts, no credentials)."""

    code = "MODEL_UNAVAILABLE"


class ModelUnavailable(ProviderError):
    """Provider unreachable, rejected credentials, rate limited after retries, 5xx."""

    code = "MODEL_UNAVAILABLE"


class ModelTimeout(ProviderError):
    code = "MODEL_TIMEOUT"


class ModelNotInstalled(ProviderError):
    """The configured model doesn't exist at the provider (wrong or retired model name)."""

    code = "MODEL_NOT_INSTALLED"


class ModelOutOfMemory(ProviderError):
    code = "MODEL_OUT_OF_MEMORY"


class MalformedOutput(ProviderError):
    """The model answered but not in the expected shape — callers may use deterministic fallbacks."""

    code = "MODEL_MALFORMED_OUTPUT"


# Errors that mean "the provider can't serve us right now" — never masked by fallbacks.
AVAILABILITY_ERRORS = (ModelUnavailable, ModelTimeout, ModelNotInstalled, ModelOutOfMemory)


class LLMProvider(Protocol):
    """Text generation."""

    name: str
    supports_generation: bool

    async def generate(self, messages: list[ChatMessage], *, json: bool = False, temperature: float = 0.2, max_tokens: int | None = None) -> str: ...

    async def preflight(self) -> None:
        """Raise an availability error if the provider can't currently serve generation."""
        ...


class EmbeddingProvider(Protocol):
    """Text embeddings. `task` lets asymmetric models embed documents and queries differently."""

    name: str
    model: str

    async def embed(self, texts: list[str], *, task: EmbeddingTask = "document") -> list[list[float]]: ...

    async def preflight(self) -> None:
        """Raise an availability error if the provider can't currently serve embeddings."""
        ...
