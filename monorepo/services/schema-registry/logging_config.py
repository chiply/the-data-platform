"""Structured logging configuration — thin wrapper re-exporting from tdp_fastapi_core."""

from tdp_fastapi_core.logging import (  # noqa: F401 — re-export
    OTelJsonFormatter,
    configure_logging,
    get_logging_config,
)

__all__ = [
    "OTelJsonFormatter",
    "configure_logging",
    "get_logging_config",
]
