"""Request ID middleware for FastAPI applications."""

from __future__ import annotations

import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware that ensures every request has an ``X-Request-ID`` header.

    If the incoming request already contains the header the value is preserved;
    otherwise a new UUID4 is generated.  The request ID is always set on the
    response as well.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:  # type: ignore[type-arg]
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        # Store on request state so downstream code can access it
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
