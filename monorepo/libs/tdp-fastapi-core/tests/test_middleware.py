"""Tests for tdp_fastapi_core.middleware."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from tdp_fastapi_core.middleware import REQUEST_ID_HEADER, RequestIDMiddleware


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)

    @app.get("/echo-request-id")
    async def _echo(request: Request) -> dict[str, str]:
        return {"request_id": request.state.request_id}

    return app


def test_generates_request_id_when_missing() -> None:
    client = TestClient(_make_app())
    resp = client.get("/echo-request-id")
    assert resp.status_code == 200
    body = resp.json()
    # Should be a UUID4 string
    assert len(body["request_id"]) == 36
    assert resp.headers[REQUEST_ID_HEADER] == body["request_id"]


def test_preserves_existing_request_id() -> None:
    client = TestClient(_make_app())
    custom_id = "my-custom-request-id"
    resp = client.get("/echo-request-id", headers={REQUEST_ID_HEADER: custom_id})
    assert resp.status_code == 200
    assert resp.json()["request_id"] == custom_id
    assert resp.headers[REQUEST_ID_HEADER] == custom_id
