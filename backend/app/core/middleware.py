"""Request id, access logging, secure headers and request size limits (pure ASGI)."""

from __future__ import annotations

import json
import logging
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import log, request_id_var, user_id_var

logger = logging.getLogger("pramaan.http")

SECURE_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
]


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, *, max_body_bytes: int, hsts: bool) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        incoming = headers.get(b"x-request-id", b"").decode()[:64]
        rid = incoming if incoming.replace("-", "").isalnum() and incoming else uuid.uuid4().hex
        req_token = request_id_var.set(rid)
        user_token = user_id_var.set(None)
        start = time.perf_counter()
        status = 500

        declared = int(headers.get(b"content-length", b"0") or 0)
        if declared > self.max_body_bytes:
            await _reject_too_large(send, rid)
            request_id_var.reset(req_token)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    raise _BodyTooLarge
            return message

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                hdrs = list(message.get("headers", []))
                hdrs.append((b"x-request-id", rid.encode()))
                hdrs.extend(SECURE_HEADERS)
                if self.hsts:
                    hdrs.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                message["headers"] = hdrs
            await send(message)

        try:
            await self.app(scope, limited_receive, send_wrapper)
        except _BodyTooLarge:
            await _reject_too_large(send, rid)
            status = 413
        finally:
            log(
                logger,
                logging.INFO,
                "request",
                method=scope["method"],
                path=scope["path"],
                status=status,
                duration_ms=round((time.perf_counter() - start) * 1000, 1),
            )
            request_id_var.reset(req_token)
            user_id_var.reset(user_token)


class CatchAllMiddleware:
    """Converts unhandled exceptions into the JSON error envelope *inside* CORS.

    Starlette serves `Exception` handlers from its outermost ServerErrorMiddleware,
    i.e. outside CORSMiddleware — the browser then sees a CORS failure and the
    client reports a misleading network error. Handling it here keeps real 500s visible.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except _BodyTooLarge:
            raise
        except Exception:
            logger.exception("unhandled_error")
            if started:
                raise
            body = json.dumps(
                {"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong on our side.", "request_id": request_id_var.get()}}
            ).encode()
            await send({"type": "http.response.start", "status": 500, "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": body})


class _BodyTooLarge(Exception):
    pass


async def _reject_too_large(send: Send, rid: str) -> None:
    body = json.dumps({"error": {"code": "PAYLOAD_TOO_LARGE", "message": "The upload is too large.", "request_id": rid}}).encode()
    await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"x-request-id", rid.encode())]})
    await send({"type": "http.response.body", "body": body})
