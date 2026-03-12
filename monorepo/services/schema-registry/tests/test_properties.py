"""Property-based tests using Hypothesis and icontract invariant tests."""

import icontract
import pytest
from hypothesis import given, settings, strategies as st

from schema_registry.schemas import ExampleSchema


# ---------------------------------------------------------------------------
# Hypothesis property-based tests
# ---------------------------------------------------------------------------

@given(
    name=st.text(min_size=1, max_size=200),
    description=st.text(max_size=500),
)
@settings(max_examples=50)
def test_example_schema_round_trip_property(name: str, description: str) -> None:
    """Any valid ExampleSchema should survive a serialization round-trip."""
    instance = ExampleSchema(name=name, description=description)
    dumped = instance.model_dump()
    restored = ExampleSchema.model_validate(dumped)
    assert restored == instance


@given(name=st.text(min_size=1, max_size=100))
@settings(max_examples=50)
def test_example_schema_name_preserved(name: str) -> None:
    """The name field should be exactly preserved after construction."""
    instance = ExampleSchema(name=name)
    assert instance.name == name


# ---------------------------------------------------------------------------
# icontract invariant violation tests
# ---------------------------------------------------------------------------

@icontract.invariant(
    lambda self: self.value >= 0,
    "Value must be non-negative",
)
class NonNegativeModel:
    """A simple model with an icontract invariant for testing.

    Demonstrates that @invariant raises ViolationError when the
    contract is violated.
    """

    def __init__(self, value: int) -> None:
        self.value = value


def test_invariant_holds_for_valid_value() -> None:
    """A non-negative value should satisfy the invariant."""
    model = NonNegativeModel(value=42)
    assert model.value == 42


def test_invariant_raises_on_violation() -> None:
    """A negative value should raise icontract.ViolationError."""
    with pytest.raises(icontract.ViolationError, match="non-negative"):
        NonNegativeModel(value=-1)


def test_example_schema_invariant_rejects_empty_name() -> None:
    """ExampleSchema's @invariant should reject an empty name."""
    with pytest.raises(icontract.ViolationError, match="Name must not be empty"):
        ExampleSchema(name="", description="test")
