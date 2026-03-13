# Schema Registry service Dockerfile
#
# Build context: monorepo/ (parent directory)
# This allows the Dockerfile to access libs/ for editable installs.
#
# Build:   docker build -f services/schema-registry/Dockerfile .
# (from monorepo/ directory)

# ---------------------------------------------------------------------------
# Stage 1 — builder
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy the shared library first (needed for dependency resolution)
COPY libs/tdp-fastapi-core/ /app/libs/tdp-fastapi-core/

# Copy service dependency files
COPY services/schema-registry/pyproject.toml services/schema-registry/uv.lock /app/services/schema-registry/

# Install dependencies (non-editable for production)
WORKDIR /app/services/schema-registry
RUN uv sync --frozen --no-dev --no-editable

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=builder /app/services/schema-registry/.venv /app/services/schema-registry/.venv
ENV PATH="/app/services/schema-registry/.venv/bin:$PATH"

RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid app --create-home app

WORKDIR /app/services/schema-registry

RUN chown app:app /app/services/schema-registry

# Copy application source and supporting files
COPY services/schema-registry/src/ /app/services/schema-registry/src/
COPY services/schema-registry/logging_config.py /app/services/schema-registry/logging_config.py
COPY services/schema-registry/entrypoint.sh /app/services/schema-registry/entrypoint.sh
COPY services/schema-registry/gunicorn_conf.py /app/services/schema-registry/gunicorn_conf.py

RUN chmod +x /app/services/schema-registry/entrypoint.sh

USER app

EXPOSE 8000

CMD ["/app/services/schema-registry/entrypoint.sh"]
