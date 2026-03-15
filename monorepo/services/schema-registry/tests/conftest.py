"""Shared test fixtures and configuration."""

import os

import pytest
from httpx import ASGITransport, AsyncClient

from schema_registry.config import Settings
from schema_registry.dependencies import get_settings
from schema_registry.main import app
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from schema_registry.dependencies import get_db_session

pytest_plugins: list[str] = []

# Read test DATABASE_URL from env with localhost fallback.
# CI sets this env var; local dev uses the Tiltfile-provisioned CNPG.
_TEST_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://localhost:5432/schema_registry_test",
)


@pytest.fixture()
def settings_override() -> Settings:
    """Return a Settings instance suitable for testing.

    Override this fixture in individual test modules when you need
    non-default configuration values.
    """
    return Settings(
        service_name="schema-registry",
        service_version="0.1.0",
        environment="LOCAL",
        service_port=8000,
        log_level="DEBUG",
        database_url=_TEST_DATABASE_URL,
    )


@pytest.fixture()
async def client(settings_override: Settings) -> AsyncClient:
    """Yield an async HTTP test client wired to the FastAPI app.

    The client uses httpx.AsyncClient with ASGITransport so that requests
    are dispatched in-process without a live server.
    """

    def _override_settings() -> Settings:
        return settings_override

    app.dependency_overrides[get_settings] = _override_settings

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture()
async def db_session(settings_override: Settings) -> AsyncSession:
    """Yield an async database session connected to the test database.

    Uses a nested transaction (SAVEPOINT) so that route handlers can call
    session.commit() without closing the outer transaction. The outer
    transaction is rolled back after each test for isolation.
    """
    engine = create_async_engine(settings_override.database_url, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        nested = await conn.begin_nested()

        @event.listens_for(session.sync_session, "after_transaction_end")
        def restart_savepoint(sync_session, transaction):
            nonlocal nested
            if transaction.nested and not transaction._parent.nested:
                nested = conn.sync_connection.begin_nested()

        yield session

        await session.close()
        await trans.rollback()

    await engine.dispose()


@pytest.fixture()
async def client_with_db(
    settings_override: Settings,
    db_session: AsyncSession,
) -> AsyncClient:
    """Yield a test client with the database session overridden."""

    def _override_settings() -> Settings:
        return settings_override

    async def _override_db_session() -> AsyncSession:
        return db_session

    app.dependency_overrides[get_settings] = _override_settings
    app.dependency_overrides[get_db_session] = _override_db_session

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()
