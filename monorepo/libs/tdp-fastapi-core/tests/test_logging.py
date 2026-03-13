"""Tests for tdp_fastapi_core.logging."""

from __future__ import annotations

import json
import logging

from tdp_fastapi_core.logging import OTelJsonFormatter, configure_logging, get_logging_config


def test_get_logging_config_local_uses_plain_formatter() -> None:
    config = get_logging_config(environment="LOCAL")
    assert config["formatters"]["default"]["class"] == "logging.Formatter"


def test_get_logging_config_production_uses_otel_formatter() -> None:
    config = get_logging_config(environment="PRODUCTION")
    assert config["formatters"]["default"]["class"] == "tdp_fastapi_core.logging.OTelJsonFormatter"


def test_get_logging_config_staging_uses_otel_formatter() -> None:
    config = get_logging_config(environment="STAGING")
    assert config["formatters"]["default"]["class"] == "tdp_fastapi_core.logging.OTelJsonFormatter"


def test_configure_logging_applies_config() -> None:
    configure_logging(log_level="DEBUG", environment="LOCAL")
    root = logging.getLogger()
    assert root.level == logging.DEBUG


def test_otel_json_formatter_adds_trace_fields() -> None:
    formatter = OTelJsonFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )
    output = formatter.format(record)
    data = json.loads(output)
    assert "trace_id" in data
    assert "span_id" in data
    # Without active span, should be zero-filled
    assert data["trace_id"] == "0" * 32
    assert data["span_id"] == "0" * 16
