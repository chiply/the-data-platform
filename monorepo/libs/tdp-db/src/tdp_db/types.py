"""Common column type annotations for platform models.

These Annotated types reduce boilerplate and ensure consistency across
services. Use them as type hints in Mapped[] columns:

    class MyModel(Base):
        id: Mapped[intpk]
        name: Mapped[str_255]
        body: Mapped[text]
"""

from typing import Annotated

from sqlalchemy import String, Text
from sqlalchemy.orm import mapped_column

# Auto-incrementing integer primary key.
intpk = Annotated[int, mapped_column(primary_key=True, autoincrement=True)]

# Variable-length string capped at 255 characters (common for names, slugs).
str_255 = Annotated[str, mapped_column(String(255))]

# Unlimited-length text column.
text = Annotated[str, mapped_column(Text)]
