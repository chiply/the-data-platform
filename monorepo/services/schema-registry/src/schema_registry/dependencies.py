"""FastAPI dependency injection callables."""

from functools import lru_cache
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from schema_registry.config import Settings
from schema_registry.database import get_async_session_factory, get_engine


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings.

    Uses @lru_cache so the Settings object is created once and reused
    across all requests.
    """
    return Settings()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session.

    The session is automatically closed when the request completes.
    """
    async with get_async_session_factory()() as session:
        yield session
