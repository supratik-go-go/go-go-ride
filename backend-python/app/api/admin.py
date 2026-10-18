"""Admin panel: dashboard, approvals, users, reports and settings."""
from __future__ import annotations

import io
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession, SuperAdminUser
from app.core.enums import BusStatus, Role, UserStatus
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.core.security import hash_password
from app.db.models import ActivityLog, Booking, Bus, LoginActivity, RefreshToken, Setting, User
from app.db.types import utcnow
from app.schemas.common import Empty, Envelope, PageEnvelope
from app.schemas.requests import AdminUserCreateBody, AdminUserUpdateBody, BusStatusBody, SettingsBody
from app.schemas.responses import ActivityLogOut, BusOut, SettingsOut, UserOut
from app.services import reports as report_service
from app.services.buses import BUS_LOADERS
from app.services.common import log_activity, notify

router = APIRouter(prefix="/admin", tags=["Admin"])

FromQuery = Annotated[
    str | None, Query(alias="from", description="YYYY-MM-DD, defaults to 7 days ago")
]
ToQuery = Annotated[
    str | None, Query(description="YYYY-MM-DD, inclusive, defaults to today")
]


def get_settings_row(db) -> Setting:
    row = db.get(Setting, "global")
    if row is None:
        row = Setting(id="global")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# ------------------------------------------------------------- dashboard


@router.get("/dashboard", response_model=Envelope[dict], summary="The admin Dashboard screen")
def dashboard(db: DbSession, _admin: AdminUser, from_: FromQuery = None, to: ToQuery = None):
    window = report_service.resolve_range(from_, to)

    pending = list(
        db.scalars(
            select(Bus)
            .where(Bus.status.in_(["PENDING", "UNDER_REVIEW"]))
            .options(*BUS_LOADERS)
            .order_by(Bus.submittedAt.desc())
            .limit(5)
        ).unique()
    )
    activities = list(
        db.scalars(
            select(ActivityLog)
            .options(selectinload(ActivityLog.actor))
            .order_by(ActivityLog.createdAt.desc())
            .limit(8)
        )
    )

    return {
        "data": {
            **report_service.dashboard_stats(db, window),
            "charts": report_service.daily_series(db, window),
            "recentActivities": [
                {
                    "id": a.id,
                    "action": a.action,
                    "message": a.message,
                    "entityType": a.entityType,
                    "entityId": a.entityId,
                    "createdAt": a.createdAt,
                    "actor": {"id": a.actor.id, "name": a.actor.name} if a.actor else None,
                }
                for a in activities
            ],
            "pendingRequests": [BusOut.model_validate(b).model_dump(by_alias=True) for b in pending],
            "topRoutes": report_service.top_routes(db, window),
        }
    }


