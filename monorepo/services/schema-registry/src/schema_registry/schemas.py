"""Pydantic schemas with Design by Contract support.

These are the API request/response models (Pydantic), distinct from the
SQLAlchemy ORM models in schema_registry.models.
"""

from datetime import datetime
from enum import Enum

import icontract
from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base schema for all Pydantic models in this service.

    Provides shared configuration and can be extended with common
    serialization logic.
    """

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Enums (mirroring ORM enums for API layer)
# ---------------------------------------------------------------------------


class CompatibilityModeEnum(str, Enum):
    """Schema compatibility enforcement mode."""

    BACKWARD = "BACKWARD"
    BACKWARD_TRANSITIVE = "BACKWARD_TRANSITIVE"
    FORWARD = "FORWARD"
    FORWARD_TRANSITIVE = "FORWARD_TRANSITIVE"
    FULL = "FULL"
    FULL_TRANSITIVE = "FULL_TRANSITIVE"
    NONE = "NONE"


class SchemaTypeEnum(str, Enum):
    """Supported schema languages."""

    AVRO = "AVRO"
    PROTOBUF = "PROTOBUF"
    JSON = "JSON"


# ---------------------------------------------------------------------------
# Subject schemas
# ---------------------------------------------------------------------------


@icontract.invariant(lambda self: len(self.name) > 0, "Name must not be empty")
class SubjectCreate(BaseSchema):
    """Request body for creating a new subject."""

    name: str
    compatibility_mode: CompatibilityModeEnum = CompatibilityModeEnum.BACKWARD
    description: str = ""


class SubjectResponse(BaseSchema):
    """Response body for a subject."""

    id: int
    name: str
    compatibility_mode: str
    description: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# SchemaVersion schemas
# ---------------------------------------------------------------------------


@icontract.invariant(lambda self: self.version > 0, "Version must be positive")
class SchemaVersionCreate(BaseSchema):
    """Request body for registering a new schema version."""

    version: int
    schema_type: SchemaTypeEnum
    definition: dict
    fingerprint: str
    checksum: str


class SchemaVersionResponse(BaseSchema):
    """Response body for a schema version."""

    id: int
    subject_id: int
    version: int
    schema_type: str
    definition: dict
    fingerprint: str
    checksum: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Legacy example schema (kept for backward compatibility with existing tests)
# ---------------------------------------------------------------------------


@icontract.invariant(lambda self: len(self.name) > 0, "Name must not be empty")
class ExampleSchema(BaseSchema):
    """Example schema demonstrating icontract @invariant usage.

    The @invariant decorator enforces that the constraint holds whenever
    an instance is created or modified. Replace this with your domain models.
    """

    name: str
    description: str = ""
