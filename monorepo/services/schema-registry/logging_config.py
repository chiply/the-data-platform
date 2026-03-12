"""Structured logging configuration with OpenTelemetry trace/span ID injection.

Uses logging.config.dictConfig with python-json-logger for structured JSON output
in deployed environments and human-readable text in local development.
"""

import logging.config
import os


def _is_deployed() -> bool:
    """Check if running in a deployed environment."""
    env = os.getenv("ENVIRONMENT", "local").lower()
    return env in ("production", "staging", "development")


LOGGING_CONFIG: dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s %(otelTraceID)s %(otelSpanID)s",
        },
        "text": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "default": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stderr",
            "formatter": "json" if _is_deployed() else "text",
        },
    },
    "loggers": {
        "uvicorn": {
            "handlers": ["default"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.access": {
            "handlers": ["default"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["default"],
        "level": os.getenv("LOG_LEVEL", "INFO"),
    },
}


def configure_logging() -> None:
    """Apply the logging configuration."""
    logging.config.dictConfig(LOGGING_CONFIG)
