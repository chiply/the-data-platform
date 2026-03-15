#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Migration execution strategy
# ---------------------------------------------------------------------------
# Local: run migrations on entrypoint (single replica, no race condition).
# Dev/Production: migrations run via K8s Job (pre-upgrade hook), so the
# entrypoint skips them. Controlled by RUN_MIGRATIONS_ON_START env var.
#
# The Alembic env.py uses pg_advisory_lock for safety even if multiple
# instances attempt to migrate concurrently.
# ---------------------------------------------------------------------------

RUN_MIGRATIONS_ON_START="${RUN_MIGRATIONS_ON_START:-true}"

if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
    echo "Running Alembic migrations..."
    alembic upgrade head
    echo "Migrations complete."
fi

# Use Gunicorn with Uvicorn workers for production deployments.
# exec replaces the shell process so SIGTERM reaches Gunicorn directly,
# enabling graceful shutdown in Kubernetes rolling deployments.
exec gunicorn schema_registry.main:app \
    --config gunicorn_conf.py
