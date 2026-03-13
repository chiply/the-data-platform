"""Centralized schema registry for the data platform — application factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from tdp_fastapi_core import configure_logging, register_exception_handlers, setup_telemetry
from tdp_fastapi_core.middleware import RequestIDMiddleware

import schema_registry
from schema_registry.config import Settings
from schema_registry.database import get_engine
from schema_registry.dependencies import get_settings
from schema_registry.routers import health, schemas


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle."""
    settings = get_settings()
    configure_logging(log_level=settings.log_level, environment=settings.environment.value)
    setup_telemetry(
        app,
        service_name=settings.service_name,
        service_version=settings.service_version,
        environment=settings.environment.value,
        instrument_httpx=True,
        instrument_sqlalchemy=True,
    )
    yield
    # Shutdown
    await get_engine().dispose()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="schema-registry",
        description="Centralized schema registry for the data platform",
        version=schema_registry.__version__,
        lifespan=lifespan,
    )

    register_exception_handlers(app)
    app.add_middleware(RequestIDMiddleware)

    app.include_router(health.router)
    app.include_router(schemas.router)

    return app


app = create_app()
