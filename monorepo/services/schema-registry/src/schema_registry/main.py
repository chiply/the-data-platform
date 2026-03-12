"""Centralized schema registry for the data platform — application factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from schema_registry.database import engine
from schema_registry.exceptions import register_exception_handlers
from schema_registry.routers import health, schemas


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle."""
    # Startup
    yield
    # Shutdown
    await engine.dispose()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="schema-registry",
        description="Centralized schema registry for the data platform",
        version="0.1.0",
        lifespan=lifespan,
    )

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(schemas.router)

    return app


app = create_app()
