"""OpenTelemetry instrumentation for schema-registry."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

if TYPE_CHECKING:
    from fastapi import FastAPI

    from schema_registry.config import Settings

logger = logging.getLogger(__name__)

# Exported tracer for creating custom spans throughout the application.
# Usage:
#   from schema_registry.telemetry import tracer
#   with tracer.start_as_current_span("my-operation"):
#       ...
tracer = trace.get_tracer(__name__)


def init_telemetry(app: FastAPI, settings: Settings) -> None:
    """Initialise OpenTelemetry tracing and auto-instrumentation.

    Call this once during application startup (e.g. inside the lifespan
    context manager) *before* the first request is served.

    Args:
        app: The FastAPI application instance to instrument.
        settings: Application settings providing service metadata.
    """
    resource = Resource.create(
        {
            "service.name": settings.service_name,
            "service.version": settings.service_version,
            "deployment.environment": settings.environment.value,
        }
    )

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    # Auto-instrument FastAPI for incoming HTTP requests.
    FastAPIInstrumentor.instrument_app(app)

    # Auto-instrument httpx for outgoing HTTP calls.
    HTTPXClientInstrumentor().instrument()

    # Auto-instrument SQLAlchemy for database queries.
    SQLAlchemyInstrumentor().instrument(enable_commenter=True)

    logger.info(
        "OpenTelemetry initialised",
        extra={
            "service.name": settings.service_name,
            "deployment.environment": settings.environment.value,
        },
    )
