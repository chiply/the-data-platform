"""Schema registry ORM models: Subject, SchemaVersion, SchemaReference.

Uses the shared tdp_db base library for DeclarativeBase, naming conventions,
timestamp mixin, and common column types.
"""

import enum
import json
from typing import Any

import icontract
from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tdp_db import Base, TimestampMixin, intpk


class CompatibilityMode(str, enum.Enum):
    """Schema compatibility enforcement mode for a subject."""

    BACKWARD = "BACKWARD"
    BACKWARD_TRANSITIVE = "BACKWARD_TRANSITIVE"
    FORWARD = "FORWARD"
    FORWARD_TRANSITIVE = "FORWARD_TRANSITIVE"
    FULL = "FULL"
    FULL_TRANSITIVE = "FULL_TRANSITIVE"
    NONE = "NONE"


class SchemaType(str, enum.Enum):
    """Supported schema languages."""

    AVRO = "AVRO"
    PROTOBUF = "PROTOBUF"
    JSON = "JSON"


def _is_valid_json(definition: Any) -> bool:
    """Return True if definition is a valid JSON-serializable structure."""
    if definition is None:
        return False
    try:
        json.dumps(definition)
        return True
    except (TypeError, ValueError):
        return False


@icontract.invariant(
    lambda self: len(self.name) > 0,
    "Subject name must not be empty",
)
class Subject(TimestampMixin, Base):
    """A named context under which schemas are registered.

    The same schema can be registered under different subjects with different
    compatibility rules. Subject names are unique across the registry.
    """

    __tablename__ = "subject"

    id: Mapped[intpk]
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    compatibility_mode: Mapped[CompatibilityMode] = mapped_column(
        String(30),
        nullable=False,
        default=CompatibilityMode.BACKWARD,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Relationships
    versions: Mapped[list["SchemaVersion"]] = relationship(
        back_populates="subject",
        cascade="all, delete-orphan",
        order_by="SchemaVersion.version",
    )

    __table_args__ = (
        CheckConstraint(
            "compatibility_mode IN ('BACKWARD', 'BACKWARD_TRANSITIVE', 'FORWARD', "
            "'FORWARD_TRANSITIVE', 'FULL', 'FULL_TRANSITIVE', 'NONE')",
            name="valid_compatibility_mode",
        ),
        Index("ix_subject_name", "name"),
    )


@icontract.invariant(
    lambda self: self.version > 0,
    "Schema version must be a positive integer",
)
@icontract.invariant(
    lambda self: _is_valid_json(self.definition),
    "Schema definition must be a valid JSON-serializable structure",
)
class SchemaVersion(TimestampMixin, Base):
    """A specific version of a schema registered under a subject.

    Each version is immutable once created. The definition is stored as JSONB
    for efficient querying. A fingerprint (canonical hash) enables deduplication.
    """

    __tablename__ = "schema_version"

    id: Mapped[intpk]
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subject.id", ondelete="CASCADE"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(nullable=False)
    schema_type: Mapped[SchemaType] = mapped_column(
        String(20),
        nullable=False,
    )
    definition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)

    # Relationships
    subject: Mapped["Subject"] = relationship(back_populates="versions")
    references: Mapped[list["SchemaReference"]] = relationship(
        back_populates="schema_version",
        cascade="all, delete-orphan",
        foreign_keys="SchemaReference.schema_version_id",
    )

    __table_args__ = (
        UniqueConstraint("subject_id", "version", name="uq_schema_version_subject_version"),
        Index("ix_schema_version_fingerprint", "fingerprint"),
        CheckConstraint(
            "schema_type IN ('AVRO', 'PROTOBUF', 'JSON')",
            name="valid_schema_type",
        ),
    )


class SchemaReference(Base):
    """Tracks cross-schema dependencies (e.g., Protobuf imports, Avro named types).

    A schema version can reference other schema versions. This enables the
    registry to track the dependency graph between schemas.
    """

    __tablename__ = "schema_reference"

    id: Mapped[intpk]
    schema_version_id: Mapped[int] = mapped_column(
        ForeignKey("schema_version.id", ondelete="CASCADE"),
        nullable=False,
    )
    referenced_schema_version_id: Mapped[int] = mapped_column(
        ForeignKey("schema_version.id", ondelete="CASCADE"),
        nullable=False,
    )
    reference_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Relationships
    schema_version: Mapped["SchemaVersion"] = relationship(
        back_populates="references",
        foreign_keys=[schema_version_id],
    )
    referenced_schema_version: Mapped["SchemaVersion"] = relationship(
        foreign_keys=[referenced_schema_version_id],
    )
