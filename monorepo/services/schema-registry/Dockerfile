# Build context: monorepo/ (run with docker build -f services/schema-registry/Dockerfile .)

# ---------------------------------------------------------------------------
# Stage 1 — builder (install service dependencies into /opt/venv)
# ---------------------------------------------------------------------------
FROM tdp-python-base AS builder

WORKDIR /build

# Copy platform libraries (path must match relative reference in pyproject.toml)
COPY libs/tdp-fastapi-core ./libs/tdp-fastapi-core

# Copy service dependency manifests and install
COPY services/schema-registry/pyproject.toml services/schema-registry/uv.lock ./services/schema-registry/
WORKDIR /build/services/schema-registry
ENV UV_PROJECT_ENVIRONMENT="/opt/venv"
RUN uv sync --frozen --no-dev --no-editable

# ---------------------------------------------------------------------------
# Stage 2 — runtime (slim image with only app code)
# ---------------------------------------------------------------------------
FROM tdp-python-base AS runtime

# Copy the virtualenv with all installed dependencies from builder
COPY --from=builder /opt/venv /opt/venv

WORKDIR /app

# Copy application source and supporting files
COPY services/schema-registry/src/ ./src/
COPY services/schema-registry/logging_config.py ./
COPY services/schema-registry/entrypoint.sh ./
COPY services/schema-registry/gunicorn_conf.py ./

RUN chmod +x ./entrypoint.sh

USER app

EXPOSE 8000

CMD ["./entrypoint.sh"]
