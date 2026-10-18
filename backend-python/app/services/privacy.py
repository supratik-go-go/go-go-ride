"""Strip personal contact details from data shown to people who should not see it.

Public screens (bus search, bus details, reviews, shared rides) and a
passenger's own alarms and bookings embed other people's accounts: the bus
owner, reviewers, drivers. Their name is fine to show; their personal phone,
email and uploaded ownership documents are not. The bus's own `contactNumber`
(the booking line the owner chose to publish) is unaffected.

Admins, and owners looking at their own bus, keep the full data.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


def dump(model: type[BaseModel], obj: Any) -> dict:
    """ORM object (or dict) -> JSON-ready dict in the shape of `model`."""
    return model.model_validate(obj).model_dump(mode="json")


def public_person(person: dict | None, *, keep_phone: bool = False) -> dict | None:
    if not person:
        return person
    return {**person, "email": None, "phone": person.get("phone") if keep_phone else None}


def public_review(review: dict) -> dict:
    return {**review, "user": public_person(review.get("user"))}


def public_bus(bus: dict | None) -> dict | None:
    if not bus:
        return bus
    out = {**bus, "owner": public_person(bus.get("owner")), "documents": [], "rejectionReason": None}
    if "reviews" in out:
        out["reviews"] = [public_review(r) for r in out["reviews"] or []]
    return out


def public_ride(ride: dict) -> dict:
    # The driver's phone stays: riders call the driver, as with local cars.
    return {**ride, "driver": public_person(ride.get("driver"), keep_phone=True)}
