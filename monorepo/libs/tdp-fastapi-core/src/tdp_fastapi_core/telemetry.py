"""OpenTelemetry instrumentation setup for TDP FastAPI services."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)


def setup_telemetry(
    app: FastAPI,
    *,
    service_name: str,
    service_version: str = "0.0.0",
    environment: str = "LOCAL",
    instrument_httpx: bool = True,
    instrument_sqlalchemy: bool = True,
) -> None:
    """Initialise OpenTelemetry tracing and auto-instrumentation.

    Parameters
    ----------
    app:
        The FastAPI application instance to instrument.
    service_name:
        Logical service name reported in traces.
    service_version:
        Service version reported in traces.
    environment:
        Deployment environment (e.g. LOCAL, STAGING, PRODUCTION).
    instrument_httpx:
        Whether to enable HTTPX client auto-instrumentation.
    instrument_sqlalchemy:
        Whether to enable SQLAlchemy auto-instrumentation.
    """
    resource = Resource.create(
        {
            "service.name": service_name,
            "service.version": service_version,
            "deployment.environment": environment,
        }
    )

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)

    if instrument_httpx:
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

            HTTPXClientInstrumentor().instrument()
        except ImportError:
            logger.debug("opentelemetry-instrumentation-httpx not installed, skipping")

    if instrument_sqlalchemy:
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

            SQLAlchemyInstrumentor().instrument(enable_commenter=True)
        except ImportError:
            logger.debug("opentelemetry-instrumentation-sqlalchemy not installed, skipping")

    logger.info(
        "OpenTelemetry initialised",
        extra={
            "service.name": service_name,
            "deployment.environment": environment,
        },
    )
