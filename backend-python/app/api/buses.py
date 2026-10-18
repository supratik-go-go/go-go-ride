"""Search, details, owner submission and verification documents."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession, OptionalUser, OwnerUser, is_admin
from app.core.enums import BusCategory, BusStatus, BusType, DocType, SearchType
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.core.storage import save_upload
from app.db.models import Alarm, Bus, BusDocument, BusException, RecentSearch, Review
from app.db.types import utcnow
from app.schemas.common import Empty, Envelope, PageEnvelope
from app.schemas.requests import (
    BusCreateBody,
    BusExceptionBody,
    BusUpdateBody,
    ReviewBody,
)
from app.schemas.responses import (
    BusDetails,
    BusExceptionOut,
    BusDocumentOut,
    BusOut,
    BusSearchResponse,
    ReviewOut,
)
from app.services import buses as bus_service
from app.services.common import log_activity, notify

router = APIRouter(prefix="/buses", tags=["Buses"])


@router.get(
    "/search",
    response_model=Envelope[BusSearchResponse],
    summary="Search buses - the Search Results screen",
    description=(
        "Returns each bus timed for the requested stop pair. Buses that do not run on the "
        "chosen date are **included** with `isRunning: false` and a reason, so the app can "
        "show the 'Not Running' card instead of hiding them. Direction-aware: the boarding "
        "stop must precede the arrival stop in the timetable."
    ),
)
def search(
    db: DbSession,
    user: OptionalUser,
    from_: Annotated[str | None, Query(alias="from", description="Boarding stop name")] = None,
    to: Annotated[str | None, Query(description="Arrival stop name")] = None,
    fromStopId: str | None = None,
    toStopId: str | None = None,
    q: Annotated[str | None, Query(description="Bus number or name")] = None,
    searchType: SearchType = SearchType.ROUTE,
    date: Annotated[str | None, Query(description="YYYY-MM-DD, defaults to today")] = None,
    time: Annotated[str | None, Query(description="Earliest departure, HH:mm")] = None,
    type: BusType | None = None,
    category: BusCategory | None = None,
    maxFare: float | None = None,
    sort: Annotated[str, Query(pattern="^(departure|fare|duration|rating)$")] = "departure",
    includeNotRunning: bool = True,
):
    result = bus_service.search_buses(
        db,
        from_text=from_,
        to_text=to,
        from_stop_id=fromStopId,
        to_stop_id=toStopId,
        q=q,
        search_type=searchType,
        date=date,
        time=time,
        bus_type=type.value if type else None,
        category=category.value if category else None,
        max_fare=maxFare,
        sort=sort,
        include_not_running=includeNotRunning,
    )

    if user is not None:
        db.add(
            RecentSearch(
                userId=user.id,
                searchType=searchType.value,
                fromText=from_,
                toText=to,
                query=q,
            )
        )
        db.commit()

    return {"message": f"{result['total']} buses found", "data": result}


@router.get("", response_model=PageEnvelope[BusOut], summary="List buses")
def list_buses(
    db: DbSession,
    user: OptionalUser,
    page: PageDep,
    status: BusStatus | None = None,
    type: BusType | None = None,
    category: BusCategory | None = None,
    routeId: str | None = None,
    ownerId: str | None = None,
):
    stmt = select(Bus).options(*bus_service.BUS_LOADERS)
    count_stmt = select(func.count(Bus.id))

    filters = []
    # Passengers only ever see approved buses.
    effective_status = status.value if status else None
    if not is_admin(user):
        effective_status = "APPROVED"
    if effective_status:
        filters.append(Bus.status == effective_status)
    if type:
        filters.append(Bus.type == type.value)
    if category:
        filters.append(Bus.category == category.value)
    if routeId:
        filters.append(Bus.routeId == routeId)
    if ownerId:
        filters.append(Bus.ownerId == ownerId)
    if page.search:
        filters.append(bus_service.search_filter(page.search))

    if filters:
        stmt = stmt.where(*filters)
        count_stmt = count_stmt.where(*filters)

    total = db.scalar(count_stmt) or 0
    items = list(
        db.scalars(stmt.order_by(Bus.createdAt.desc()).offset(page.skip).limit(page.limit)).unique()
    )
    return {"data": items, "meta": meta(total, page)}


@router.get("/mine/list", response_model=PageEnvelope[BusOut], summary="The signed-in owner's buses")
def my_buses(
    db: DbSession,
    user: CurrentUser,
    page: PageDep,
):
    filters = [Bus.ownerId == user.id]
    total = db.scalar(select(func.count(Bus.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Bus)
            .where(*filters)
            .options(*bus_service.BUS_LOADERS)
            .order_by(Bus.createdAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        ).unique()
    )
    return {"data": items, "meta": meta(total, page)}


@router.get("/{bus_id}", response_model=Envelope[BusDetails], summary="Bus details")
def get_bus(bus_id: str, db: DbSession, date: str | None = None):
    return {"data": bus_service.bus_details(db, bus_id, date)}


@router.post(
    "",
    response_model=Envelope[BusOut],
    status_code=201,
    summary="Submit a bus for verification - the Add Bus form",
    description="Bus owners only. Created as PENDING and invisible to passengers until approved.",
)
def create_bus(body: BusCreateBody, db: DbSession, user: OwnerUser):
    if db.scalar(select(Bus).where(Bus.busNumber == body.busNumber)):
        raise ApiError.conflict("This bus number is already registered")

    stop_ids = [
        bus_service.resolve_stop_id(db, stop_id=s.stopId, stop_name=s.stopName) for s in body.stopages
    ]

    bus = Bus(
        busNumber=body.busNumber,
        busName=body.busName,
        ownerId=user.id,
        routeId=body.routeId,
        type=body.type.value,
        category=body.category.value,
        operator=body.operator,
        totalSeats=body.totalSeats,
        fare=body.fare,
        contactNumber=body.contactNumber,
        contactStart=body.contactStart,
        contactEnd=body.contactEnd,
        serviceDays=body.service_days_csv,
        status="PENDING",
    )
    db.add(bus)
    db.flush()

    from app.db.models import BusStopage

    for index, (stopage, stop_id) in enumerate(zip(body.stopages, stop_ids), start=1):
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

    log_activity(
        db,
        actor_id=user.id,
        action="BUS_SUBMITTED",
        entity_type="BUS",
        entity_id=bus.id,
        message=f"New bus request from {user.name} ({bus.busNumber})",
        commit=False,
    )
    db.commit()
    db.refresh(bus)

    return {
        "message": "Bus submitted for verification. You will be notified once it is approved.",
        "data": bus,
    }


@router.patch("/{bus_id}", response_model=Envelope[BusOut], summary="Update a bus")
def update_bus(bus_id: str, body: BusUpdateBody, db: DbSession, user: CurrentUser):
    admin = is_admin(user)
    bus = db.get(Bus, bus_id) if admin else bus_service.assert_ownership(db, bus_id, user.id)
    if bus is None:
        raise ApiError.not_found("Bus not found")

    data = body.model_dump(exclude_unset=True, exclude={"stopages", "serviceDays"})
    for field, value in data.items():
        setattr(bus, field, value.value if hasattr(value, "value") else value)

    if body.serviceDays is not None:
        bus.serviceDays = ",".join(dict.fromkeys(d.value for d in body.serviceDays))
    if body.stopages is not None:
        bus_service.replace_stopages(db, bus, body.stopages)

    # An owner editing an approved bus sends it back through verification.
    if not admin and bus.status == "APPROVED":
        bus.status = "UNDER_REVIEW"
        bus.reviewedAt = None
        bus.reviewedById = None

    db.commit()
    db.refresh(bus)
    return {"message": "Bus updated", "data": bus}


@router.delete("/{bus_id}", response_model=Envelope[Empty], summary="Delete a bus")
def delete_bus(bus_id: str, db: DbSession, user: CurrentUser):
    bus = db.get(Bus, bus_id) if is_admin(user) else bus_service.assert_ownership(db, bus_id, user.id)
    if bus is None:
        raise ApiError.not_found("Bus not found")
    db.delete(bus)
    db.commit()
    return {"message": "Bus removed", "data": None}


@router.post(
    "/{bus_id}/documents",
    response_model=Envelope[BusDocumentOut],
    status_code=201,
    summary="Upload ownership proof (RC book, permit, insurance)",
)
def upload_document(
    bus_id: str,
    db: DbSession,
    user: CurrentUser,
    docType: Annotated[DocType, Form()],
    file: Annotated[UploadFile, File()],
):
    if not is_admin(user):
        bus_service.assert_ownership(db, bus_id, user.id)
    elif db.get(Bus, bus_id) is None:
        raise ApiError.not_found("Bus not found")

    url = save_upload(file, folder="documents")
    document = BusDocument(
        busId=bus_id, docType=docType.value, fileUrl=url, originalName=file.filename
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return {"message": "Document uploaded", "data": document}


@router.post(
    "/{bus_id}/exceptions",
    response_model=Envelope[BusExceptionOut],
    status_code=201,
    summary="Declare a date this bus will not run",
)
def add_exception(bus_id: str, body: BusExceptionBody, db: DbSession, user: CurrentUser):
    admin = is_admin(user)
    if not admin:
        bus_service.assert_ownership(db, bus_id, user.id)
    elif db.get(Bus, bus_id) is None:
        raise ApiError.not_found("Bus not found")

    exception = bus_service.add_exception(
        db, bus_id, date=body.date, reason=body.reason, enforce_notice=not admin
    )

    # Warn everyone holding an alarm for that bus on that date.
    alarms = db.scalars(
        select(Alarm)
        .where(Alarm.busId == bus_id, Alarm.alarmDate == exception.date, Alarm.status == "ACTIVE")
        .options(selectinload(Alarm.bus))
    ).all()
    for alarm in alarms:
        notify(
            db,
            user_id=alarm.userId,
            title="Bus not running",
            message=(
                f"{alarm.bus.busNumber} will not operate on "
                f"{exception.date.strftime('%Y-%m-%d')}. Please plan an alternative."
            ),
            type="ALARM",
            commit=False,
        )
    db.commit()

    return {"message": "Non-operating date recorded", "data": exception}


@router.delete(
    "/{bus_id}/exceptions/{exception_id}",
    response_model=Envelope[Empty],
    summary="Remove a non-operating date",
)
def remove_exception(bus_id: str, exception_id: str, db: DbSession, user: CurrentUser):
    if not is_admin(user):
        bus_service.assert_ownership(db, bus_id, user.id)
    exception = db.scalar(
        select(BusException).where(BusException.id == exception_id, BusException.busId == bus_id)
    )
    if exception is not None:
        db.delete(exception)
        db.commit()
    return {"message": "Non-operating date removed", "data": None}


@router.get("/{bus_id}/reviews", response_model=PageEnvelope[ReviewOut], summary="Reviews for a bus")
def list_reviews(
    bus_id: str,
    db: DbSession,
    page: PageDep,
):
    total = db.scalar(select(func.count(Review.id)).where(Review.busId == bus_id)) or 0
    items = list(
        db.scalars(
            select(Review)
            .where(Review.busId == bus_id)
            .options(selectinload(Review.user))
            .order_by(Review.createdAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    return {"data": items, "meta": meta(total, page)}


@router.post(
    "/{bus_id}/reviews",
    response_model=Envelope[ReviewOut],
    status_code=201,
    summary="Rate a bus (upsert - recomputes the average)",
)
def add_review(bus_id: str, body: ReviewBody, db: DbSession, user: CurrentUser):
    bus = db.get(Bus, bus_id)
    if bus is None:
        raise ApiError.not_found("Bus not found")

    review = db.scalar(select(Review).where(Review.userId == user.id, Review.busId == bus_id))
    if review is None:
        review = Review(userId=user.id, busId=bus_id, rating=body.rating, comment=body.comment)
        db.add(review)
    else:
        review.rating = body.rating
        review.comment = body.comment
    db.flush()

    bus_service.recompute_rating(db, bus)
    db.commit()
    db.refresh(review)

    return {"message": "Thanks for rating this bus", "data": review}
