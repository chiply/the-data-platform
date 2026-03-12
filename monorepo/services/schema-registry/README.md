# schema-registry

Centralized schema registry for the data platform

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
uvicorn src.schema_registry.main:app --reload --port 8000

# Run tests
pytest tests/
```

## Post-Generation Checklist

- [ ] Run `pip-compile requirements.in` to generate pinned `requirements.txt`
- [ ] Set up Helm chart at `deploy/charts/schema-registry/`
- [ ] Register component in `release-please-config.json` (if not already present)
- [ ] Build base image: `docker build -f monorepo/services/Dockerfile.base -t tdp-python-base monorepo/services/`
- [ ] Run `bazel run //:gazelle` to update BUILD files

## Endpoints

- `GET /health` — Health check
- `GET /version` — Service version
- `GET /schemas` — List all registered schemas
- `GET /schemas/{name}` — Get a specific schema by name
