"""Notification delivery and the audit trail."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.db.models import ActivityLog, Notification

logger = logging.getLogger("gogoride")


def notify(
    db: Session,
    *,
    user_id: str | None,
    title: str,
    message: str,
    type: str = "SYSTEM",
    link: str | None = None,
    commit: bool = True,
) -> Notification:
    """Persist an in-app notification and hand it to the transport.

    The push/SMS transport is intentionally pluggable: replace the body of
    `dispatch` with FCM or an SMS gateway when those are wired.
    """
    notification = Notification(
        userId=user_id, title=title, message=message, type=type, link=link
    )
    db.add(notification)
    if commit:
        db.commit()
        db.refresh(notification)
    else:
        db.flush()
    dispatch(notification)
    return notification


def notify_many(db: Session, user_ids: list[str], *, title: str, message: str, type: str = "SYSTEM", link: str | None = None) -> int:
    if not user_ids:
        return 0
    db.add_all(
        [
            Notification(userId=uid, title=title, message=message, type=type, link=link)
            for uid in user_ids
        ]
    )
    db.commit()
    return len(user_ids)


def dispatch(notification: Notification) -> None:
    # TODO: integrate FCM push / SMS gateway here.
    logger.info(
        "[notify:%s] %s -> %s", notification.id, notification.title, notification.userId or "broadcast"
    )


def log_activity(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    message: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    commit: bool = True,
) -> None:
    """Feeds the admin dashboard's "Recent Activities" list."""
    try:
        db.add(
            ActivityLog(
                actorId=actor_id,
                action=action,
                message=message,
                entityType=entity_type,
                entityId=entity_id,
            )
        )
        if commit:
            db.commit()
        else:
            db.flush()
    except Exception:  # pragma: no cover - audit must never break the request
        logger.exception("[activity] failed to log %s", action)
        db.rollback()
