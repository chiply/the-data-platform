"""Typed HTTP exception hierarchy with structured error responses.

Raising these exceptions produces proper HTTP status codes (not 500s) because
main.py registers an exception handler that catches AppException.
"""

from __future__ import annotations

from typing import Optional


class AppException(Exception):
    """Base application exception."""

    status_code: int = 500
    detail: str = "Internal server error"

    def __init__(self, detail: Optional[str] = None, status_code: Optional[int] = None) -> None:
        self.detail = detail or self.__class__.detail
        self.status_code = status_code or self.__class__.status_code
        super().__init__(self.detail)


class NotFound(AppException):
    """Resource not found (404)."""

    status_code = 404
    detail = "Not found"


class BadRequest(AppException):
    """Bad request (400)."""

    status_code = 400
    detail = "Bad request"


class PermissionDenied(AppException):
    """Permission denied (403)."""

    status_code = 403
    detail = "Permission denied"


class NotAuthenticated(AppException):
    """Not authenticated (401)."""

    status_code = 401
    detail = "Not authenticated"
