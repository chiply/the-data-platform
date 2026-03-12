"""Schema Registry — stub service for GitOps pipeline validation."""

from fastapi import FastAPI

APP_VERSION = "0.1.0"

app = FastAPI(title="Schema Registry", version=APP_VERSION)


@app.get("/health", summary="Health check", description="Returns the current health status of the schema registry service.")
async def health():
    return {"status": "healthy", "message": "hot reload works!"}


@app.get("/version", summary="Service version", description="Returns the service name and current version.")
async def version():
    return {"service": "schema-registry", "version": APP_VERSION}


@app.get("/schemas", summary="List schemas", description="Returns all registered schemas. Results are sorted alphabetically by name.")
async def list_schemas():
    return {"schemas": []}


@app.get("/schemas/{name}", summary="Get schema by name", description="Returns a specific schema by its name, including its version and definition.")
async def get_schema(name: str):
    return {"name": name, "version": "0.0.0", "schema": {}}
