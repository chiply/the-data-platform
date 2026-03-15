"""Tests for tdp_fastapi_core.exceptions."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tdp_fastapi_core.exceptions import (
    AppException,
    BadRequest,
    Conflict,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    register_exception_handlers,
)


def _make_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/not-found")
    async def _not_found() -> None:
        raise NotFound(detail="thing missing", error_code="THING_MISSING")

    @app.get("/bad-request")
    async def _bad_request() -> None:
        raise BadRequest()

    @app.get("/permission-denied")
    async def _permission_denied() -> None:
        raise PermissionDenied()

    @app.get("/not-authenticated")
    async def _not_authenticated() -> None:
        raise NotAuthenticated()

    @app.get("/conflict")
    async def _conflict() -> None:
        raise Conflict(detail="already exists", error_code="DUPLICATE")

    @app.get("/generic")
    async def _generic() -> None:
        raise AppException(status_code=503, detail="service unavailable")

    return app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(_make_app())


def test_not_found(client: TestClient) -> None:
    resp = client.get("/not-found")
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"] == "thing missing"
    assert body["error_code"] == "THING_MISSING"


def test_bad_request(client: TestClient) -> None:
    resp = client.get("/bad-request")
    assert resp.status_code == 400


def test_permission_denied(client: TestClient) -> None:
    resp = client.get("/permission-denied")
    assert resp.status_code == 403


def test_not_authenticated(client: TestClient) -> None:
    resp = client.get("/not-authenticated")
    assert resp.status_code == 401


def test_conflict(client: TestClient) -> None:
    resp = client.get("/conflict")
    assert resp.status_code == 409
    body = resp.json()
    assert body["detail"] == "already exists"
    assert body["error_code"] == "DUPLICATE"


def test_generic_app_exception(client: TestClient) -> None:
    resp = client.get("/generic")
    assert resp.status_code == 503
    assert resp.json()["detail"] == "service unavailable"
    assert "error_code" not in resp.json()
