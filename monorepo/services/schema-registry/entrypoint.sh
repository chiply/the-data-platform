#!/bin/sh
set -e

# Use Gunicorn with Uvicorn workers for production deployments.
# exec replaces the shell process so SIGTERM reaches Gunicorn directly,
# enabling graceful shutdown in Kubernetes rolling deployments.
exec gunicorn schema_registry.main:app \
    --config gunicorn_conf.py
