"""Clock-time and calendar helpers (port of src/utils/time.ts)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.core.enums import DAY_ORDER


def to_minutes(hhmm: str) -> int:
    """"07:30" -> 450 minutes since midnight."""
    hours, _, minutes = hhmm.partition(":")
    return int(hours) * 60 + int(minutes or 0)


def to_hhmm(minutes: int) -> str:
    wrapped = minutes % 1440
    return f"{wrapped // 60:02d}:{wrapped % 60:02d}"


def to_12h(hhmm: str) -> str:
    """"07:30" -> "07:30 AM" (display field carried in API responses)."""
    hours, _, minutes = hhmm.partition(":")
    h = int(hours)
    suffix = "PM" if h >= 12 else "AM"
    hour12 = 12 if h % 12 == 0 else h % 12
    return f"{hour12:02d}:{int(minutes or 0):02d} {suffix}"


def duration_minutes(start_hhmm: str, end_hhmm: str) -> int:
    """Difference in minutes, accounting for journeys that cross midnight."""
    start, end = to_minutes(start_hhmm), to_minutes(end_hhmm)
    return end - start if end >= start else 1440 - start + end


def format_duration(minutes: int) -> str:
    """75 -> "1h 15m"."""
    hours, mins = divmod(minutes, 60)
    if hours == 0:
        return f"{mins}m"
    if mins == 0:
        return f"{hours}h"
    return f"{hours}h {mins}m"


def start_of_day(value: date | datetime | str) -> datetime:
    """Normalise to midnight UTC so date-only columns compare exactly."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return datetime(value.year, value.month, value.day)
    return datetime(value.year, value.month, value.day)


def today_utc() -> datetime:
    return start_of_day(datetime.now(timezone.utc).replace(tzinfo=None))


def add_days(value: datetime, days: int) -> datetime:
    return value + timedelta(days=days)


def day_code(value: datetime) -> str:
    """Monday-first day code, e.g. "FRI"."""
    return DAY_ORDER[value.weekday()]


def parse_service_days(csv: str) -> list[str]:
    return [d.strip().upper() for d in csv.split(",") if d.strip().upper() in DAY_ORDER]


def runs_on_day(service_days_csv: str, value: datetime) -> bool:
    return day_code(value) in parse_service_days(service_days_csv)


def minutes_until(hhmm: str, now: datetime | None = None) -> int | None:
    """Minutes from now until that clock time today; None once it has passed."""
    now = now or datetime.now()
    now_minutes = now.hour * 60 + now.minute
    target = to_minutes(hhmm)
    return target - now_minutes if target >= now_minutes else None


def iso_z(value: datetime | None) -> str | None:
    """Serialise like the Node service: 2026-05-24T07:30:00.000Z."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def date_only(value: datetime | None) -> str | None:
    return value.strftime("%Y-%m-%d") if value else None
