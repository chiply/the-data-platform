"""Shared SQLAlchemy base library for The Data Platform.

Provides a consistent DeclarativeBase, naming conventions, timestamp mixin,
and common column types used by all services.
"""

from tdp_db.base import Base
from tdp_db.mixins import TimestampMixin
from tdp_db.types import intpk, str_255, text

__all__ = [
    "Base",
    "TimestampMixin",
    "intpk",
    "str_255",
    "text",
]
