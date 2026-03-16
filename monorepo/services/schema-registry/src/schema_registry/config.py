"""Application configuration via pydantic-settings.

Supports two modes of DATABASE_URL configuration:
1. Direct: set DATABASE_URL environment variable
2. Assembled: set individual DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
   fields and the URL is assembled automatically. This is the pattern used
   in dev/production where K8s secrets provide individual fields.
"""

from enum import Enum
from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Deployment environment."""

    LOCAL = "LOCAL"
    STAGING = "STAGING"
    PRODUCTION = "PRODUCTION"

    @property
    def is_deployed(self) -> bool:
        """Return True if this is a deployed (non-local) environment."""
        return self in {Environment.STAGING, Environment.PRODUCTION}


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file.

    Environment variables take precedence over .env file values.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    service_name: str = "schema-registry"
    service_version: str = "0.1.0"
    environment: Environment = Environment.LOCAL
    service_port: int = 8000
    log_level: str = "INFO"

    # Database configuration — individual fields (from K8s secretKeyRef)
    db_host: str | None = None
    db_port: str | None = None
    db_name: str | None = None
    db_user: str | None = None
    db_password: str | None = None
    db_sslmode: str | None = None

    # Assembled database URL — either set directly or assembled from individual fields
    database_url: str = "postgresql+asyncpg://localhost:5432/schema_registry"

    @model_validator(mode="after")
    def assemble_database_url(self) -> "Settings":
        """Assemble database_url from individual DB_* fields when present.

        If all required individual fields (host, port, name, user, password)
        are provided, the database_url is assembled from them. This allows
        K8s secret injection via individual env vars while keeping
        database_url as the single field consumed by SQLAlchemy.
        """
        if all([self.db_host, self.db_port, self.db_name, self.db_user, self.db_password]):
            user = quote_plus(self.db_user)  # type: ignore[arg-type]
            password = quote_plus(self.db_password)  # type: ignore[arg-type]
            # asyncpg uses 'ssl' parameter (not libpq's 'sslmode')
            sslmode_param = f"?ssl={self.db_sslmode}" if self.db_sslmode else ""
            self.database_url = (
                f"postgresql+asyncpg://{user}:{password}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}{sslmode_param}"
            )
        return self
