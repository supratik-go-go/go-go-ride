"""Dashboard statistics and the Reports & Analytics figures."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.timeutils import add_days, start_of_day, today_utc
from app.db.models import Booking, Bus, BusStop, Route, User


@dataclass
class Range:
    start: datetime
    end: datetime  # exclusive


def resolve_range(from_: str | None, to: str | None) -> Range:
    end_day = start_of_day(to) if to else today_utc()
    start = start_of_day(from_) if from_ else add_days(end_day, -7)
    # `to` is inclusive, so push the boundary to the end of that day.
    return Range(start=start, end=add_days(end_day, 1))


def trend(current: int, previous: int) -> float:
    if previous == 0:
        return 0.0 if current == 0 else 100.0
    return round(((current - previous) / previous) * 100, 1)


def _count(db: Session, model, start: datetime | None = None, end: datetime | None = None) -> int:
    stmt = select(func.count(model.id))
    if start is not None:
        stmt = stmt.where(model.createdAt >= start, model.createdAt < end)
    return db.scalar(stmt) or 0


def dashboard_stats(db: Session, window: Range) -> dict:
    span = window.end - window.start
    prev = Range(start=window.start - span, end=window.start)

    total_buses = _count(db, Bus)
    pending = (
        db.scalar(select(func.count(Bus.id)).where(Bus.status.in_(["PENDING", "UNDER_REVIEW"]))) or 0
    )
    total_routes = _count(db, Route)
    total_users = _count(db, User)

    buses_now = _count(db, Bus, window.start, window.end)
    buses_prev = _count(db, Bus, prev.start, prev.end)
    users_now = _count(db, User, window.start, window.end)
    users_prev = _count(db, User, prev.start, prev.end)
    routes_now = _count(db, Route, window.start, window.end)
    routes_prev = _count(db, Route, prev.start, prev.end)
    bookings_now = _count(db, Booking, window.start, window.end)
    bookings_prev = _count(db, Booking, prev.start, prev.end)

    status_rows = db.execute(select(Bus.status, func.count(Bus.id)).group_by(Bus.status)).all()
    breakdown = [
        {
            "status": status,
            "count": count,
            "percentage": 0.0 if total_buses == 0 else round(count / total_buses * 100, 1),
        }
        for status, count in status_rows
    ]

    return {
        "cards": {
            "totalBuses": {"value": total_buses, "trend": trend(buses_now, buses_prev)},
            "pendingApprovals": {"value": pending},
            "totalRoutes": {"value": total_routes, "trend": trend(routes_now, routes_prev)},
            "totalUsers": {"value": total_users, "trend": trend(users_now, users_prev)},
        },
        "busStatusOverview": {"total": total_buses, "breakdown": breakdown},
        "busesAdded": {"value": buses_now, "trend": trend(buses_now, buses_prev)},
        "bookingsOverview": {"value": bookings_now, "trend": trend(bookings_now, bookings_prev)},
    }


def daily_series(db: Session, window: Range) -> list[dict]:
    """Per-day counts behind the dashboard line charts."""
    buses = db.scalars(
        select(Bus).where(Bus.createdAt >= window.start, Bus.createdAt < window.end)
    ).all()
    bookings = db.scalars(
        select(Booking).where(Booking.createdAt >= window.start, Booking.createdAt < window.end)
    ).all()

    days: list[str] = []
    cursor = window.start
    while cursor < window.end:
        days.append(cursor.strftime("%Y-%m-%d"))
        cursor = add_days(cursor, 1)

    bus_map: dict[str, int] = {}
    for bus in buses:
        key = bus.createdAt.strftime("%Y-%m-%d")
        bus_map[key] = bus_map.get(key, 0) + 1

    booking_map: dict[str, int] = {}
    revenue_map: dict[str, float] = {}
    for booking in bookings:
        key = booking.createdAt.strftime("%Y-%m-%d")
        booking_map[key] = booking_map.get(key, 0) + 1
        if booking.status != "CANCELLED":
            revenue_map[key] = revenue_map.get(key, 0.0) + booking.amount

    return [
        {
            "date": day,
            "buses": bus_map.get(day, 0),
            "bookings": booking_map.get(day, 0),
            "revenue": round(revenue_map.get(day, 0.0), 2),
        }
        for day in days
    ]


def report_summary(db: Session, window: Range) -> dict:
    """Revenue, trips, occupancy, distance and the payment-mode split."""
    bookings = db.scalars(
        select(Booking)
        .where(Booking.createdAt >= window.start, Booking.createdAt < window.end)
        .options(selectinload(Booking.bus).selectinload(Bus.route))
    ).all()

    completed = [b for b in bookings if b.status != "CANCELLED"]
    total_revenue = sum(b.amount for b in completed)
    seats_booked = sum(b.seats for b in completed)
    total_distance = sum(
        (b.bus.route.distanceKm if b.bus and b.bus.route else 0) * b.seats for b in completed
    )
    capacity = sum((b.bus.totalSeats if b.bus else 0) for b in completed)
    occupancy = 0.0 if capacity == 0 else round(seats_booked / capacity * 100, 1)

    by_mode: dict[str, float] = {}
    for booking in completed:
        by_mode[booking.paymentMode] = by_mode.get(booking.paymentMode, 0.0) + booking.amount

    payment_split = [
        {
            "mode": mode,
            "amount": round(amount, 2),
            "percentage": 0.0 if total_revenue == 0 else round(amount / total_revenue * 100, 1),
        }
        for mode, amount in by_mode.items()
    ]

    status_counts: dict[str, int] = {}
    for booking in bookings:
        status_counts[booking.status] = status_counts.get(booking.status, 0) + 1

    return {
        "range": {
            "from": window.start.strftime("%Y-%m-%d"),
            "to": add_days(window.end, -1).strftime("%Y-%m-%d"),
        },
        "totalRevenue": round(total_revenue, 2),
        "totalTrips": len(completed),
        "totalBookings": len(bookings),
        "avgOccupancy": occupancy,
        "totalDistanceKm": round(total_distance, 1),
        "paymentSplit": payment_split,
        "statusCounts": status_counts,
    }


def top_routes(db: Session, window: Range, limit: int = 5) -> list[dict]:
    """The "Top Routes by Bookings" panel."""
    bookings = db.scalars(
        select(Booking)
        .where(
            Booking.createdAt >= window.start,
            Booking.createdAt < window.end,
            Booking.busId.is_not(None),
        )
        .options(selectinload(Booking.bus).selectinload(Bus.route))
    ).all()

    tally: dict[str, dict] = {}
    for booking in bookings:
        route = booking.bus.route if booking.bus else None
        if route is None:
            continue
        entry = tally.setdefault(
            route.id,
            {"routeId": route.id, "name": route.name, "routeNumber": route.routeNumber, "bookings": 0},
        )
        entry["bookings"] += booking.seats

    return sorted(tally.values(), key=lambda r: r["bookings"], reverse=True)[:limit]


def platform_counters(db: Session) -> dict:
    """Homepage counters: buses, routes, stops, users."""
    return {
        "buses": db.scalar(select(func.count(Bus.id)).where(Bus.status == "APPROVED")) or 0,
        "routes": db.scalar(select(func.count(Route.id)).where(Route.status == "ACTIVE")) or 0,
        "stops": db.scalar(select(func.count(BusStop.id)).where(BusStop.status == "ACTIVE")) or 0,
        "users": db.scalar(select(func.count(User.id))) or 0,
    }
