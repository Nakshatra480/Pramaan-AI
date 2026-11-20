"""Shared HTTP plumbing for hosted model APIs (Groq for generation, OpenRouter for embeddings).

Every failure is translated into the provider error taxonomy in `base.py`, so the
research job and the frontend's error screens behave exactly as they did with a
self-hosted model: outages, timeouts and rate limits become retryable job failures;
malformed or rejected requests let callers fall back to extractive output.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.services.llm.base import MalformedOutput, ModelNotInstalled, ModelTimeout, ModelUnavailable, ProviderError

logger = logging.getLogger("pramaan.llm")

MAX_RETRY_AFTER_S = 20.0
_MODEL_MISSING = ("model_not_found", "does not exist", "decommissioned", "not found")
_REQUEST_TOO_BIG = ("context_length", "maximum context", "too large", "too long", "json_validate_failed", "failed to generate json")


def error_detail(e: Exception) -> dict[str, Any]:
    """Diagnostic fields for logs (audit M-10): HTTP status and the provider's own error message,
    truncated. Never includes request bodies or headers (prompts, API keys)."""
    out: dict[str, Any] = {"exc_type": type(e).__name__}
    if isinstance(e, httpx.HTTPStatusError):
        out["status"] = e.response.status_code
        msg: object = None
        try:
            body = e.response.json()
            err = body.get("error") if isinstance(body, dict) else None
            msg = err.get("message") if isinstance(err, dict) else err or (body.get("message") if isinstance(body, dict) else None)
        except ValueError:
            msg = e.response.text
        if msg:
            out["provider_message"] = " ".join(str(msg).split())[:300]
        if rid := e.response.headers.get("x-request-id"):
            out["provider_request_id"] = rid[:100]
    return out


class HostedProvider:
    """Base for bearer-token JSON APIs with bounded retries for transient failures only."""

    name = "hosted"

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout_s: float,
        connect_timeout_s: float = 10.0,
        retries: int = 2,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.retries = retries
        self._has_key = bool(api_key)
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = httpx.AsyncClient(
            base_url=self.base_url, headers=headers, timeout=httpx.Timeout(timeout_s, connect=connect_timeout_s), transport=transport
        )

    # ---------------------------------------------------------------- errors

    def _classify(self, e: httpx.HTTPError, what: str) -> tuple[ProviderError, bool]:
        """(error, transient). Only transient errors are retried."""
        label = f"{self.name} {what}"
        if isinstance(e, httpx.TimeoutException):
            if isinstance(e, httpx.ConnectTimeout | httpx.PoolTimeout):
                return ModelUnavailable(f"{label}: connect timeout"), True
            return ModelTimeout(f"{label}: timed out"), True
        if isinstance(e, httpx.HTTPStatusError):
            status = e.response.status_code
            body = e.response.text.lower()[:800]
            if status == 429:
                return ModelUnavailable(f"{label}: rate limited by the provider"), True
            if status in (401, 403):
                return ModelUnavailable(f"{label}: credentials rejected ({status})"), False
            if status == 402:  # out of credits / over the free allowance — an outage, not bad output
                return ModelUnavailable(f"{label}: provider account has insufficient credits (402)"), False
            if status == 404 or ("model" in body and any(m in body for m in _MODEL_MISSING)):
                return ModelNotInstalled(f"{label}: the configured model is not available"), False
            if status >= 500 or status == 498:  # 498: provider capacity exceeded
                return ModelUnavailable(f"{label}: HTTP {status}"), True
            if any(m in body for m in _REQUEST_TOO_BIG):
                return MalformedOutput(f"{label}: request too large or output not valid JSON ({status})"), False
            return MalformedOutput(f"{label}: request rejected (HTTP {status})"), False
        return ModelUnavailable(f"{label}: {type(e).__name__}"), True

    @staticmethod
    def _retry_after(e: Exception, attempt: int) -> float:
        if isinstance(e, httpx.HTTPStatusError):
            raw = e.response.headers.get("retry-after", "")
            try:
                return min(MAX_RETRY_AFTER_S, max(0.0, float(raw)))
            except ValueError:
                pass
        return min(4.0, 0.5 * 2**attempt)

    def _require_key(self, what: str, env_name: str) -> None:
        if not self._has_key:
            raise ModelUnavailable(f"{self.name} {what}: {env_name} is not configured")

    # --------------------------------------------------------------- request

    async def _request(self, method: str, path: str, *, what: str, json: dict[str, Any] | None = None) -> dict[str, Any]:
        attempt = 0
        while True:
            try:
                r = await self._client.request(method, path, json=json)
                r.raise_for_status()
                data = r.json()
                if not isinstance(data, dict):
                    raise MalformedOutput(f"{self.name} {what}: unexpected response shape")
                return data
            except ValueError as e:  # invalid JSON body
                raise MalformedOutput(f"{self.name} {what}: invalid JSON response") from e
            except httpx.HTTPError as e:
                err, transient = self._classify(e, what)
                detail = error_detail(e)
                if not transient or attempt >= self.retries:
                    logger.warning(f"{self.name}_error", extra={"fields": {"op": what, "error": err.code, "attempts": attempt + 1, **detail}})
                    raise err from e
                logger.info(f"{self.name}_retry", extra={"fields": {"op": what, "error": err.code, "attempt": attempt + 1, **detail}})
                attempt += 1
                await asyncio.sleep(self._retry_after(e, attempt))

    async def aclose(self) -> None:
        await self._client.aclose()
