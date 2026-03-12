"""Test fixtures for schema-registry.

Provides AsyncClient for endpoint testing and settings override support.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from schema_registry.main import app

pytest_plugins = []


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client() -> AsyncClient:
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
