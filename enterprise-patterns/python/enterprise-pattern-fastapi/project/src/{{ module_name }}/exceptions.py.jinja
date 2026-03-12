"""Application exception hierarchy with FastAPI exception handlers."""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Base application exception.

    All domain exceptions should inherit from this class so that the
    registered handler returns a structured JSON response instead of a 500.
    """

    def __init__(
        self,
        status_code: int = 500,
        detail: str = "Internal server error",
        error_code: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code
        super().__init__(detail)


class NotFound(AppException):
    """Resource not found (404)."""

    def __init__(self, detail: str = "Not found", error_code: str | None = None) -> None:
        super().__init__(status_code=404, detail=detail, error_code=error_code)


class BadRequest(AppException):
    """Bad request (400)."""

    def __init__(self, detail: str = "Bad request", error_code: str | None = None) -> None:
        super().__init__(status_code=400, detail=detail, error_code=error_code)


class PermissionDenied(AppException):
    """Permission denied (403)."""

    def __init__(self, detail: str = "Permission denied", error_code: str | None = None) -> None:
        super().__init__(status_code=403, detail=detail, error_code=error_code)


class NotAuthenticated(AppException):
    """Not authenticated (401)."""

    def __init__(self, detail: str = "Not authenticated", error_code: str | None = None) -> None:
        super().__init__(status_code=401, detail=detail, error_code=error_code)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle AppException and return a structured JSON response."""
    content: dict[str, str | None] = {"detail": exc.detail}
    if exc.error_code is not None:
        content["error_code"] = exc.error_code
    return JSONResponse(status_code=exc.status_code, content=content)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all application exception handlers on the FastAPI app."""
    app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
