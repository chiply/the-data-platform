"""Tests for schema endpoints and Pydantic model serialization.

Demonstrates Polyfactory-style model construction and round-trip serialization.
"""

import pytest
from httpx import AsyncClient

from schema_registry.schemas import SchemaItem, SchemaListResponse


def test_schema_item_round_trip() -> None:
    """Test SchemaItem serialization round-trip."""
    item = SchemaItem(
        name="test.event",
        version="1.0.0",
        schema_definition={"type": "object", "properties": {"id": {"type": "string"}}},
    )
    data = item.model_dump()
    restored = SchemaItem.model_validate(data)
    assert restored == item


def test_schema_list_response_empty() -> None:
    """Test SchemaListResponse with empty list."""
    response = SchemaListResponse(schemas=[])
    assert response.schemas == []
    data = response.model_dump()
    assert data == {"schemas": []}


@pytest.mark.anyio
async def test_list_schemas_endpoint(client: AsyncClient) -> None:
    response = await client.get("/schemas")
    assert response.status_code == 200
    data = response.json()
    assert "schemas" in data
    assert isinstance(data["schemas"], list)


@pytest.mark.anyio
async def test_get_schema_not_found(client: AsyncClient) -> None:
    response = await client.get("/schemas/nonexistent")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_get_schema_existing(client: AsyncClient) -> None:
    response = await client.get("/schemas/user.created")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "user.created"
    assert "version" in data
    assert "schema_definition" in data
