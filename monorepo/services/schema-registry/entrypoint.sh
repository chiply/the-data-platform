#!/bin/sh
set -e

# Use exec to replace the shell process so that signals (e.g. SIGTERM from
# Kubernetes) reach the application directly.
exec uvicorn src.schema_registry.main:app --host 0.0.0.0 --port 8000
