"""Tests for tdp_fastapi_core.telemetry."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi import FastAPI

from tdp_fastapi_core.telemetry import setup_telemetry


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
