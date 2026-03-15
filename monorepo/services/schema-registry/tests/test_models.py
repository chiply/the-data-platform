"""Tests for schema registry SQLAlchemy models.

Uses Hypothesis for property-based tests to validate icontract invariants
and model constraints.
"""

import icontract
import pytest
from hypothesis import given, settings, strategies as st
from sqlalchemy import inspect

from schema_registry.models import (
    CompatibilityMode,
    SchemaReference,
    SchemaType,
    SchemaVersion,
    Subject,
)


# ---------------------------------------------------------------------------
# Model structure tests
# ---------------------------------------------------------------------------


def test_subject_has_expected_columns() -> None:
    """Subject should have all required columns."""
    mapper = inspect(Subject)
    column_names = {col.key for col in mapper.columns}
    expected = {"id", "name", "compatibility_mode", "description", "created_at", "updated_at"}
    assert expected.issubset(column_names)


def test_subject_name_is_unique() -> None:
    """Subject.name column should have a unique constraint."""
    mapper = inspect(Subject)
    name_col = mapper.columns["name"]
    assert name_col.unique is True


def test_schema_version_has_expected_columns() -> None:
    """SchemaVersion should have all required columns."""
    mapper = inspect(SchemaVersion)
    column_names = {col.key for col in mapper.columns}
    expected = {
        "id", "subject_id", "version", "schema_type",
        "definition", "fingerprint", "checksum",
        "created_at", "updated_at",
    }
    assert expected.issubset(column_names)


def test_schema_reference_has_expected_columns() -> None:
    """SchemaReference should have all required columns."""
    mapper = inspect(SchemaReference)
    column_names = {col.key for col in mapper.columns}
    expected = {"id", "schema_version_id", "referenced_schema_version_id", "reference_name"}
    assert expected.issubset(column_names)


def test_schema_version_unique_constraint() -> None:
    """SchemaVersion should have a unique constraint on (subject_id, version)."""
    from tdp_db import Base

    table = Base.metadata.tables["schema_version"]
    unique_constraints = [
        c for c in table.constraints
        if hasattr(c, "columns") and {col.name for col in c.columns} == {"subject_id", "version"}
    ]
    assert len(unique_constraints) > 0


def test_schema_version_fingerprint_index() -> None:
    """SchemaVersion should have an index on fingerprint."""
    from tdp_db import Base

    table = Base.metadata.tables["schema_version"]
    index_names = {idx.name for idx in table.indexes}
    assert "ix_schema_version_fingerprint" in index_names


# ---------------------------------------------------------------------------
# Enum tests
# ---------------------------------------------------------------------------


def test_compatibility_mode_values() -> None:
    """CompatibilityMode should have all expected values."""
    expected = {
        "BACKWARD", "BACKWARD_TRANSITIVE", "FORWARD", "FORWARD_TRANSITIVE",
        "FULL", "FULL_TRANSITIVE", "NONE",
    }
    actual = {m.value for m in CompatibilityMode}
    assert actual == expected


def test_schema_type_values() -> None:
    """SchemaType should have AVRO, PROTOBUF, JSON."""
    expected = {"AVRO", "PROTOBUF", "JSON"}
    actual = {t.value for t in SchemaType}
    assert actual == expected


# ---------------------------------------------------------------------------
# icontract invariant tests
# ---------------------------------------------------------------------------


def test_subject_rejects_empty_name() -> None:
    """Subject with an empty name should raise icontract.ViolationError."""
    with pytest.raises(icontract.ViolationError, match="name must not be empty"):
        Subject(name="", compatibility_mode=CompatibilityMode.BACKWARD)


def test_subject_accepts_valid_name() -> None:
    """Subject with a non-empty name should be created successfully."""
    subject = Subject(name="test-subject", compatibility_mode=CompatibilityMode.BACKWARD)
    assert subject.name == "test-subject"


def test_schema_version_rejects_zero_version() -> None:
    """SchemaVersion with version=0 should raise icontract.ViolationError."""
    with pytest.raises(icontract.ViolationError, match="positive integer"):
        SchemaVersion(
            subject_id=1,
            version=0,
            schema_type=SchemaType.AVRO,
            definition={"type": "string"},
            fingerprint="abc123",
            checksum="def456",
        )


def test_schema_version_rejects_negative_version() -> None:
    """SchemaVersion with version=-1 should raise icontract.ViolationError."""
    with pytest.raises(icontract.ViolationError, match="positive integer"):
        SchemaVersion(
            subject_id=1,
            version=-1,
            schema_type=SchemaType.AVRO,
            definition={"type": "string"},
            fingerprint="abc123",
            checksum="def456",
        )


def test_schema_version_rejects_none_definition() -> None:
    """SchemaVersion with definition=None should raise icontract.ViolationError."""
    with pytest.raises(icontract.ViolationError, match="valid JSON"):
        SchemaVersion(
            subject_id=1,
            version=1,
            schema_type=SchemaType.JSON,
            definition=None,
            fingerprint="abc123",
            checksum="def456",
        )


def test_schema_version_accepts_valid_data() -> None:
    """SchemaVersion with valid data should be created successfully."""
    sv = SchemaVersion(
        subject_id=1,
        version=1,
        schema_type=SchemaType.JSON,
        definition={"type": "object", "properties": {}},
        fingerprint="abc123",
        checksum="def456",
    )
    assert sv.version == 1
    assert sv.schema_type == SchemaType.JSON


# ---------------------------------------------------------------------------
# Hypothesis property-based tests
# ---------------------------------------------------------------------------


@given(name=st.text(min_size=1, max_size=200))
@settings(max_examples=50)
def test_subject_name_preserved(name: str) -> None:
    """Any non-empty name should be preserved after Subject construction."""
    subject = Subject(name=name, compatibility_mode=CompatibilityMode.NONE)
    assert subject.name == name


@given(version=st.integers(min_value=1, max_value=10000))
@settings(max_examples=50)
def test_schema_version_positive_version_accepted(version: int) -> None:
    """Any positive integer version should be accepted."""
    sv = SchemaVersion(
        subject_id=1,
        version=version,
        schema_type=SchemaType.AVRO,
        definition={"type": "string"},
        fingerprint="fp",
        checksum="cs",
    )
    assert sv.version == version


@given(
    compat=st.sampled_from(list(CompatibilityMode)),
    schema_type=st.sampled_from(list(SchemaType)),
)
@settings(max_examples=20)
def test_enum_values_accepted(compat: CompatibilityMode, schema_type: SchemaType) -> None:
    """All enum values should be accepted by the models."""
    subject = Subject(name="test", compatibility_mode=compat)
    assert subject.compatibility_mode == compat

    sv = SchemaVersion(
        subject_id=1,
        version=1,
        schema_type=schema_type,
        definition={"type": "string"},
        fingerprint="fp",
        checksum="cs",
    )
    assert sv.schema_type == schema_type
