"""Column types that keep this service byte-compatible with the Node backend.

Prisma's SQLite connector declares columns as DATETIME but stores the value as
an INTEGER of milliseconds since the epoch. SQLAlchemy's stock DateTime expects
an ISO-8601 string there, so reading a Prisma-written row would fail or return
nonsense. PrismaDateTime bridges the two, and falls back to the dialect's
native timestamp type on Postgres.

Convention: every datetime inside this application is naive UTC.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime
from sqlalchemy.types import TypeDecorator


def to_naive_utc(value: datetime) -> datetime:
    """Drop the tzinfo after converting to UTC, so all comparisons line up."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PrismaDateTime(TypeDecorator):
    """DATETIME stored as epoch milliseconds on SQLite, native elsewhere."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(BigInteger())
        return dialect.type_descriptor(DateTime())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name != "sqlite":
            return value
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, datetime):
            return to_naive_utc(value)
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc).replace(tzinfo=None)
        if isinstance(value, str):
            return to_naive_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
        return value
