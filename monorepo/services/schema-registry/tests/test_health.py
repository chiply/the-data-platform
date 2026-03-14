"""Smoke tests for health and version endpoints."""

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from schema_registry.config import Settings
from schema_registry.dependencies import get_db_session, get_settings
from schema_registry.main import app


@pytest.fixture()
async def client_with_mock_db() -> AsyncClient:
    """Yield a test client with a mocked database session.

    The mock session returns a successful result for SELECT 1,
    simulating a healthy database connection.
    """
    mock_session = AsyncMock(spec=AsyncSession)
    # Mock the execute method to simulate a successful DB ping
    mock_session.execute = AsyncMock(return_value=None)

    async def _override_db_session():
        return mock_session

    def _override_settings():
        return Settings(
            service_name="schema-registry",
            service_version="0.1.0",
            environment="LOCAL",
            log_level="DEBUG",
        )

    app.dependency_overrides[get_db_session] = _override_db_session
    app.dependency_overrides[get_settings] = _override_settings

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()


async def test_health_returns_200(client_with_mock_db: AsyncClient) -> None:
    """GET /health returns 200 with status healthy when DB is connected."""
    response = await client_with_mock_db.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


async def test_version_returns_200(client_with_mock_db: AsyncClient) -> None:
    """GET /version returns 200 with service name and version."""
    response = await client_with_mock_db.get("/version")
    assert response.status_code == 200

    data = response.json()
    assert "service" in data
    assert "version" in data
    assert data["service"] == "schema-registry"
    assert data["version"] == "0.1.0"
