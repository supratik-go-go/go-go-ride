"""Notifications feed and Help & Support tickets."""
from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload
from fastapi import APIRouter

from app.core.deps import AdminUser, CurrentUser, DbSession, OptionalUser, is_admin
from app.core.enums import NotificationType, TicketCategory, TicketPriority, TicketStatus
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.core.security import random_ref
from app.db.models import Notification, SupportTicket, User
from app.db.types import utcnow
from app.schemas.common import Empty, Envelope, NotificationPageEnvelope, PageEnvelope
from app.schemas.requests import BroadcastBody, TicketBody, TicketUpdateBody
from app.schemas.responses import NotificationOut, SupportTicketOut
from app.services.common import notify, notify_many

notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])
support_router = APIRouter(prefix="/support", tags=["Support"])


def _visible_to(user_id: str):
    """Personal notifications plus broadcasts."""
    return or_(Notification.userId == user_id, Notification.userId.is_(None))


@notifications_router.get(
    "",
    response_model=NotificationPageEnvelope[NotificationOut],
    summary="Notification feed (personal + broadcast)",
    description="`meta.unread` carries the badge count.",
)
def list_notifications(
    db: DbSession,
    user: CurrentUser,
    page: PageDep,
    type: NotificationType | None = None,
    unreadOnly: bool = False,
):
    filters = [_visible_to(user.id)]
    if type:
        filters.append(Notification.type == type.value)
    if unreadOnly:
        filters.append(Notification.isRead.is_(False))

    total = db.scalar(select(func.count(Notification.id)).where(*filters)) or 0
    unread = (
        db.scalar(
            select(func.count(Notification.id)).where(
                _visible_to(user.id), Notification.isRead.is_(False)
            )
        )
        or 0
    )
    items = list(
        db.scalars(
            select(Notification)
            .where(*filters)
            .order_by(Notification.createdAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    return {"data": items, "meta": meta(total, page, unread=unread)}


@notifications_router.get(
    "/unread-count", response_model=Envelope[dict], summary="Badge count for the bell icon"
)
def unread_count(db: DbSession, user: CurrentUser):
    count = (
        db.scalar(
            select(func.count(Notification.id)).where(
                _visible_to(user.id), Notification.isRead.is_(False)
            )
        )
        or 0
    )
    return {"data": {"count": count}}


@notifications_router.patch(
    "/read-all", response_model=Envelope[dict], summary="Mark all as read"
)
def mark_all_read(db: DbSession, user: CurrentUser):
    rows = list(
        db.scalars(
            select(Notification).where(
                Notification.userId == user.id, Notification.isRead.is_(False)
            )
        )
    )
    for row in rows:
        row.isRead = True
        row.readAt = utcnow()
    db.commit()
    return {"message": "All notifications marked as read", "data": {"updated": len(rows)}}


@notifications_router.patch(
    "/{notification_id}/read", response_model=Envelope[Empty], summary="Mark one as read"
)
def mark_read(notification_id: str, db: DbSession, user: CurrentUser):
    row = db.scalar(
        select(Notification).where(Notification.id == notification_id, _visible_to(user.id))
    )
    if row is not None:
        row.isRead = True
        row.readAt = utcnow()
        db.commit()
    return {"message": "Marked as read", "data": None}


@notifications_router.delete(
    "/{notification_id}", response_model=Envelope[Empty], summary="Delete a notification"
)
def delete_notification(notification_id: str, db: DbSession, user: CurrentUser):
    row = db.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.userId == user.id
        )
    )
    if row is not None:
        db.delete(row)
        db.commit()
    return {"message": "Notification removed", "data": None}


@notifications_router.post(
    "/broadcast",
    response_model=Envelope[dict],
    status_code=201,
    summary="Announce to everyone or one role (admin)",
)
def broadcast(body: BroadcastBody, db: DbSession, _admin: AdminUser):
    if body.audience == "ALL":
        notification = notify(
            db,
            user_id=None,
            title=body.title,
            message=body.message,
            type=body.type.value,
            link=body.link,
        )
        return {
            "message": "Announcement published to all users",
            "data": {"id": notification.id, "recipients": None},
        }

    user_ids = [
        row.id
        for row in db.scalars(
            select(User).where(User.role == body.audience, User.status == "ACTIVE")
        )
    ]
    count = notify_many(
        db, user_ids, title=body.title, message=body.message, type=body.type.value, link=body.link
    )
    return {
        "message": f"Sent to {count} {body.audience.lower()} users",
        "data": {"recipients": count},
    }


# ---------------------------------------------------------------- support


@support_router.post(
    "/tickets",
    response_model=Envelope[SupportTicketOut],
    status_code=201,
    summary="Raise a ticket - Help & Support / website contact form",
)
def create_ticket(body: TicketBody, db: DbSession, user: OptionalUser):
    ticket = SupportTicket(
        **{**body.model_dump(), "category": body.category.value},
        ticketRef=random_ref("TKT", 6),
        userId=user.id if user else None,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return {
        "message": f"Ticket {ticket.ticketRef} created. Our team will get back to you.",
        "data": ticket,
    }


@support_router.get(
    "/tickets", response_model=PageEnvelope[SupportTicketOut], summary="My tickets (admins see all)"
)
def list_tickets(
    db: DbSession,
    user: CurrentUser,
    page: PageDep,
    status: TicketStatus | None = None,
    category: TicketCategory | None = None,
    priority: TicketPriority | None = None,
):
    filters = [] if is_admin(user) else [SupportTicket.userId == user.id]
    if status:
        filters.append(SupportTicket.status == status.value)
    if category:
        filters.append(SupportTicket.category == category.value)
    if priority:
        filters.append(SupportTicket.priority == priority.value)
    if page.search:
        filters.append(
            or_(
                SupportTicket.subject.contains(page.search),
                SupportTicket.ticketRef.contains(page.search.upper()),
                SupportTicket.name.contains(page.search),
            )
        )

    total = db.scalar(select(func.count(SupportTicket.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(SupportTicket)
            .where(*filters)
            .options(selectinload(SupportTicket.user))
            .order_by(SupportTicket.createdAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    return {"data": items, "meta": meta(total, page)}


@support_router.get(
    "/tickets/{ticket_id}", response_model=Envelope[SupportTicketOut], summary="Ticket details"
)
def get_ticket(ticket_id: str, db: DbSession, user: CurrentUser):
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise ApiError.not_found("Ticket not found")
    if ticket.userId != user.id and not is_admin(user):
        raise ApiError.forbidden()
    return {"data": ticket}


@support_router.patch(
    "/tickets/{ticket_id}", response_model=Envelope[SupportTicketOut], summary="Reply / triage (admin)"
)
def update_ticket(ticket_id: str, body: TicketUpdateBody, db: DbSession, _admin: AdminUser):
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise ApiError.not_found("Ticket not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ticket, field, value.value if hasattr(value, "value") else value)

    if body.response and ticket.userId:
        notify(
            db,
            user_id=ticket.userId,
            title=f"Reply on ticket {ticket.ticketRef}",
            message=body.response,
            type="USER",
            commit=False,
        )

    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket updated", "data": ticket}
