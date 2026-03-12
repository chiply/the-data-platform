"""FastAPI dependency injection callables.

Central location for Depends() callables — prevents DI patterns from
scattering across routers and main.py.
"""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession

from schema_registry.config import Settings
from schema_registry.database import async_session


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance for dependency injection."""
    return Settings()


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Yield an async database session, ensuring cleanup."""
    async with async_session() as session:
        yield session
