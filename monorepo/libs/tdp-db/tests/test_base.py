"""Tests for the shared SQLAlchemy base library."""

from datetime import datetime

from sqlalchemy import inspect
from sqlalchemy.orm import Mapped, mapped_column

from tdp_db import Base, TimestampMixin, intpk, str_255, text


class SampleModel(TimestampMixin, Base):
    """A sample model used to test base class and mixin behavior."""

    __tablename__ = "sample"

    id: Mapped[intpk]
    name: Mapped[str_255]
    body: Mapped[text]


def test_naming_convention_applied() -> None:
    """Base.metadata should have the platform naming convention."""
    nc = Base.metadata.naming_convention
    assert "ix" in nc
    assert "uq" in nc
    assert "fk" in nc
    assert "pk" in nc
    assert "ck" in nc


def test_sample_model_has_expected_columns() -> None:
    """SampleModel should have id, name, body, created_at, updated_at."""
    mapper = inspect(SampleModel)
    column_names = {col.key for col in mapper.columns}
    assert column_names == {"id", "name", "body", "created_at", "updated_at"}


def test_timestamp_mixin_column_types() -> None:
    """TimestampMixin columns should be datetime with server defaults."""
    mapper = inspect(SampleModel)
    created_col = mapper.columns["created_at"]
    updated_col = mapper.columns["updated_at"]
    assert created_col.type.python_type is datetime
    assert updated_col.type.python_type is datetime
    assert created_col.server_default is not None
    assert updated_col.server_default is not None


def test_intpk_is_primary_key() -> None:
    """intpk annotated column should be a primary key."""
    mapper = inspect(SampleModel)
    pk_cols = [col.key for col in mapper.primary_key]
    assert pk_cols == ["id"]


def test_str_255_max_length() -> None:
    """str_255 annotated column should have length 255."""
    mapper = inspect(SampleModel)
    name_col = mapper.columns["name"]
    assert name_col.type.length == 255
