"""Shared Pydantic pieces.

Field names are camelCase to match the JSON contract the Node service already
serves (and that the app, website and admin panel consume).
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer, StringConstraints, field_validator

from app.core.timeutils import iso_z

# Serialise datetimes exactly like the Node service: 2026-05-24T07:30:00.000Z
UtcDateTime = Annotated[datetime, PlainSerializer(iso_z, return_type=str, when_used="json")]

HHMM = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
DateOnly = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

_PHONE_RE = re.compile(r"^(\+91)?[6-9]\d{9}$")


class Schema(BaseModel):
    """Base for response models read straight off SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)


class Body(BaseModel):
    """Base for request bodies: unknown keys are rejected, strings trimmed."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


def normalise_phone(value: str) -> str:
    """Accept +91/spaces/dashes, store 10 digits."""
    cleaned = re.sub(r"[\s-]", "", value or "")
    if not _PHONE_RE.match(cleaned):
        raise ValueError("Enter a valid 10-digit mobile number")
    return cleaned[3:] if cleaned.startswith("+91") else cleaned


Phone = Annotated[str, PlainSerializer(lambda v: v, return_type=str)]


class PhoneMixin(BaseModel):
    @field_validator("phone", mode="before", check_fields=False)
    @classmethod
    def _phone(cls, value: Any) -> Any:
        return normalise_phone(value) if isinstance(value, str) else value


# --------------------------------------------------------------- envelopes
# Declared as response_model on the routes so /docs shows the real payload
# shape, while the wire format stays { success, message, data[, meta] }.

T = TypeVar("T")


class PageMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class Envelope(BaseModel, Generic[T]):
    success: bool = True
    message: str = "Success"
    data: T | None = None


class PageEnvelope(BaseModel, Generic[T]):
    success: bool = True
    message: str = "Success"
    data: list[T] = []
    meta: PageMeta


class NotificationPageMeta(PageMeta):
    unread: int = 0


class NotificationPageEnvelope(BaseModel, Generic[T]):
    success: bool = True
    message: str = "Success"
    data: list[T] = []
    meta: NotificationPageMeta


class Empty(BaseModel):
    """Body of a success response that carries no payload."""
