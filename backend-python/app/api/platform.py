"""Health, public counters and public platform settings."""
from __future__ import annotations

import time

from fastapi import APIRouter

from app.core.deps import DbSession
from app.schemas.common import Envelope
from app.schemas.responses import SettingsOut
from app.services.reports import platform_counters

router = APIRouter(tags=["Platform"])

_STARTED_AT = time.time()


@router.get("/health", summary="Liveness probe")
def health():
    from datetime import datetime, timezone

    return {
        "success": True,
        "status": "ok",
        "uptime": round(time.time() - _STARTED_AT, 4),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
        + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z",
    }


@router.get("/stats", response_model=Envelope[dict], summary="Public counters for the homepage")
def stats(db: DbSession):
    return {"data": platform_counters(db)}


@router.get(
    "/settings",
    response_model=Envelope[SettingsOut],
    summary="Public platform settings (website footer, About page)",
)
def public_settings(db: DbSession):
    from app.api.admin import get_settings_row

    return {"data": get_settings_row(db)}
