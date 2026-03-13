"""SQLAlchemy ORM models for the schema registry.

All models are re-exported here so that Alembic's ``from schema_registry.models import *``
picks them up for autogenerate.
"""

from schema_registry.models.schema import (
    CompatibilityMode,
    SchemaReference,
    SchemaType,
    SchemaVersion,
    Subject,
)

__all__ = [
    "CompatibilityMode",
    "SchemaReference",
    "SchemaType",
    "SchemaVersion",
    "Subject",
]
