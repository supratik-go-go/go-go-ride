"""Bus arrival reminders - the Set Alarm and My Alarms screens."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.enums import AlarmStatus
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.core.timeutils import runs_on_day, start_of_day, today_utc
from app.db.models import Alarm, Bus, BusException
from app.schemas.common import Empty, Envelope, PageEnvelope
from app.schemas.requests import AlarmCreateBody, AlarmUpdateBody
from app.schemas.responses import AlarmOut
from app.services.buses import BUS_LOADERS
from app.services.privacy import dump, public_bus

router = APIRouter(prefix="/alarms", tags=["Alarms"])

ALARM_LOADERS = (
    selectinload(Alarm.bus),
    selectinload(Alarm.boardingStop),
    selectinload(Alarm.arrivalStop),
)


def _view(alarm: Alarm) -> dict:
    """The passenger's alarm, without the bus owner's personal contact details."""
    data = dump(AlarmOut, alarm)
    data["bus"] = public_bus(data.get("bus"))
    return data


@router.get("", response_model=PageEnvelope[AlarmOut], summary="My Alarms")
def list_alarms(db: DbSession, user: CurrentUser, page: PageDep, status: AlarmStatus | None = None):
    filters = [Alarm.userId == user.id]
    if status:
        filters.append(Alarm.status == status.value)

    total = db.scalar(select(func.count(Alarm.id)).where(*filters)) or 0
    alarms = list(
        db.scalars(
            select(Alarm)
            .where(*filters)
            .options(*ALARM_LOADERS)
            .order_by(Alarm.alarmDate, Alarm.expectedArrival)
            .offset(page.skip)
            .limit(page.limit)
        ).unique()
    )
    return {"data": [_view(a) for a in alarms], "meta": meta(total, page)}


@router.post(
    "",
    response_model=Envelope[AlarmOut],
    status_code=201,
    summary="Set an alarm - the Set Alarm screen",
    description=(
        "The expected arrival time is read from the bus timetable at the boarding stop, so "
        "the client never sends it. Rejected if the bus does not run that day, the stops are "
        "in the wrong order, or an alarm already exists."
    ),
)
def create_alarm(body: AlarmCreateBody, db: DbSession, user: CurrentUser):
    alarm_date = start_of_day(body.date)
    if alarm_date < today_utc():
        raise ApiError.bad_request("Pick today or a future date")

    bus = db.scalar(select(Bus).where(Bus.id == body.busId).options(*BUS_LOADERS))
    if bus is None:
        raise ApiError.not_found("Bus not found")
    if bus.status != "APPROVED":
        raise ApiError.bad_request("This bus is not active yet")

    boarding = next((s for s in bus.stopages if s.stopId == body.boardingStopId), None)
    arrival = next((s for s in bus.stopages if s.stopId == body.arrivalStopId), None)
    if boarding is None:
        raise ApiError.bad_request("This bus does not stop at the boarding stop")
    if arrival is None:
        raise ApiError.bad_request("This bus does not stop at the arrival stop")
    if boarding.sequence >= arrival.sequence:
        raise ApiError.bad_request("The arrival stop must come after the boarding stop")

    if not runs_on_day(bus.serviceDays, alarm_date):
        raise ApiError.bad_request("This bus does not operate on the selected day")
    if db.scalar(
        select(BusException).where(BusException.busId == bus.id, BusException.date == alarm_date)
    ):
        raise ApiError.bad_request("This bus is not running on the selected date")

    if db.scalar(
        select(Alarm).where(
            Alarm.userId == user.id,
            Alarm.busId == bus.id,
            Alarm.alarmDate == alarm_date,
            Alarm.boardingStopId == body.boardingStopId,
            Alarm.status == "ACTIVE",
        )
    ):
        raise ApiError.conflict("You already have an alarm for this bus and date")

    alarm = Alarm(
        userId=user.id,
        busId=bus.id,
        boardingStopId=body.boardingStopId,
        arrivalStopId=body.arrivalStopId,
        alarmDate=alarm_date,
        expectedArrival=boarding.arrivalTime,
        remindBeforeMin=body.remindBeforeMin,
    )
    db.add(alarm)
    db.commit()
    db.refresh(alarm)

    return {
        "message": "Alarm saved. We will remind you before your bus arrives.",
        "data": _view(alarm),
    }


@router.patch("/{alarm_id}", response_model=Envelope[AlarmOut], summary="Change the reminder or cancel")
def update_alarm(alarm_id: str, body: AlarmUpdateBody, db: DbSession, user: CurrentUser):
    alarm = db.scalar(
        select(Alarm).where(Alarm.id == alarm_id, Alarm.userId == user.id).options(*ALARM_LOADERS)
    )
    if alarm is None:
        raise ApiError.not_found("Alarm not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(alarm, field, value)
    db.commit()
    db.refresh(alarm)
    return {"message": "Alarm updated", "data": _view(alarm)}


@router.delete("/{alarm_id}", response_model=Envelope[Empty], summary="Delete an alarm")
def delete_alarm(alarm_id: str, db: DbSession, user: CurrentUser):
    alarm = db.scalar(select(Alarm).where(Alarm.id == alarm_id, Alarm.userId == user.id))
    if alarm is None:
        raise ApiError.not_found("Alarm not found")
    db.delete(alarm)
    db.commit()
    return {"message": "Alarm removed", "data": None}
