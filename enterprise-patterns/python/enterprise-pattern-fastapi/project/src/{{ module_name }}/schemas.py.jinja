"""Pydantic schemas with Design by Contract support."""

import icontract
from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base schema for all Pydantic models in this service.

    Provides shared configuration and can be extended with common
    serialization logic.
    """

    model_config = ConfigDict(from_attributes=True)


@icontract.invariant(lambda self: len(self.name) > 0, "Name must not be empty")
class ExampleSchema(BaseSchema):
    """Example schema demonstrating icontract @invariant usage.

    The @invariant decorator enforces that the constraint holds whenever
    an instance is created or modified. Replace this with your domain models.
    """

    name: str
    description: str = ""
