"""Health and version endpoints."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from schema_registry.config import Settings
from schema_registry.dependencies import get_db_session, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Return service health status including database connectivity."""
    try:
        await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        logger.exception("Database health check failed")
        db_status = "disconnected"

    status = "healthy" if db_status == "connected" else "degraded"
    return {"status": status, "database": db_status}


@router.get("/version")
async def version(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """Return service name and version."""
    return {
        "service": settings.service_name,
        "version": settings.service_version,
        "environment": settings.environment.value,
    }
