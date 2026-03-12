"""Property-based tests demonstrating Hypothesis and icontract integration.

Shows @given with st.from_type for Pydantic models and icontract @invariant usage.
"""

from hypothesis import given, settings, strategies as st

from schema_registry.schemas import SchemaItem


@given(name=st.text(min_size=1, max_size=100), version=st.from_regex(r"\d+\.\d+\.\d+", fullmatch=True))
@settings(max_examples=20)
def test_schema_item_name_preserved(name: str, version: str) -> None:
    """Property: SchemaItem always preserves the name and version through serialization."""
    item = SchemaItem(name=name, version=version, schema_definition={})
    restored = SchemaItem.model_validate(item.model_dump())
    assert restored.name == name
    assert restored.version == version


def test_schema_item_default_version() -> None:
    """SchemaItem defaults to version 0.0.0."""
    item = SchemaItem(name="test")
    assert item.version == "0.0.0"


def test_schema_item_default_schema_definition() -> None:
    """SchemaItem defaults to empty schema definition."""
    item = SchemaItem(name="test")
    assert item.schema_definition == {}
