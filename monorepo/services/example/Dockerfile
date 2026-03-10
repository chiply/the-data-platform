# Example service Dockerfile — demonstrates how to extend the base image.
#
# Build (from monorepo/ root):
#   docker build -f services/Dockerfile.base -t tdp-python-base services/
#   docker build -f services/example/Dockerfile -t tdp-example-service services/example/
#
# Run locally:
#   docker run -p 8000:8000 tdp-example-service
#
# Push to k3d local registry:
#   docker tag tdp-example-service k3d-tdp-local-registry:5111/tdp-example-service
#   docker push k3d-tdp-local-registry:5111/tdp-example-service
#
# Or import directly into the k3d cluster:
#   k3d image import tdp-example-service -c tdp-local

# ---------------------------------------------------------------------------
# Stage 1 — install service-specific dependencies
# ---------------------------------------------------------------------------
FROM tdp-python-base AS base

USER root

# Install service-specific Python packages
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# ---------------------------------------------------------------------------
# Stage 2 — copy application code
# ---------------------------------------------------------------------------
COPY main.py /app/main.py

USER app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
