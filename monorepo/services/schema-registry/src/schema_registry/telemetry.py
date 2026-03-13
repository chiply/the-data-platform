"""OpenTelemetry instrumentation for schema-registry.

Thin wrapper re-exporting from tdp_fastapi_core.  The local ``tracer``
instance is kept so service code can create custom spans:

    from schema_registry.telemetry import tracer
    with tracer.start_as_current_span("my-operation"):
        ...
"""

from opentelemetry import trace

from tdp_fastapi_core.telemetry import setup_telemetry  # noqa: F401 — re-export

tracer = trace.get_tracer(__name__)
