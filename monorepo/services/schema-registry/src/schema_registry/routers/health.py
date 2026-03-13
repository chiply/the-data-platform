"""Health and version endpoints."""

from fastapi import APIRouter, Depends

from schema_registry.config import Settings
from schema_registry.dependencies import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Return service health status."""
    return {"status": "healthy"}


@router.get("/version")
async def version(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """Return service name and version."""
    return {
        "service": settings.service_name,
        "version": settings.service_version,
    }