@router.get("/activities", response_model=PageEnvelope[ActivityLogOut], summary="Full audit log")
def activities(db: DbSession, _admin: AdminUser, page: PageDep):
    total = db.scalar(select(func.count(ActivityLog.id))) or 0
    items = list(
        db.scalars(
            select(ActivityLog)
            .options(selectinload(ActivityLog.actor))
            .order_by(ActivityLog.createdAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    return {"data": items, "meta": meta(total, page)}


# --------------------------------------------------------- bus approvals


@router.get(
    "/bus-requests",
    response_model=PageEnvelope[BusOut],
    summary="Bus Owner Requests queue",
    description="Defaults to PENDING + UNDER_REVIEW, with owner contact, documents and stopages.",
)
def bus_requests(db: DbSession, _admin: AdminUser, page: PageDep, status: BusStatus | None = None):
    filters = [
        Bus.status == status.value if status else Bus.status.in_(["PENDING", "UNDER_REVIEW"])
    ]
    if page.search:
        filters.append(
            or_(
                Bus.busNumber.contains(page.search.upper()),
                Bus.ownerId.in_(select(User.id).where(User.name.contains(page.search))),
            )
        )

    total = db.scalar(select(func.count(Bus.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Bus)
            .where(*filters)
            .options(*BUS_LOADERS)
            .order_by(Bus.submittedAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        ).unique()
    )
    return {"data": items, "meta": meta(total, page)}


@router.patch(
    "/buses/{bus_id}/status",
    response_model=Envelope[BusOut],
    summary="Approve, reject, or move a bus to review",
    description="A rejection requires a reason. The owner is notified and the action is audited.",
)
def set_bus_status(bus_id: str, body: BusStatusBody, db: DbSession, admin: AdminUser):
    status = body.status.value
    if status == "REJECTED" and not body.reason:
        raise ApiError.bad_request("Give the owner a reason for the rejection")

    bus = db.scalar(select(Bus).where(Bus.id == bus_id).options(*BUS_LOADERS))
    if bus is None:
        raise ApiError.not_found("Bus not found")

    bus.status = status
    bus.rejectionReason = body.reason if status == "REJECTED" else None
    bus.reviewedAt = utcnow()
    bus.reviewedById = admin.id

    readable = status.lower().replace("_", " ")
    if status == "APPROVED":
        activity = f"Bus {bus.busNumber} approved"
        title = "Your bus is live"
        message = f"{bus.busNumber} has been verified and is now listed on GO-GO Ride."
    elif status == "REJECTED":
        activity = f"Bus {bus.busNumber} rejected - {body.reason}"
        title = "Bus request rejected"
        message = f"{bus.busNumber} was rejected: {body.reason}"
    else:
        activity = f"Bus {bus.busNumber} moved to {readable}"
        title = "Bus request update"
        message = f"{bus.busNumber} is now {readable}."

    log_activity(
        db,
        actor_id=admin.id,
        action=f"BUS_{status}",
        entity_type="BUS",
        entity_id=bus.id,
        message=activity,
        commit=False,
    )
    notify(db, user_id=bus.ownerId, title=title, message=message, type="USER", commit=False)

    db.commit()
    db.refresh(bus)
    return {"message": "Bus status updated", "data": bus}


# ------------------------------------------------------------- user admin


@router.get("/users", response_model=PageEnvelope[UserOut], summary="Users Management")
def list_users(
    db: DbSession,
    _admin: AdminUser,
    page: PageDep,
    role: Role | None = None,
    status: UserStatus | None = None,
):
    filters = []
    if role:
        filters.append(User.role == role.value)
    if status:
        filters.append(User.status == status.value)
    if page.search:
        filters.append(
            or_(
                User.name.contains(page.search),
                User.phone.contains(page.search),
                User.email.contains(page.search),
            )
        )

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(User).where(*filters).order_by(User.createdAt.desc()).offset(page.skip).limit(page.limit)
        )
    )
    return {"data": items, "meta": meta(total, page)}


@router.get("/users/{user_id}", response_model=Envelope[dict], summary="User with buses and bookings")
def get_user(user_id: str, db: DbSession, _admin: AdminUser):
    user = db.get(User, user_id)
    if user is None:
        raise ApiError.not_found("User not found")

    buses = db.scalars(select(Bus).where(Bus.ownerId == user_id)).all()
    bookings = db.scalars(
        select(Booking).where(Booking.userId == user_id).order_by(Booking.createdAt.desc()).limit(10)
    ).all()
    logins = db.scalars(
        select(LoginActivity)
        .where(LoginActivity.userId == user_id)
        .order_by(LoginActivity.createdAt.desc())
        .limit(10)
    ).all()

    payload = UserOut.model_validate(user).model_dump(by_alias=True, mode="json")
    payload["buses"] = [{"id": b.id, "busNumber": b.busNumber, "status": b.status} for b in buses]
    payload["bookings"] = [
        {
            "id": b.id,
            "bookingRef": b.bookingRef,
            "amount": b.amount,
            "status": b.status,
            "travelDate": b.travelDate.isoformat(),
        }
        for b in bookings
    ]
    payload["logins"] = [
        {
            "id": l.id,
            "device": l.device,
            "ipAddress": l.ipAddress,
            "location": l.location,
            "status": l.status,
            "createdAt": l.createdAt.isoformat(),
        }
        for l in logins
    ]
    return {"data": payload}


@router.post(
    "/users",
    response_model=Envelope[UserOut],
    status_code=201,
    summary="Create a staff or owner account (super admin)",
)
def create_user(body: AdminUserCreateBody, db: DbSession, admin: SuperAdminUser):
    if db.scalar(select(User).where(User.phone == body.phone)):
        raise ApiError.conflict("An account with this mobile number already exists")

    user = User(
        name=body.name,
        phone=body.phone,
        email=body.email,
        role=body.role.value,
        passwordHash=hash_password(body.password),
    )
    db.add(user)
    db.flush()

    log_activity(
        db,
        actor_id=admin.id,
        action="USER_CREATED",
        entity_type="USER",
        entity_id=user.id,
        message=f"{user.role} account created for {user.name}",
        commit=False,
    )
    db.commit()
    db.refresh(user)
    return {"message": "User created", "data": user}


@router.patch("/users/{user_id}", response_model=Envelope[UserOut], summary="Update role or status")
def update_user(user_id: str, body: AdminUserUpdateBody, db: DbSession, admin: AdminUser):
    # Only a super admin may hand out admin roles.
    if body.role and body.role.value in {"ADMIN", "SUPER_ADMIN"} and admin.role != "SUPER_ADMIN":
        raise ApiError.forbidden("Only a super admin can assign admin roles")
    if user_id == admin.id and body.status and body.status.value != "ACTIVE":
        raise ApiError.bad_request("You cannot deactivate your own account")
    if user_id == admin.id and body.role and body.role.value != admin.role:
        raise ApiError.bad_request("You cannot change your own role")

    user = db.get(User, user_id)
    if user is None:
        raise ApiError.not_found("User not found")
    # Admin accounts (including super admins) can only be edited, blocked or
    # demoted by a super admin - otherwise any admin could lock out the owner.
    if user.role in {"ADMIN", "SUPER_ADMIN"} and user.id != admin.id and admin.role != "SUPER_ADMIN":
        raise ApiError.forbidden("Only a super admin can change another admin's account")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value.value if hasattr(value, "value") else value)

    # A blocked user's sessions must die immediately.
    if body.status and body.status.value != "ACTIVE":
        for token in db.scalars(
            select(RefreshToken).where(
                RefreshToken.userId == user.id, RefreshToken.revokedAt.is_(None)
            )
        ):
            token.revokedAt = utcnow()

    db.commit()
    db.refresh(user)
    return {"message": "User updated", "data": user}


@router.delete("/users/{user_id}", response_model=Envelope[Empty], summary="Delete a user (super admin)")
def delete_user(user_id: str, db: DbSession, admin: SuperAdminUser):
    if user_id == admin.id:
        raise ApiError.bad_request("You cannot delete your own account")
    user = db.get(User, user_id)
    if user is None:
        raise ApiError.not_found("User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted", "data": None}


# --------------------------------------------------------- reports/settings


@router.get("/reports", response_model=Envelope[dict], summary="Reports & Analytics")
def reports(db: DbSession, _admin: AdminUser, from_: FromQuery = None, to: ToQuery = None):
    window = report_service.resolve_range(from_, to)
    return {
        "data": {
            **report_service.report_summary(db, window),
            "series": report_service.daily_series(db, window),
            "topRoutes": report_service.top_routes(db, window, limit=10),
        }
    }


@router.get("/reports/export", summary="Download the report as CSV", response_class=StreamingResponse)
def export_report(db: DbSession, _admin: AdminUser, from_: FromQuery = None, to: ToQuery = None):
    window = report_service.resolve_range(from_, to)
    series = report_service.daily_series(db, window)

    lines = ["date,buses_added,bookings,revenue"]
    lines += [f"{r['date']},{r['buses']},{r['bookings']},{r['revenue']}" for r in series]
    buffer = io.StringIO("\n".join(lines))

    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="gogoride-report.csv"'},
    )


@router.get("/settings", response_model=Envelope[SettingsOut], summary="Platform settings")
def get_settings(db: DbSession, _admin: AdminUser):
    return {"data": get_settings_row(db)}


@router.patch("/settings", response_model=Envelope[SettingsOut], summary="Save platform settings")
def update_settings(body: SettingsBody, db: DbSession, admin: AdminUser):
    row = get_settings_row(db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    log_activity(
        db,
        actor_id=admin.id,
        action="SETTINGS_UPDATED",
        entity_type="SETTING",
        entity_id="global",
        message="Platform settings updated",
        commit=False,
    )
    db.commit()
    db.refresh(row)
    return {"message": "Settings saved", "data": row}
