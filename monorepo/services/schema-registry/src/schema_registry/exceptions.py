"""Application exceptions — thin wrapper re-exporting from tdp_fastapi_core."""

from tdp_fastapi_core.exceptions import (  # noqa: F401 — re-export
    AppException,
    BadRequest,
    Conflict,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    register_exception_handlers,
)

__all__ = [
    "AppException",
    "BadRequest",
    "Conflict",
    "NotAuthenticated",
    "NotFound",
    "PermissionDenied",
    "register_exception_handlers",
]
