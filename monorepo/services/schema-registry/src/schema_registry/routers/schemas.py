"""Schema registry endpoints.

Service-specific customization on top of the template scaffolding.
Provides endpoints for listing and retrieving registered schemas.
"""

from fastapi import APIRouter

from schema_registry.exceptions import NotFound
from schema_registry.schemas import SchemaItem, SchemaListResponse

router = APIRouter(prefix="/schemas", tags=["schemas"])

# In-memory stub data — replace with database-backed storage
_STUB_SCHEMAS: dict[str, SchemaItem] = {
    "user.created": SchemaItem(
        name="user.created",
        version="1.0.0",
        schema_definition={
            "type": "object",
            "properties": {
                "user_id": {"type": "string"},
                "email": {"type": "string", "format": "email"},
                "created_at": {"type": "string", "format": "date-time"},
            },
            "required": ["user_id", "email", "created_at"],
        },
    ),
    "feed.item.parsed": SchemaItem(
        name="feed.item.parsed",
        version="1.0.0",
        schema_definition={
            "type": "object",
            "properties": {
                "feed_id": {"type": "string"},
                "title": {"type": "string"},
                "url": {"type": "string", "format": "uri"},
                "published_at": {"type": "string", "format": "date-time"},
            },
            "required": ["feed_id", "title", "url"],
        },
    ),
}


@router.get(
    "",
    summary="List schemas",
    description="Returns all registered schemas sorted alphabetically by name.",
    response_model=SchemaListResponse,
)
async def list_schemas() -> SchemaListResponse:
    """List all registered schemas."""
    items = sorted(_STUB_SCHEMAS.values(), key=lambda s: s.name)
    return SchemaListResponse(schemas=items)


@router.get(
    "/{name}",
    summary="Get schema by name",
    description="Returns a specific schema by its name, including its version and definition.",
    response_model=SchemaItem,
)
async def get_schema(name: str) -> SchemaItem:
    """Get a specific schema by name."""
    schema = _STUB_SCHEMAS.get(name)
    if schema is None:
        raise NotFound(detail=f"Schema '{name}' not found")
    return schema
