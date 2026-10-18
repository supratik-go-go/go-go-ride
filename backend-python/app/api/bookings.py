"""Bus, ride and local car bookings."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, CurrentUser, DbSession, is_admin
from app.core.enums import BookingStatus, BookingType
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.core.security import random_ref
from app.core.timeutils import start_of_day, today_utc
from app.db.models import Booking, Bus, BusException, LocalCar, Ride
from app.schemas.common import Envelope, PageEnvelope
from app.schemas.requests import BookingCreateBody, BookingStatusBody, CancelBody
from app.schemas.responses import BookingOut
from app.services.common import notify

router = APIRouter(prefix="/bookings", tags=["Bookings"])

BOOKING_LOADERS = (
    selectinload(Booking.user),
    selectinload(Booking.bus).selectinload(Bus.route),
    selectinload(Booking.ride).selectinload(Ride.fromStop),
    selectinload(Booking.ride).selectinload(Ride.toStop),
    selectinload(Booking.localCar),
)


@router.get(
    "", response_model=PageEnvelope[BookingOut], summary="My Bookings (admins see every booking)"
)
def list_bookings(
    db: DbSession,
    user: CurrentUser,
    page: PageDep,
    status: BookingStatus | None = None,
    type: BookingType | None = None,
    from_: Annotated[str | None, Query(alias="from", description="Travel date lower bound")] = None,
    to: Annotated[str | None, Query(description="Travel date upper bound")] = None,
    userId: Annotated[str | None, Query(description="Admin only")] = None,
):
    admin = is_admin(user)
    filters = []
    if admin:
        if userId:
            filters.append(Booking.userId == userId)
    else:
        filters.append(Booking.userId == user.id)

    if status:
        filters.append(Booking.status == status.value)
    if type:
        filters.append(Booking.type == type.value)
    if from_:
        filters.append(Booking.travelDate >= start_of_day(from_))
    if to:
        filters.append(Booking.travelDate <= start_of_day(to))

    total = db.scalar(select(func.count(Booking.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Booking)
            .where(*filters)
            .options(*BOOKING_LOADERS)
            .order_by(Booking.createdAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        ).unique()
    )
    return {"data": items, "meta": meta(total, page)}


@router.get("/{booking_id}", response_model=Envelope[BookingOut], summary="Booking details")
def get_booking(booking_id: str, db: DbSession, user: CurrentUser):
    booking = db.scalar(
        select(Booking).where(Booking.id == booking_id).options(*BOOKING_LOADERS)
    )
    if booking is None:
        raise ApiError.not_found("Booking not found")
    if booking.userId != user.id and not is_admin(user):
        raise ApiError.forbidden()
    return {"data": booking}


@router.post(
    "",
    response_model=Envelope[BookingOut],
    status_code=201,
    summary="Book a bus seat, a shared ride, or a local car",
    description="Bus bookings re-check non-operating dates; ride bookings decrement seats.",
)
def create_booking(body: BookingCreateBody, db: DbSession, user: CurrentUser):
    travel_date = start_of_day(body.travelDate)
    if travel_date < today_utc():
        raise ApiError.bad_request("Pick a future date")

    amount = 0.0

    if body.type == BookingType.BUS:
        bus = db.get(Bus, body.busId)
        if bus is None:
            raise ApiError.not_found("Bus not found")
        if bus.status != "APPROVED":
            raise ApiError.bad_request("This bus is not active")
        if db.scalar(
            select(BusException).where(
                BusException.busId == bus.id, BusException.date == travel_date
            )
        ):
            raise ApiError.bad_request("This bus is not running on the selected date")
        amount = bus.fare * body.seats

    elif body.type == BookingType.RIDE:
        ride = db.get(Ride, body.rideId)
        if ride is None:
            raise ApiError.not_found("Ride not found")
        if ride.status != "SCHEDULED":
            raise ApiError.bad_request("This ride is no longer open")
        if ride.availableSeats < body.seats:
            raise ApiError.bad_request(f"Only {ride.availableSeats} seats left on this ride")
        amount = ride.farePerSeat * body.seats
        ride.availableSeats -= body.seats

    else:
        car = db.get(LocalCar, body.localCarId)
        if car is None:
            raise ApiError.not_found("Local car not found")
        if car.status != "ACTIVE":
            raise ApiError.bad_request("This driver is not available")
        # Local cars are settled directly with the driver; fare agreed offline.

    booking = Booking(
        bookingRef=random_ref("GGR"),
        userId=user.id,
        type=body.type.value,
        busId=body.busId,
        rideId=body.rideId,
        localCarId=body.localCarId,
        travelDate=travel_date,
        seats=body.seats,
        amount=amount,
        paymentMode=body.paymentMode.value,
        paymentStatus="PENDING" if body.paymentMode.value == "CASH" else "PAID",
        status="CONFIRMED",
    )
    db.add(booking)
    db.flush()

    notify(
        db,
        user_id=user.id,
        title="Booking confirmed",
        message=f"Your booking {booking.bookingRef} for {body.travelDate} is confirmed.",
        type="USER",
        link=f"/bookings/{booking.id}",
        commit=False,
    )
    db.commit()
    db.refresh(booking)

    return {"message": "Booking confirmed", "data": booking}


@router.patch(
    "/{booking_id}/cancel",
    response_model=Envelope[BookingOut],
    summary="Cancel a booking",
    description="Releases ride seats and marks a paid booking REFUNDED.",
)
def cancel_booking(booking_id: str, body: CancelBody, db: DbSession, user: CurrentUser):
    booking = db.scalar(select(Booking).where(Booking.id == booking_id).options(*BOOKING_LOADERS))
    if booking is None:
        raise ApiError.not_found("Booking not found")
    if booking.userId != user.id and not is_admin(user):
        raise ApiError.forbidden()
    if booking.status == "CANCELLED":
        raise ApiError.bad_request("This booking is already cancelled")
    if booking.status == "COMPLETED":
        raise ApiError.bad_request("A completed trip cannot be cancelled")

    if booking.rideId:
        ride = db.get(Ride, booking.rideId)
        if ride is not None:
            ride.availableSeats += booking.seats

    booking.status = "CANCELLED"
    booking.cancelReason = body.reason
    if booking.paymentStatus == "PAID":
        booking.paymentStatus = "REFUNDED"

    db.commit()
    db.refresh(booking)
    return {"message": "Booking cancelled", "data": booking}


@router.patch(
    "/{booking_id}/status", response_model=Envelope[BookingOut], summary="Change booking state (admin)"
)
def update_status(booking_id: str, body: BookingStatusBody, db: DbSession, _admin: AdminUser):
    booking = db.scalar(select(Booking).where(Booking.id == booking_id).options(*BOOKING_LOADERS))
    if booking is None:
        raise ApiError.not_found("Booking not found")

    booking.status = body.status.value
    if body.paymentStatus:
        booking.paymentStatus = body.paymentStatus.value

    db.commit()
    db.refresh(booking)
    return {"message": "Booking updated", "data": booking}
