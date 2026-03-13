"""Structured logging configuration with OpenTelemetry trace/span ID injection."""

from __future__ import annotations

import logging
import logging.config
from typing import Any

from pythonjsonlogger import jsonlogger

try:
    from opentelemetry import trace

    _HAS_OTEL = True
except ImportError:
    _HAS_OTEL = False


class OTelJsonFormatter(jsonlogger.JsonFormatter):
    """JSON log formatter that injects OpenTelemetry trace_id and span_id."""

    def add_fields(
        self,
        log_record: dict[str, Any],
        record: logging.LogRecord,
        message_dict: dict[str, Any],
    ) -> None:
        super().add_fields(log_record, record, message_dict)

        if _HAS_OTEL:
            span = trace.get_current_span()
            ctx = span.get_span_context()
            if ctx and ctx.trace_id:
                log_record["trace_id"] = format(ctx.trace_id, "032x")
                log_record["span_id"] = format(ctx.span_id, "016x")
            else:
                log_record["trace_id"] = "0" * 32
                log_record["span_id"] = "0" * 16
        else:
            log_record["trace_id"] = "0" * 32
            log_record["span_id"] = "0" * 16


def get_logging_config(log_level: str = "INFO", environment: str = "LOCAL") -> dict[str, Any]:
    """Build a logging dict-config.

    In deployed environments (STAGING, PRODUCTION) the JSON formatter with
    OTel trace injection is used.  Locally a simple human-readable format is
    used instead.
    """
    is_deployed = environment in ("STAGING", "PRODUCTION")

    if is_deployed:
        formatter_config: dict[str, str] = {
            "class": "tdp_fastapi_core.logging.OTelJsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s",
        }
    else:
        formatter_config = {
            "class": "logging.Formatter",
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        }

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": formatter_config,
        },
        "handlers": {
            "stderr": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stderr",
                "formatter": "default",
            },
        },
        "loggers": {
            "uvicorn": {"level": log_level, "handlers": ["stderr"], "propagate": False},
            "uvicorn.access": {"level": log_level, "handlers": ["stderr"], "propagate": False},
        },
        "root": {"level": log_level, "handlers": ["stderr"]},
    }


def configure_logging(log_level: str = "INFO", environment: str = "LOCAL") -> None:
    """Apply structured logging configuration."""
    config = get_logging_config(log_level=log_level, environment=environment)
    logging.config.dictConfig(config)
