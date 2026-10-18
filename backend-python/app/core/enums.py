"""Allowed values for every enum-like column.

Mirrors backend/src/constants/enums.ts so both services agree on the strings
stored in the shared database.
"""
from __future__ import annotations

from enum import Enum


class StrEnum(str, Enum):
    """str-backed enum: serialises as its value and compares to plain strings."""

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value


class Role(StrEnum):
    PASSENGER = "PASSENGER"
    BUS_OWNER = "BUS_OWNER"
    DRIVER = "DRIVER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


ADMIN_ROLES = {Role.ADMIN, Role.SUPER_ADMIN}


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    BLOCKED = "BLOCKED"


class BusType(StrEnum):
    AC = "AC"
    NON_AC = "NON_AC"


class BusCategory(StrEnum):
    NORMAL = "NORMAL"
    SUPER_FAST = "SUPER_FAST"
    EXPRESS = "EXPRESS"
    DELUXE = "DELUXE"


class BusStatus(StrEnum):
    PENDING = "PENDING"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class DocType(StrEnum):
    RC_BOOK = "RC_BOOK"
    ROUTE_PERMIT = "ROUTE_PERMIT"
    INSURANCE = "INSURANCE"
    OTHER = "OTHER"


class Day(StrEnum):
    MON = "MON"
    TUE = "TUE"
    WED = "WED"
    THU = "THU"
    FRI = "FRI"
    SAT = "SAT"
    SUN = "SUN"


DAY_ORDER: list[str] = [d.value for d in Day]  # Monday-first, matches dayCode()


class RecordStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class AlarmStatus(StrEnum):
    ACTIVE = "ACTIVE"
    TRIGGERED = "TRIGGERED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


REMIND_BEFORE_OPTIONS = [30, 15, 5, 0]


class FavoriteType(StrEnum):
    BUS = "BUS"
    ROUTE = "ROUTE"
    STOP = "STOP"
    LOCAL_CAR = "LOCAL_CAR"


class SearchType(StrEnum):
    ROUTE = "ROUTE"
    BUS_NUMBER = "BUS_NUMBER"
    BUS_NAME = "BUS_NAME"


class VehicleType(StrEnum):
    CAR = "CAR"
    AUTO = "AUTO"
    BIKE = "BIKE"


class RideStatus(StrEnum):
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class BookingType(StrEnum):
    BUS = "BUS"
    RIDE = "RIDE"
    LOCAL_CAR = "LOCAL_CAR"


class BookingStatus(StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentMode(StrEnum):
    CASH = "CASH"
    UPI = "UPI"
    CARD = "CARD"
    WALLET = "WALLET"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    REFUNDED = "REFUNDED"
    FAILED = "FAILED"


class NotificationType(StrEnum):
    SYSTEM = "SYSTEM"
    USER = "USER"
    PROMO = "PROMO"
    ALARM = "ALARM"


class TicketCategory(StrEnum):
    GENERAL = "GENERAL"
    BUS = "BUS"
    BOOKING = "BOOKING"
    PAYMENT = "PAYMENT"
    ACCOUNT = "ACCOUNT"


class TicketStatus(StrEnum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class TicketPriority(StrEnum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class OtpPurpose(StrEnum):
    LOGIN = "LOGIN"
    REGISTER = "REGISTER"
    RESET = "RESET"


class SortOrder(StrEnum):
    asc = "asc"
    desc = "desc"
