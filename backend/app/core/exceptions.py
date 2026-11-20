"""Consistent error envelope: {"error": {"code", "message", "request_id"}}. Never leaks internals."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var

logger = logging.getLogger("pramaan.errors")


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"
    message = "The request could not be processed."

    def __init__(self, message: str | None = None, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message or self.message)
        self.message = message or self.message
        self.code = code or self.code
        self.status_code = status_code or self.status_code


class Unauthenticated(AppError):
    status_code, code, message = 401, "UNAUTHENTICATED", "Sign in to continue."


class Forbidden(AppError):
    status_code, code, message = 403, "FORBIDDEN", "You don't have access to this resource."


class NotFound(AppError):
    status_code, code, message = 404, "NOT_FOUND", "Not found."

    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found.", code=f"{resource.upper().replace(' ', '_')}_NOT_FOUND")


class Conflict(AppError):
    status_code, code, message = 409, "CONFLICT", "This conflicts with existing data."


class ValidationFailed(AppError):
    status_code, code, message = 422, "VALIDATION_FAILED", "Some fields are invalid."


class PayloadTooLarge(AppError):
    status_code, code, message = 413, "PAYLOAD_TOO_LARGE", "The upload is too large."


class RateLimited(AppError):
    status_code, code, message = 429, "RATE_LIMITED", "Too many requests. Please slow down."


def _body(code: str, message: str, details: object | None = None) -> dict[str, object]:
    err: dict[str, object] = {"code": code, "message": message, "request_id": request_id_var.get()}
    if details is not None:
        err["details"] = details
    return {"error": err}


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {"Retry-After": "5"} if exc.status_code == 429 else None
        return JSONResponse(_body(exc.code, exc.message), status_code=exc.status_code, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
        return JSONResponse(_body("VALIDATION_FAILED", "Some fields are invalid.", details), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 401: "UNAUTHENTICATED", 403: "FORBIDDEN"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(_body(code, str(exc.detail) if exc.status_code < 500 else "Unexpected error."), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error")
        return JSONResponse(_body("INTERNAL_ERROR", "Something went wrong on our side."), status_code=500)
