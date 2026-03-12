"""Pydantic models (schemas) for the schema-registry service.

Demonstrates base model patterns including icontract @invariant usage.
"""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"


class VersionResponse(BaseModel):
    """Version endpoint response."""

    service: str
    version: str


class SchemaItem(BaseModel):
    """A registered schema entry."""

    name: str = Field(..., description="Schema name")
    version: str = Field(default="0.0.0", description="Schema version")
    schema_definition: dict = Field(default_factory=dict, description="Schema definition")


class SchemaListResponse(BaseModel):
    """Response for listing schemas."""

    schemas: list[SchemaItem] = Field(default_factory=list)
