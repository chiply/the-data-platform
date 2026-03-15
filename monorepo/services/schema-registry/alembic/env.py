"""Alembic environment configuration for async migrations.

Uses pg_advisory_lock to ensure safe concurrent migration execution
(e.g., when a K8s Job is retried or multiple replicas start simultaneously).
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from schema_registry.config import Settings

# Alembic Config object
config = context.config

# Set up logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so Alembic can detect them for autogenerate
from schema_registry.models import *  # noqa: F401, F403

# Set target metadata for autogenerate support
from tdp_db import Base

target_metadata = Base.metadata

# Override sqlalchemy.url from application settings
settings = Settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

# Advisory lock ID — arbitrary but fixed integer to prevent concurrent migrations.
# Using a hash of "tdp-schema-registry-migration" for uniqueness.
MIGRATION_LOCK_ID = 737_007_001


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Configures the context with just a URL and not an Engine.
    Calls to context.execute() emit the given string to the script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with pg_advisory_lock for safe concurrent execution."""
    # Acquire an advisory lock to prevent concurrent migration runs.
    # pg_advisory_lock blocks until the lock is available (session-level lock,
    # automatically released when the connection closes).
    connection.execute(text(f"SELECT pg_advisory_lock({MIGRATION_LOCK_ID})"))

    try:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    finally:
        connection.execute(text(f"SELECT pg_advisory_unlock({MIGRATION_LOCK_ID})"))


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode using async engine.

    Uses NullPool to avoid connection pool issues during migrations.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.begin() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
