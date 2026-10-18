"""Error type and handlers producing the same envelope as the Node backend."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status_code: int, message: str, code: str = "ERROR", details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.details = details

    # Convenience constructors, mirroring utils/apiError.ts
    @staticmethod
    def bad_request(message: str, details: Any = None) -> "ApiError":
        return ApiError(400, message, "BAD_REQUEST", details)

    @staticmethod
    def unauthorized(message: str = "Authentication required") -> "ApiError":
        return ApiError(401, message, "UNAUTHORIZED")

    @staticmethod
    def forbidden(message: str = "You do not have permission to perform this action") -> "ApiError":
        return ApiError(403, message, "FORBIDDEN")

    @staticmethod
    def not_found(message: str = "Resource not found") -> "ApiError":
        return ApiError(404, message, "NOT_FOUND")

    @staticmethod
    def conflict(message: str) -> "ApiError":
        return ApiError(409, message, "CONFLICT")

    @staticmethod
    def too_many(message: str = "Too many requests, please try again later") -> "ApiError":
        return ApiError(429, message, "TOO_MANY_REQUESTS")


def _payload(message: str, code: str, details: Any = None) -> dict[str, Any]:
    body: dict[str, Any] = {"success": False, "message": message, "code": code}
    if details:
        body["details"] = details
    return body


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=_payload(exc.message, exc.code, exc.details)
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                # Drop the "body"/"query" prefix so the field reads like the client sent it.
                "field": ".".join(str(p) for p in error["loc"][1:]) or str(error["loc"][0]),
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=400, content=_payload("Validation failed", "BAD_REQUEST", details)
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(_request: Request, exc: IntegrityError) -> JSONResponse:
        text = str(exc.orig)
        if "UNIQUE constraint failed" in text or "duplicate key" in text:
            field = text.split(":")[-1].strip() if ":" in text else "field"
            return JSONResponse(
                status_code=409,
                content=_payload(f"A record with this {field} already exists", "DUPLICATE"),
            )
        if "FOREIGN KEY constraint failed" in text:
            return JSONResponse(
                status_code=400,
                content=_payload("Referenced record does not exist", "INVALID_REFERENCE"),
            )
        return JSONResponse(status_code=400, content=_payload("Could not save the record", "DB_ERROR"))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {
            status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
            status.HTTP_403_FORBIDDEN: "FORBIDDEN",
            status.HTTP_404_NOT_FOUND: "NOT_FOUND",
            status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
            status.HTTP_429_TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
        }
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(str(exc.detail), codes.get(exc.status_code, "ERROR")),
        )
