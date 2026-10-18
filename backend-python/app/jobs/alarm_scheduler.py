"""Fires the bus-arrival reminders set on the Set Alarm screen.

Runs once a minute inside the API process, which is enough for a single
instance. Move this to a dedicated worker before running more than one API
replica, or the same alarm fires several times.
"""
from __future__ import annotations

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.timeutils import to_12h, to_hhmm, to_minutes, today_utc
from app.db.models import Alarm
from app.db.session import SessionLocal
from app.services.common import notify

logger = logging.getLogger("gogoride")


def process_due_alarms(now: datetime | None = None) -> int:
    now = now or datetime.now()
    today = today_utc()
    now_minutes = now.hour * 60 + now.minute
    fired = 0

    with SessionLocal() as db:
        alarms = db.scalars(
            select(Alarm)
            .where(Alarm.status == "ACTIVE", Alarm.alarmDate == today)
            .options(selectinload(Alarm.bus), selectinload(Alarm.boardingStop))
        ).all()

        for alarm in alarms:
            notify_minutes = to_minutes(alarm.expectedArrival) - alarm.remindBeforeMin
            # Fire within a one-minute window so a late tick still delivers.
            if not (notify_minutes <= now_minutes <= notify_minutes + 1):
                continue

            when = (
                "is arriving now"
                if alarm.remindBeforeMin == 0
                else f"arrives in {alarm.remindBeforeMin} minutes"
            )
            notify(
                db,
                user_id=alarm.userId,
                title=f"Bus {alarm.bus.busNumber} {when}",
                message=(
                    f"{alarm.bus.busNumber} reaches {alarm.boardingStop.name} "
                    f"at {to_12h(alarm.expectedArrival)}."
                ),
                type="ALARM",
                link=f"/buses/{alarm.busId}",
                commit=False,
            )
            alarm.status = "TRIGGERED"
            alarm.notifiedAt = now
            fired += 1

        # Retire yesterday's leftovers so "My Alarms" stays clean.
        for stale in db.scalars(
            select(Alarm).where(Alarm.status == "ACTIVE", Alarm.alarmDate < today)
        ):
            stale.status = "EXPIRED"

        db.commit()

    return fired


def notify_time_of(expected_arrival: str, remind_before_min: int) -> str:
    """What time would this alarm fire? (exposed for tests)"""
    return to_hhmm(to_minutes(expected_arrival) - remind_before_min)


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _tick, "interval", minutes=1, id="alarm-scheduler", max_instances=1, coalesce=True
    )
    scheduler.start()
    logger.info("[alarms] scheduler started")
    return scheduler


def _tick() -> None:
    try:
        process_due_alarms()
    except Exception:  # pragma: no cover - a bad tick must not kill the scheduler
        logger.exception("[alarms] tick failed")
