"""Application configuration using pydantic-settings.

Settings are loaded from environment variables with .env file support.
"""

from enum import Enum
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Deployment environment."""

    LOCAL = "local"
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"

    @property
    def is_deployed(self) -> bool:
        return self in (self.DEVELOPMENT, self.STAGING, self.PRODUCTION)


class Settings(BaseSettings):
    """Application settings with environment variable precedence.

    Env var names match field names (case-insensitive). Use a .env file for
    local development.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Service identity
    SERVICE_NAME: str = "schema-registry"
    SERVICE_VERSION: str = "0.1.0"
    SERVICE_PORT: int = 8000

    # Environment
    ENVIRONMENT: Environment = Environment.LOCAL

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://localhost:5432/schema_registry"

    # Logging
    LOG_LEVEL: str = "INFO"

    # OpenTelemetry
    OTLP_ENDPOINT: str = "http://localhost:4317"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()


settings = get_settings()
