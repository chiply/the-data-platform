"""Tests for tdp_fastapi_core.telemetry."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

from tdp_fastapi_core.telemetry import setup_telemetry

import pytest


@pytest.fixture(autouse=True)
def _reset_tracer_provider():
    """Reset the global tracer provider before each test so the idempotency
    guard in setup_telemetry doesn't short-circuit."""
    # Store original and set a fresh proxy provider
    original = trace.get_tracer_provider()
    trace._TRACER_PROVIDER = None  # type: ignore[attr-defined]
    trace._TRACER_PROVIDER_SET_ONCE._done = False  # type: ignore[attr-defined]
    yield
    # Restore (best-effort)
    try:
        trace._TRACER_PROVIDER = original  # type: ignore[attr-defined]
    except Exception:
        pass


@patch("tdp_fastapi_core.telemetry.BatchSpanProcessor")
@patch("tdp_fastapi_core.telemetry.OTLPSpanExporter")
@patch("tdp_fastapi_core.telemetry.FastAPIInstrumentor")
def test_setup_telemetry_instruments_fastapi(
    mock_fastapi_instr: MagicMock,
    mock_exporter: MagicMock,
    mock_processor: MagicMock,
) -> None:
    app = FastAPI()
    setup_telemetry(
        app,
        service_name="test-service",
        service_version="1.0.0",
        environment="LOCAL",
        instrument_httpx=False,
        instrument_sqlalchemy=False,
    )
    mock_fastapi_instr.instrument_app.assert_called_once_with(app)


@patch("tdp_fastapi_core.telemetry.BatchSpanProcessor")
@patch("tdp_fastapi_core.telemetry.OTLPSpanExporter")
@patch("tdp_fastapi_core.telemetry.FastAPIInstrumentor")
def test_setup_telemetry_skips_optional_instrumentors_on_import_error(
    mock_fastapi_instr: MagicMock,
    mock_exporter: MagicMock,
    mock_processor: MagicMock,
) -> None:
    """When optional instrumentor packages are missing, setup should not raise."""
    app = FastAPI()
    with patch.dict("sys.modules", {
        "opentelemetry.instrumentation.httpx": None,
        "opentelemetry.instrumentation.sqlalchemy": None,
    }):
        # Should not raise even though optional packages are "missing"
        setup_telemetry(
            app,
            service_name="test-service",
            instrument_httpx=True,
            instrument_sqlalchemy=True,
        )


@patch("tdp_fastapi_core.telemetry.BatchSpanProcessor")
@patch("tdp_fastapi_core.telemetry.OTLPSpanExporter")
@patch("tdp_fastapi_core.telemetry.FastAPIInstrumentor")
def test_setup_telemetry_default_params(
    mock_fastapi_instr: MagicMock,
    mock_exporter: MagicMock,
    mock_processor: MagicMock,
) -> None:
    app = FastAPI()
    # Should work with just service_name
    setup_telemetry(app, service_name="minimal")
    mock_fastapi_instr.instrument_app.assert_called_once_with(app)


@patch("tdp_fastapi_core.telemetry.BatchSpanProcessor")
@patch("tdp_fastapi_core.telemetry.OTLPSpanExporter")
@patch("tdp_fastapi_core.telemetry.FastAPIInstrumentor")
def test_setup_telemetry_idempotent(
    mock_fastapi_instr: MagicMock,
    mock_exporter: MagicMock,
    mock_processor: MagicMock,
) -> None:
    """Calling setup_telemetry twice should only instrument once."""
    app = FastAPI()
    setup_telemetry(app, service_name="svc")
    setup_telemetry(app, service_name="svc")
    # FastAPI instrumentor should only be called once
    mock_fastapi_instr.instrument_app.assert_called_once()
