"""Initial schema tables.

Revision ID: 001
Revises:
Create Date: 2026-03-12

Creates the core schema registry tables:
- subject: named contexts for schema registration
- schema_version: versioned schema definitions (JSONB)
- schema_reference: cross-schema dependency tracking
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create initial schema registry tables."""
    # Subject table
    op.create_table(
        "subject",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("compatibility_mode", sa.String(length=30), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "compatibility_mode IN ('BACKWARD', 'BACKWARD_TRANSITIVE', 'FORWARD', "
            "'FORWARD_TRANSITIVE', 'FULL', 'FULL_TRANSITIVE', 'NONE')",
            name="ck_subject_valid_compatibility_mode",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_subject"),
        sa.UniqueConstraint("name", name="uq_subject_name"),
    )
    op.create_index("ix_subject_name", "subject", ["name"])

    # SchemaVersion table
    op.create_table(
        "schema_version",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("schema_type", sa.String(length=20), nullable=False),
        sa.Column("definition", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "schema_type IN ('AVRO', 'PROTOBUF', 'JSON')",
            name="ck_schema_version_valid_schema_type",
        ),
        sa.ForeignKeyConstraint(
            ["subject_id"],
            ["subject.id"],
            name="fk_schema_version_subject_id_subject",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_schema_version"),
        sa.UniqueConstraint(
            "subject_id", "version", name="uq_schema_version_subject_version"
        ),
    )
    op.create_index("ix_schema_version_fingerprint", "schema_version", ["fingerprint"])

    # SchemaReference table
    op.create_table(
        "schema_reference",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("schema_version_id", sa.Integer(), nullable=False),
        sa.Column("referenced_schema_version_id", sa.Integer(), nullable=False),
        sa.Column("reference_name", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(
            ["schema_version_id"],
            ["schema_version.id"],
            name="fk_schema_reference_schema_version_id_schema_version",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["referenced_schema_version_id"],
            ["schema_version.id"],
            name="fk_schema_reference_referenced_schema_version_id_schema_version",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_schema_reference"),
    )


def downgrade() -> None:
    """Drop all schema registry tables."""
    op.drop_table("schema_reference")
    op.drop_index("ix_schema_version_fingerprint", table_name="schema_version")
    op.drop_table("schema_version")
    op.drop_index("ix_subject_name", table_name="subject")
    op.drop_table("subject")
