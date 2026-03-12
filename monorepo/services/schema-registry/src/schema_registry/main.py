"""FastAPI application factory for schema-registry.

This module creates the app instance, registers exception handlers, includes
routers, and manages the application lifespan. It is NOT a route dump — all
routes belong in routers/*.py modules.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from schema_registry.config import settings
from schema_registry.database import engine
from schema_registry.exceptions import AppException
from schema_registry.logging_config import configure_logging
from schema_registry.routers import health, schemas
from schema_registry.telemetry import setup_telemetry


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan — setup and teardown."""
    configure_logging()
    setup_telemetry()
    yield
    # Dispose database engine on shutdown
    await engine.dispose()


app = FastAPI(
    title="schema-registry",
    description="Centralized schema registry for the data platform",
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle application exceptions and return structured JSON responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "detail": exc.detail,
        },
    )


app.include_router(health.router)
app.include_router(schemas.router)
