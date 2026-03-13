"""Shared SQLAlchemy DeclarativeBase with platform naming conventions.

All services should inherit their ORM models from this Base to ensure
consistent table naming (snake_case), index naming, and constraint naming
across the platform.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Naming conventions for constraints and indexes.
# This ensures Alembic autogenerate produces deterministic, readable names.
# See: https://alembic.sqlalchemy.org/en/latest/naming.html
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Platform-wide SQLAlchemy DeclarativeBase.

    Features:
    - snake_case naming convention for all tables, indexes, constraints
    - Consistent metadata naming convention for Alembic autogenerate
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
