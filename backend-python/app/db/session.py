"""SQLAlchemy engine and session handling."""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _resolve_sqlite_url(url: str) -> str:
    """Make a relative sqlite path absolute, relative to this project root."""
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return url
    raw = url[len(prefix) :]
    path = Path(raw)
    if not path.is_absolute():
        path = (Path(__file__).resolve().parents[2] / raw).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
    return f"{prefix}{path.as_posix()}"


DATABASE_URL = _resolve_sqlite_url(settings.database_url)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    # SQLite only: allow the connection to be used by FastAPI's threadpool.
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
)

if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        # Deliberately NOT setting journal_mode: it is persisted in the file
        # header, and this database is shared with the Node service.
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
