"""Schema Registry — stub service for GitOps pipeline validation."""

from fastapi import FastAPI

APP_VERSION = "0.2.0"

app = FastAPI(title="Schema Registry", version=APP_VERSION)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/version")
async def version():
    return {"service": "schema-registry", "version": APP_VERSION}


@app.get("/schemas")
async def list_schemas():
    return {"schemas": []}


@app.get("/schemas/{name}")
async def get_schema(name: str):
    return {"name": name, "version": "0.0.0", "schema": {}}
