"""Smoke tests for health and version endpoints."""

from httpx import AsyncClient


async def test_health_returns_200(client: AsyncClient) -> None:
    """GET /health returns 200 with status healthy."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


async def test_version_returns_200(client: AsyncClient) -> None:
    """GET /version returns 200 with service name and version."""
    response = await client.get("/version")
    assert response.status_code == 200

    data = response.json()
    assert "service" in data
    assert "version" in data
    assert data["service"] == "schema-registry"
    assert data["version"] == "0.1.0"
