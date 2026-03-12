"""Schema-specific endpoints for the schema registry."""

from fastapi import APIRouter

from schema_registry.exceptions import NotFound

router = APIRouter(prefix="/schemas", tags=["schemas"])

# Stub data for demonstration purposes
_EXAMPLE_SCHEMAS = {
    "user-event": {
        "name": "user-event",
        "version": "1.0.0",
        "fields": {"user_id": "string", "event_type": "string", "timestamp": "datetime"},
    },
    "order-created": {
        "name": "order-created",
        "version": "1.0.0",
        "fields": {"order_id": "string", "amount": "number", "currency": "string"},
    },
}


@router.get("/")
async def list_schemas() -> list[dict]:
    """List all registered schemas."""
    return list(_EXAMPLE_SCHEMAS.values())


@router.get("/{name}")
async def get_schema(name: str) -> dict:
    """Get a specific schema by name."""
    if name not in _EXAMPLE_SCHEMAS:
        raise NotFound(detail=f"Schema '{name}' not found")
    return _EXAMPLE_SCHEMAS[name]
