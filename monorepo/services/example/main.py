"""Minimal FastAPI example service for The Data Platform."""

from fastapi import FastAPI

app = FastAPI(
    title="TDP Example Service",
    description="A minimal hello-world service demonstrating the platform base image.",
    version="0.1.0",
)


@app.get("/healthz")
async def health() -> dict[str, str]:
    """Liveness / readiness probe endpoint."""
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    """Hello world endpoint."""
    return {"message": "Hello from The Data Platform"}
