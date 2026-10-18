"""Bus search, details and owner submission.

Port of src/modules/buses/bus.service.ts. The search is the heart of the
product: it returns each bus timed for the requested stop pair, and keeps the
buses that do NOT run on the chosen date in the result so the app can render
the "Not Running" card rather than silently hiding them.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.enums import SearchType
from app.core.errors import ApiError
from app.core.timeutils import (
    duration_minutes,
    format_duration,
    minutes_until,
    runs_on_day,
    start_of_day,
    to_12h,
    today_utc,
)
from app.db.models import Bus, BusException, BusStop, BusStopage, Review

BUS_LOADERS = (
    selectinload(Bus.owner),
    selectinload(Bus.route),
    selectinload(Bus.stopages).selectinload(BusStopage.stop),
    selectinload(Bus.documents),
)


@dataclass
class Leg:
    """The portion of a timetable between two stops."""

    from_stop: BusStop
    to_stop: BusStop
    departure_time: str
    arrival_time: str
    duration: int


def find_leg(stopages: list[BusStopage], from_stop_id: str | None, to_stop_id: str | None) -> Leg | None:
    """None when the bus does not serve that pair in that direction."""
    if not stopages:
        return None

    origin = next((s for s in stopages if s.stopId == from_stop_id), None) if from_stop_id else stopages[0]
    destination = next((s for s in stopages if s.stopId == to_stop_id), None) if to_stop_id else stopages[-1]

    if origin is None or destination is None:
        return None
    if origin.sequence >= destination.sequence:  # wrong direction
        return None

    return Leg(
        from_stop=origin.stop,
        to_stop=destination.stop,
        departure_time=origin.departureTime,
        arrival_time=destination.arrivalTime,
        duration=duration_minutes(origin.departureTime, destination.arrivalTime),
    )


def resolve_stop_id_by_name(db: Session, name: str | None) -> str | None:
    if not name:
        return None
    stop = db.scalar(select(BusStop).where(BusStop.name.contains(name)).order_by(BusStop.name))
    return stop.id if stop else None


def resolve_stop_id(db: Session, *, stop_id: str | None, stop_name: str | None) -> str:
    """Find an existing stop by name, or create it - owners type new stopages."""
    if stop_id:
        stop = db.get(BusStop, stop_id)
        if stop is None:
            raise ApiError.bad_request(f"Bus stop {stop_id} does not exist")
        return stop.id

    name = (stop_name or "").strip()
    existing = db.scalar(select(BusStop).where(BusStop.name == name))
    if existing:
        return existing.id

    created = BusStop(name=name)
    db.add(created)
    db.flush()
    return created.id


def search_buses(
    db: Session,
    *,
    from_text: str | None = None,
    to_text: str | None = None,
    from_stop_id: str | None = None,
    to_stop_id: str | None = None,
    q: str | None = None,
    search_type: SearchType = SearchType.ROUTE,
    date: str | None = None,
    time: str | None = None,
    bus_type: str | None = None,
    category: str | None = None,
    max_fare: float | None = None,
    sort: str = "departure",
    include_not_running: bool = True,
) -> dict:
    travel_date = start_of_day(date) if date else today_utc()
    is_today = travel_date == today_utc()

    from_id = from_stop_id or resolve_stop_id_by_name(db, from_text)
    to_id = to_stop_id or resolve_stop_id_by_name(db, to_text)

    if search_type == SearchType.ROUTE:
        if (from_text or from_stop_id) and not from_id:
            raise ApiError.not_found(f'No bus stop found matching "{from_text}"')
        if (to_text or to_stop_id) and not to_id:
            raise ApiError.not_found(f'No bus stop found matching "{to_text}"')

    stmt = select(Bus).where(Bus.status == "APPROVED").options(*BUS_LOADERS)
    if bus_type:
        stmt = stmt.where(Bus.type == bus_type)
    if category:
        stmt = stmt.where(Bus.category == category)
    if max_fare is not None:
        stmt = stmt.where(Bus.fare <= max_fare)

    if search_type == SearchType.BUS_NUMBER and q:
        stmt = stmt.where(Bus.busNumber.contains(q.upper()))
    elif search_type == SearchType.BUS_NAME and q:
        stmt = stmt.where(Bus.busName.contains(q))
    elif from_id and to_id:
        stmt = stmt.where(
            Bus.stopages.any(BusStopage.stopId == from_id),
            Bus.stopages.any(BusStopage.stopId == to_id),
        )
    elif from_id:
        stmt = stmt.where(Bus.stopages.any(BusStopage.stopId == from_id))

    buses = list(db.scalars(stmt).unique())

    # One query for the exceptions falling on the travel date.
    excepted: dict[str, BusException] = {}
    if buses:
        rows = db.scalars(
            select(BusException).where(
                BusException.busId.in_([b.id for b in buses]), BusException.date == travel_date
            )
        ).all()
        excepted = {row.busId: row for row in rows}

    results: list[dict] = []
    for bus in buses:
        stopages = bus.stopages
        leg = find_leg(stopages, from_id, to_id)
        if leg is None and search_type == SearchType.ROUTE and from_id and to_id:
            continue

        scheduled = runs_on_day(bus.serviceDays, travel_date)
        exception = excepted.get(bus.id)
        is_running = scheduled and exception is None

        departure = leg.departure_time if leg else (stopages[0].departureTime if stopages else "00:00")
        arrival = leg.arrival_time if leg else (stopages[-1].arrivalTime if stopages else "00:00")
        duration = leg.duration if leg else duration_minutes(departure, arrival)

        if not scheduled:
            reason = "This bus does not operate on this day of the week"
        elif exception is not None:
            reason = exception.reason or "The owner has reported no service on this date"
        else:
            reason = None

        start_name = stopages[0].stop.name if stopages else ""
        end_name = stopages[-1].stop.name if stopages else ""

        results.append(
            {
                "id": bus.id,
                "busNumber": bus.busNumber,
                "busName": bus.busName,
                "routeName": bus.route.name if bus.route else f"{start_name} - {end_name}",
                "routeNumber": bus.route.routeNumber if bus.route else None,
                "type": bus.type,
                "category": bus.category,
                "operator": bus.operator,
                "fare": bus.fare,
                "totalSeats": bus.totalSeats,
                "rating": {"average": bus.ratingAvg, "count": bus.ratingCount},
                "from": leg.from_stop if leg else None,
                "to": leg.to_stop if leg else None,
                "departureTime": departure,
                "departureTime12h": to_12h(departure),
                "arrivalTime": arrival,
                "arrivalTime12h": to_12h(arrival),
                "durationMinutes": duration,
                "durationLabel": format_duration(duration),
                "isRunning": is_running,
                "notRunningReason": reason,
                # "Next: 07:30 AM" chip - only meaningful for today.
                "nextDepartureInMinutes": minutes_until(departure) if is_today and is_running else None,
            }
        )

    if not include_not_running:
        results = [r for r in results if r["isRunning"]]
    if time:
        results = [r for r in results if r["departureTime"] >= time]

    sorters = {
        "departure": lambda r: r["departureTime"],
        "fare": lambda r: r["fare"],
        "duration": lambda r: r["durationMinutes"],
        "rating": lambda r: -r["rating"]["average"],
    }
    results.sort(key=sorters.get(sort, sorters["departure"]))
    # Running buses always come before the "Not Running" cards.
    results.sort(key=lambda r: not r["isRunning"])

    return {
        "date": travel_date.strftime("%Y-%m-%d"),
        "from": {"id": from_id, "name": from_text} if from_id else None,
        "to": {"id": to_id, "name": to_text} if to_id else None,
        "total": len(results),
        "buses": results,
    }


def timetable_rows(bus: Bus) -> list[dict]:
    first_seq = bus.stopages[0].sequence if bus.stopages else None
    last_seq = bus.stopages[-1].sequence if bus.stopages else None
    return [
        {
            "id": s.id,
            "sequence": s.sequence,
            "stop": s.stop,
            "arrivalTime": s.arrivalTime,
            "arrivalTime12h": to_12h(s.arrivalTime),
            "departureTime": s.departureTime,
            "departureTime12h": to_12h(s.departureTime),
            "distanceKm": s.distanceKm,
            "isStart": s.sequence == first_seq,
            "isEnd": s.sequence == last_seq,
        }
        for s in bus.stopages
    ]


def bus_details(db: Session, bus_id: str, date: str | None = None) -> dict:
    bus = db.scalar(
        select(Bus)
        .where(Bus.id == bus_id)
        .options(*BUS_LOADERS, selectinload(Bus.reviews).selectinload(Review.user))
    )
    if bus is None:
        raise ApiError.not_found("Bus not found")

    travel_date = start_of_day(date) if date else today_utc()
    upcoming = list(
        db.scalars(
            select(BusException)
            .where(BusException.busId == bus.id, BusException.date >= today_utc())
            .order_by(BusException.date)
        )
    )
    exception = next((e for e in upcoming if e.date == travel_date), None)
    scheduled = runs_on_day(bus.serviceDays, travel_date)

    first = bus.stopages[0] if bus.stopages else None
    last = bus.stopages[-1] if bus.stopages else None
    duration = duration_minutes(first.departureTime, last.arrivalTime) if first and last else 0

    if not scheduled:
        reason = "This bus does not operate on this day of the week"
    elif exception is not None:
        reason = exception.reason or "The owner has reported no service on this date"
    else:
        reason = None

    payload = {c: getattr(bus, c) for c in (
        "id", "busNumber", "busName", "ownerId", "routeId", "type", "category", "operator",
        "totalSeats", "fare", "contactNumber", "contactStart", "contactEnd", "serviceDays",
        "status", "rejectionReason", "ratingAvg", "ratingCount", "imageUrl", "submittedAt",
        "reviewedAt", "reviewedById", "createdAt", "updatedAt",
    )}
    payload.update(
        {
            "owner": bus.owner,
            "route": bus.route,
            "stopages": timetable_rows(bus),
            "documents": bus.documents,
            "timetable": timetable_rows(bus),
            "journey": {
                "departureTime": first.departureTime if first else None,
                "arrivalTime": last.arrivalTime if last else None,
                "durationMinutes": duration,
                "durationLabel": format_duration(duration),
                "totalDistanceKm": last.distanceKm if last else 0,
            },
            "availability": {
                "date": travel_date.strftime("%Y-%m-%d"),
                "isRunning": scheduled and exception is None,
                "reason": reason,
            },
            "exceptions": upcoming,
            "reviews": sorted(bus.reviews, key=lambda r: r.createdAt, reverse=True)[:10],
        }
    )
    return payload


def replace_stopages(db: Session, bus: Bus, stopages: list) -> None:
    """Rewrites a bus timetable in order."""
    stop_ids = [
        resolve_stop_id(db, stop_id=s.stopId, stop_name=s.stopName) for s in stopages
    ]
    bus.stopages.clear()
    db.flush()
    for index, (stopage, stop_id) in enumerate(zip(stopages, stop_ids), start=1):
        db.add(
            BusStopage(
                busId=bus.id,
                stopId=stop_id,
                sequence=index,
                arrivalTime=stopage.arrivalTime,
                departureTime=stopage.departureTime,
                distanceKm=stopage.distanceKm,
            )
        )


def add_exception(db: Session, bus_id: str, *, date: str, reason: str | None, enforce_notice: bool) -> BusException:
    """Owners must give the configured notice; admins may override it."""
    day = start_of_day(date)
    days_ahead = (day - today_utc()).days

    if days_ahead < 0:
        raise ApiError.bad_request("Pick a future date")
    if enforce_notice and days_ahead < settings.bus_exception_min_days:
        raise ApiError.bad_request(
            f"Non-operating dates must be reported at least "
            f"{settings.bus_exception_min_days} days in advance"
        )

    existing = db.scalar(
        select(BusException).where(BusException.busId == bus_id, BusException.date == day)
    )
    if existing:
        existing.reason = reason
        db.commit()
        db.refresh(existing)
        return existing

    exception = BusException(busId=bus_id, date=day, reason=reason)
    db.add(exception)
    db.commit()
    db.refresh(exception)
    return exception


def recompute_rating(db: Session, bus: Bus) -> None:
    avg, count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(Review.busId == bus.id)
    ).one()
    bus.ratingAvg = round(float(avg or 0), 2)
    bus.ratingCount = int(count or 0)


def assert_ownership(db: Session, bus_id: str, user_id: str) -> Bus:
    bus = db.get(Bus, bus_id)
    if bus is None:
        raise ApiError.not_found("Bus not found")
    if bus.ownerId != user_id:
        raise ApiError.forbidden("You can only manage your own buses")
    return bus


def search_filter(term: str):
    """Free-text filter shared by the bus list endpoints."""
    return or_(
        Bus.busNumber.contains(term.upper()),
        Bus.busName.contains(term),
        Bus.operator.contains(term),
    )


def as_naive(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=None) if value and value.tzinfo else value
