"""Health and version endpoints.

Establishes the convention that main.py is the app factory only, not a route
dump. All routes belong in routers/*.py modules.
"""

from fastapi import APIRouter

from schema_registry.config import settings

router = APIRouter()


@router.get("/health", summary="Health check", description="Returns the current health status of the service.")
async def health() -> dict:
    """Return service health status."""
    return {"status": "healthy"}


@router.get("/version", summary="Service version", description="Returns the service name and current version.")
async def version() -> dict:
    """Return service name and version."""
    return {"service": settings.SERVICE_NAME, "version": settings.SERVICE_VERSION}
