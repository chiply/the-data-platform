"""Endpoint smoke tests for /health and /version."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_health_returns_healthy(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.anyio
async def test_version_returns_service_info(client: AsyncClient) -> None:
    response = await client.get("/version")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "schema-registry"
    assert "version" in data
