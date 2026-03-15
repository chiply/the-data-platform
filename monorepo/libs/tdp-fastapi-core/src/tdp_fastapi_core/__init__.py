"""TDP FastAPI Core — shared platform library for TDP FastAPI services."""

from __future__ import annotations

from tdp_fastapi_core.exceptions import (
    AppException,
    BadRequest,
    Conflict,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    register_exception_handlers,
)
from tdp_fastapi_core.logging import OTelJsonFormatter, configure_logging
from tdp_fastapi_core.middleware import RequestIDMiddleware
from tdp_fastapi_core.telemetry import setup_telemetry

__all__ = [
    "AppException",
    "BadRequest",
    "Conflict",
    "NotAuthenticated",
    "NotFound",
    "OTelJsonFormatter",
    "PermissionDenied",
    "RequestIDMiddleware",
    "configure_logging",
    "register_exception_handlers",
    "setup_telemetry",
]
