# Services

Each subdirectory is a deployable unit — a FastAPI service, gRPC service, Temporal worker, etc. One directory per service, each with its own BUILD targets.

## Container Images

All service images extend the shared base image defined in `Dockerfile.base`. The base image is a multi-stage build that produces a slim Python 3.12 runtime with a pre-built virtualenv and a non-root `app` user.

### Building Images

Run all commands from the `monorepo/` directory.

```bash
# 1. Build the base image (required once, or when Dockerfile.base changes)
docker build -f services/Dockerfile.base -t tdp-python-base services/

# 2. Build a service image (example)
docker build -f services/example/Dockerfile -t tdp-example-service services/example/
```

### Loading Images into the k3d Local Registry

Option A — push to the k3d registry:

```bash
docker tag tdp-example-service k3d-tdp-local-registry:5111/tdp-example-service
docker push k3d-tdp-local-registry:5111/tdp-example-service
```

Option B — import directly into the cluster:

```bash
k3d image import tdp-example-service -c tdp-local
```

### Creating a New Service

1. Create a new directory under `services/` (e.g., `services/my-service/`).
2. Add a `Dockerfile` that starts with `FROM tdp-python-base AS base`.
3. Add a `requirements.txt` with service-specific dependencies.
4. Add application code (e.g., `main.py`).
5. Build and push as shown above.
