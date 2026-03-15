"""Tests for schema registry API routes.

These tests use the client_with_db fixture to inject a test database session.
They require a running PostgreSQL instance (local CNPG or CI service container).

To run locally:
  1. Start the local k3d cluster: tilt up
  2. Set DATABASE_URL: export DATABASE_URL=postgresql+asyncpg://tdp:local-dev-password@localhost:5432/schema_registry_test
  3. Run: pytest tests/test_routes.py -v

For unit testing without a database, see test_schemas.py (Pydantic model tests)
and test_models.py (SQLAlchemy model structure tests).
"""

import os

import pytest
from httpx import AsyncClient

# Skip all tests in this module if no database is available.
# CI sets DATABASE_URL; local dev uses the Tiltfile-provisioned CNPG.
pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set — skipping database integration tests",
)


async def test_list_schemas_empty(client_with_db: AsyncClient) -> None:
    """GET /schemas/ returns an empty list when no subjects exist."""
    response = await client_with_db.get("/schemas/")
    assert response.status_code == 200
    assert response.json() == []


async def test_create_schema(client_with_db: AsyncClient) -> None:
    """POST /schemas/ creates a new subject and returns it."""
    payload = {
        "name": "test-subject",
        "compatibility_mode": "BACKWARD",
        "description": "A test subject",
    }
    response = await client_with_db.post("/schemas/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "test-subject"
    assert data["compatibility_mode"] == "BACKWARD"
    assert data["description"] == "A test subject"
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_get_schema_not_found(client_with_db: AsyncClient) -> None:
    """GET /schemas/{name} returns 404 for a nonexistent subject."""
    response = await client_with_db.get("/schemas/nonexistent")
    assert response.status_code == 404


async def test_create_and_get_schema(client_with_db: AsyncClient) -> None:
    """Creating a subject and then retrieving it by name should work."""
    payload = {
        "name": "roundtrip-subject",
        "compatibility_mode": "FULL",
        "description": "Round-trip test",
    }
    create_response = await client_with_db.post("/schemas/", json=payload)
    assert create_response.status_code == 201

    get_response = await client_with_db.get("/schemas/roundtrip-subject")
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["name"] == "roundtrip-subject"
    assert data["compatibility_mode"] == "FULL"
