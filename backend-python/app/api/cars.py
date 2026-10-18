"""Local cars (call the driver) and Running Car shared rides."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, CurrentUser, DbSession, OptionalUser, is_admin
from app.core.enums import RecordStatus, RideStatus, VehicleType
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.core.storage import save_upload
from app.db.models import LocalCar, Review, Ride, RideWaitlist
from app.db.types import utcnow
from app.schemas.common import Empty, Envelope, PageEnvelope
from app.schemas.requests import (
    LocalCarBody,
    LocalCarUpdateBody,
    NotifyMeBody,
    ReviewBody,
    RideBody,
    RideUpdateBody,
    VerifyBody,
)
from app.schemas.responses import (
    LocalCarDetails,
    LocalCarOut,
    ReviewOut,
    RideOut,
    RideStatus as RideStatusOut,
)
from app.services.privacy import dump, public_review, public_ride

cars_router = APIRouter(prefix="/local-cars", tags=["Local cars"])
rides_router = APIRouter(prefix="/rides", tags=["Running Car"])

RIDE_LOADERS = (
    selectinload(Ride.fromStop),
    selectinload(Ride.toStop),
    selectinload(Ride.route),
    selectinload(Ride.driver),
)


def with_reviews(car: LocalCar, reviews: list) -> dict:
    """LocalCarOut derives availabilityLabel itself; this only attaches reviews."""
    payload = LocalCarOut.model_validate(car).model_dump(by_alias=True)
    # Reviews are public: reviewer names only, not their phone/email.
    payload["reviews"] = [public_review(dump(ReviewOut, r)) for r in reviews]
    return payload


# -------------------------------------------------------------- local cars


@cars_router.get(
    "",
    response_model=PageEnvelope[LocalCarOut],
    summary="Local Cars Near You",
    description="Driver phone numbers are public by design - the app dials them from 'Call Driver'.",
)
def list_cars(
    db: DbSession,
    page: PageDep,
    area: str | None = None,
    verified: bool | None = None,
    minRating: float | None = Query(None, ge=0, le=5),
):
    filters = [LocalCar.status == "ACTIVE"]
    if area:
        filters.append(LocalCar.area.contains(area))
    if verified is not None:
        filters.append(LocalCar.verified.is_(verified))
    if minRating is not None:
        filters.append(LocalCar.ratingAvg >= minRating)
    if page.search:
        filters.append(
            or_(
                LocalCar.driverName.contains(page.search),
                LocalCar.area.contains(page.search),
                LocalCar.carModel.contains(page.search),
            )
        )

    total = db.scalar(select(func.count(LocalCar.id)).where(*filters)) or 0
    cars = list(
        db.scalars(
            select(LocalCar)
            .where(*filters)
            .order_by(LocalCar.verified.desc(), LocalCar.ratingAvg.desc())
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    return {"data": cars, "meta": meta(total, page)}


@cars_router.get("/mine/list", response_model=Envelope[list[LocalCarOut]], summary="My listed cars")
def my_cars(db: DbSession, user: CurrentUser):
    cars = db.scalars(select(LocalCar).where(LocalCar.ownerId == user.id)).all()
    return {"data": list(cars)}


@cars_router.get("/{car_id}", response_model=Envelope[LocalCarDetails], summary="Car with recent reviews")
def get_car(car_id: str, db: DbSession):
    car = db.get(LocalCar, car_id)
    if car is None:
        raise ApiError.not_found("Local car not found")
    reviews = list(
        db.scalars(
            select(Review)
            .where(Review.localCarId == car_id)
            .options(selectinload(Review.user))
            .order_by(Review.createdAt.desc())
            .limit(10)
        )
    )
    return {"data": with_reviews(car, reviews)}


@cars_router.post("", response_model=Envelope[LocalCarOut], status_code=201, summary="List a car")
def create_car(body: LocalCarBody, db: DbSession, user: CurrentUser):
    admin = is_admin(user)
    car = LocalCar(
        **{**body.model_dump(), "status": body.status.value},
        ownerId=user.id,
        verified=admin,
    )
    db.add(car)
    db.commit()
    db.refresh(car)
    return {
        "message": "Local car added" if admin else "Submitted - our team will verify your details",
        "data": car,
    }


@cars_router.patch("/{car_id}", response_model=Envelope[LocalCarOut], summary="Update a listing")
def update_car(car_id: str, body: LocalCarUpdateBody, db: DbSession, user: CurrentUser):
    car = db.get(LocalCar, car_id)
    if car is None:
        raise ApiError.not_found("Local car not found")
    if car.ownerId != user.id and not is_admin(user):
        raise ApiError.forbidden()

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(car, field, value.value if hasattr(value, "value") else value)
    db.commit()
    db.refresh(car)
    return {"message": "Local car updated", "data": car}


@cars_router.post("/{car_id}/photo", response_model=Envelope[LocalCarOut], summary="Upload the car photo")
def upload_photo(car_id: str, db: DbSession, user: CurrentUser, file: Annotated[UploadFile, File()]):
    car = db.get(LocalCar, car_id)
    if car is None:
        raise ApiError.not_found("Local car not found")
    if car.ownerId != user.id and not is_admin(user):
        raise ApiError.forbidden()

    car.photoUrl = save_upload(file, folder="cars")
    db.commit()
    db.refresh(car)
    return {"message": "Photo updated", "data": car}


@cars_router.delete("/{car_id}", response_model=Envelope[Empty], summary="Remove a listing")
def delete_car(car_id: str, db: DbSession, user: CurrentUser):
    car = db.get(LocalCar, car_id)
    if car is None:
        raise ApiError.not_found("Local car not found")
    if car.ownerId != user.id and not is_admin(user):
        raise ApiError.forbidden()
    db.delete(car)
    db.commit()
    return {"message": "Local car removed", "data": None}


@cars_router.patch(
    "/{car_id}/verify", response_model=Envelope[LocalCarOut], summary="Grant or remove the verified badge"
)
def verify_car(car_id: str, body: VerifyBody, db: DbSession, _admin: AdminUser):
    car = db.get(LocalCar, car_id)
    if car is None:
        raise ApiError.not_found("Local car not found")
    car.verified = body.verified
    db.commit()
    db.refresh(car)
    return {
        "message": "Driver verified" if body.verified else "Verification removed",
        "data": car,
    }


@cars_router.post(
    "/{car_id}/reviews", response_model=Envelope[ReviewOut], status_code=201, summary="Rate a driver"
)
def review_car(car_id: str, body: ReviewBody, db: DbSession, user: CurrentUser):
    car = db.get(LocalCar, car_id)
    if car is None:
        raise ApiError.not_found("Local car not found")

    review = Review(userId=user.id, localCarId=car_id, rating=body.rating, comment=body.comment)
    db.add(review)
    db.flush()

    avg, count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(Review.localCarId == car_id)
    ).one()
    car.ratingAvg = round(float(avg or 0), 2)
    car.ratingCount = int(count or 0)

    db.commit()
    db.refresh(review)
    return {"message": "Thanks for your feedback", "data": review}


# ------------------------------------------------------------------ rides


@rides_router.get(
    "/status",
    response_model=Envelope[RideStatusOut],
    summary="Feature status - drives the 'Coming Soon' card",
    description="COMING_SOON until at least one scheduled ride exists, then LIVE.",
)
def ride_status(db: DbSession):
    active = db.scalar(
        select(func.count(Ride.id)).where(Ride.status.in_(["SCHEDULED", "RUNNING"]))
    ) or 0
    waitlist = db.scalar(select(func.count(RideWaitlist.id))) or 0
    return {
        "data": {
            "feature": "RUNNING_CAR",
            "status": "LIVE" if active > 0 else "COMING_SOON",
            "activeRides": active,
            "waitlistCount": waitlist,
            "tagline": "Book shared rides on your route. Affordable, faster and smarter.",
        }
    }


@rides_router.post(
    "/notify-me",
    response_model=Envelope[dict],
    status_code=201,
    summary="Join the launch waitlist - the 'Notify Me' button",
)
def notify_me(body: NotifyMeBody, db: DbSession, user: OptionalUser):
    entry = db.scalar(select(RideWaitlist).where(RideWaitlist.phone == body.phone))
    if entry is None:
        entry = RideWaitlist(phone=body.phone, area=body.area, userId=user.id if user else None)
        db.add(entry)
    else:
        entry.area = body.area
        entry.userId = user.id if user else entry.userId
    db.commit()
    db.refresh(entry)

    return {
        "message": "We will notify you as soon as Running Car goes live",
        "data": {"id": entry.id, "phone": entry.phone, "area": entry.area},
    }


@rides_router.get("", response_model=PageEnvelope[RideOut], summary="Search shared rides")
def list_rides(
    db: DbSession,
    page: PageDep,
    fromStopId: str | None = None,
    toStopId: str | None = None,
    date: str | None = None,
    vehicleType: VehicleType | None = None,
    status: RideStatus | None = None,
):
    filters = [Ride.status == (status.value if status else "SCHEDULED")]
    if fromStopId:
        filters.append(Ride.fromStopId == fromStopId)
    if toStopId:
        filters.append(Ride.toStopId == toStopId)
    if vehicleType:
        filters.append(Ride.vehicleType == vehicleType.value)

    if date:
        day = datetime.fromisoformat(date)
        filters.append(Ride.departureAt >= day)
        filters.append(Ride.departureAt < day + timedelta(days=1))
    else:
        filters.append(Ride.departureAt >= utcnow())

    total = db.scalar(select(func.count(Ride.id)).where(*filters)) or 0
    rides = list(
        db.scalars(
            select(Ride)
            .where(*filters)
            .options(*RIDE_LOADERS)
            .order_by(Ride.departureAt)
            .offset(page.skip)
            .limit(page.limit)
        ).unique()
    )
    return {"data": [public_ride(dump(RideOut, r)) for r in rides], "meta": meta(total, page)}


@rides_router.get("/{ride_id}", response_model=Envelope[RideOut], summary="Ride details")
def get_ride(ride_id: str, db: DbSession):
    ride = db.scalar(select(Ride).where(Ride.id == ride_id).options(*RIDE_LOADERS))
    if ride is None:
        raise ApiError.not_found("Ride not found")
    return {"data": public_ride(dump(RideOut, ride))}


@rides_router.post("", response_model=Envelope[RideOut], status_code=201, summary="Publish a ride")
def create_ride(body: RideBody, db: DbSession, user: CurrentUser):
    if body.fromStopId == body.toStopId:
        raise ApiError.bad_request("Pick two different stops")

    ride = Ride(
        fromStopId=body.fromStopId,
        toStopId=body.toStopId,
        routeId=body.routeId,
        driverId=body.driverId or user.id,
        vehicleType=body.vehicleType.value,
        departureAt=datetime.fromisoformat(body.departureAt.replace("Z", "+00:00")).replace(tzinfo=None),
        totalSeats=body.totalSeats,
        availableSeats=body.totalSeats,
        farePerSeat=body.farePerSeat,
    )
    db.add(ride)
    db.commit()
    db.refresh(ride)
    return {"message": "Ride published", "data": ride}


@rides_router.patch("/{ride_id}", response_model=Envelope[RideOut], summary="Update a ride")
def update_ride(ride_id: str, body: RideUpdateBody, db: DbSession, user: CurrentUser):
    ride = db.get(Ride, ride_id)
    if ride is None:
        raise ApiError.not_found("Ride not found")
    if ride.driverId != user.id and not is_admin(user):
        raise ApiError.forbidden("You can only edit your own rides")

    updates = body.model_dump(exclude_unset=True)
    departure = updates.pop("departureAt", None)
    for field, value in updates.items():
        setattr(ride, field, value.value if hasattr(value, "value") else value)
    if departure:
        ride.departureAt = datetime.fromisoformat(departure.replace("Z", "+00:00")).replace(tzinfo=None)

    db.commit()
    db.refresh(ride)
    return {"message": "Ride updated", "data": ride}


@rides_router.delete("/{ride_id}", response_model=Envelope[Empty], summary="Delete a ride (admin)")
def delete_ride(ride_id: str, db: DbSession, _admin: AdminUser):
    ride = db.get(Ride, ride_id)
    if ride is None:
        raise ApiError.not_found("Ride not found")
    db.delete(ride)
    db.commit()
    return {"message": "Ride removed", "data": None}
