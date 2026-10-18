"""Request bodies. These drive both validation and the /docs schemas."""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.core.enums import (
    AlarmStatus,
    BookingStatus,
    BookingType,
    BusCategory,
    BusStatus,
    BusType,
    Day,
    DocType,
    FavoriteType,
    NotificationType,
    OtpPurpose,
    PaymentMode,
    PaymentStatus,
    RecordStatus,
    RideStatus,
    Role,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    UserStatus,
    VehicleType,
)
from app.schemas.common import HHMM, Body, DateOnly, PhoneMixin

PublicRole = Literal["PASSENGER", "BUS_OWNER", "DRIVER"]
Password = Annotated[str, Field(min_length=6, max_length=72)]
Name = Annotated[str, Field(min_length=2, max_length=80)]

# ----------------------------------------------------------------- auth


class RegisterBody(Body, PhoneMixin):
    name: Name
    phone: str
    email: str | None = None
    password: Password
    role: PublicRole = "PASSENGER"


class LoginBody(Body, PhoneMixin):
    phone: str
    password: Annotated[str, Field(min_length=1)]


class OtpRequestBody(Body, PhoneMixin):
    phone: str
    purpose: OtpPurpose = OtpPurpose.LOGIN


class OtpVerifyBody(Body, PhoneMixin):
    phone: str
    code: Annotated[str, Field(pattern=r"^\d{6}$")]
    purpose: OtpPurpose = OtpPurpose.LOGIN
    name: Name | None = None
    role: PublicRole | None = None


class RefreshBody(Body):
    refreshToken: Annotated[str, Field(min_length=10)]


class LogoutBody(Body):
    refreshToken: str | None = None


class ChangePasswordBody(Body):
    currentPassword: str | None = None
    newPassword: Password


# ----------------------------------------------------------------- buses


class StopageBody(Body):
    stopId: str | None = None
    stopName: Annotated[str, Field(min_length=2)] | None = None
    arrivalTime: HHMM
    departureTime: HHMM
    distanceKm: float = 0

    @model_validator(mode="after")
    def _needs_a_stop(self) -> "StopageBody":
        if not self.stopId and not self.stopName:
            raise ValueError("Each stopage needs either stopId or stopName")
        return self


class BusCreateBody(Body):
    busNumber: Annotated[str, Field(min_length=4, max_length=20)]
    busName: Annotated[str, Field(min_length=2, max_length=80)] | None = None
    type: BusType
    category: BusCategory
    operator: Annotated[str, Field(max_length=80)] | None = None
    totalSeats: Annotated[int, Field(ge=1, le=120)] = 45
    fare: Annotated[float, Field(ge=0)] = 0
    contactNumber: Annotated[str, Field(min_length=6, max_length=20)]
    contactStart: HHMM = "06:00"
    contactEnd: HHMM = "22:00"
    serviceDays: Annotated[list[Day], Field(min_length=1)]
    routeId: str | None = None
    stopages: Annotated[list[StopageBody], Field(min_length=2)]

    @field_validator("busNumber")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()

    @property
    def service_days_csv(self) -> str:
        return ",".join(dict.fromkeys(d.value for d in self.serviceDays))


class BusUpdateBody(Body):
    busName: str | None = None
    type: BusType | None = None
    category: BusCategory | None = None
    operator: str | None = None
    totalSeats: Annotated[int, Field(ge=1, le=120)] | None = None
    fare: Annotated[float, Field(ge=0)] | None = None
    contactNumber: str | None = None
    contactStart: HHMM | None = None
    contactEnd: HHMM | None = None
    serviceDays: list[Day] | None = None
    routeId: str | None = None
    stopages: Annotated[list[StopageBody], Field(min_length=2)] | None = None


class BusExceptionBody(Body):
    date: DateOnly
    reason: Annotated[str, Field(max_length=200)] | None = None


class BusStatusBody(Body):
    status: BusStatus
    reason: Annotated[str, Field(max_length=300)] | None = None


class DocumentMeta(Body):
    docType: DocType


class ReviewBody(Body):
    rating: Annotated[int, Field(ge=1, le=5)]
    comment: Annotated[str, Field(max_length=500)] | None = None


# ------------------------------------------------------------ stops/routes


class StopBody(Body):
    name: Annotated[str, Field(min_length=2, max_length=80)]
    area: Annotated[str, Field(max_length=80)] | None = None
    city: Annotated[str, Field(max_length=80)] = "Kolkata"
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    status: RecordStatus = RecordStatus.ACTIVE


class StopUpdateBody(Body):
    name: Annotated[str, Field(min_length=2, max_length=80)] | None = None
    area: str | None = None
    city: str | None = None
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    status: RecordStatus | None = None


class RouteStopBody(Body):
    stopId: str
    distanceFromStartKm: float = 0


class RouteBody(Body):
    name: Annotated[str, Field(min_length=2, max_length=120)]
    routeNumber: Annotated[str, Field(min_length=1, max_length=20)]
    fromStopId: str | None = None
    toStopId: str | None = None
    distanceKm: Annotated[float, Field(ge=0)] = 0
    status: RecordStatus = RecordStatus.ACTIVE
    stops: list[RouteStopBody] | None = None

    @field_validator("routeNumber")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()


class RouteUpdateBody(Body):
    name: str | None = None
    routeNumber: str | None = None
    fromStopId: str | None = None
    toStopId: str | None = None
    distanceKm: Annotated[float, Field(ge=0)] | None = None
    status: RecordStatus | None = None
    stops: list[RouteStopBody] | None = None


# ---------------------------------------------------------------- alarms


class AlarmCreateBody(Body):
    busId: str
    boardingStopId: str
    arrivalStopId: str
    date: DateOnly
    remindBeforeMin: Literal[30, 15, 5, 0] = Field(
        description="Minutes before arrival. 0 means 'Bus arriving now'."
    )


class AlarmUpdateBody(Body):
    remindBeforeMin: Literal[30, 15, 5, 0] | None = None
    status: Literal["ACTIVE", "CANCELLED"] | None = None


# --------------------------------------------------------------- profile


class ProfileBody(Body):
    name: Name | None = None
    email: str | None = None
    avatarUrl: str | None = None


class FavoriteBody(Body):
    itemType: FavoriteType
    itemId: str


# ------------------------------------------------------------ local cars


class LocalCarBody(Body, PhoneMixin):
    driverName: Name
    phone: str
    area: Annotated[str, Field(min_length=2, max_length=80)]
    carModel: Annotated[str, Field(max_length=80)] | None = None
    carNumber: Annotated[str, Field(max_length=20)] | None = None
    availableFrom: HHMM = "06:00"
    availableTo: HHMM = "22:00"
    status: RecordStatus = RecordStatus.ACTIVE


class LocalCarUpdateBody(Body):
    driverName: Name | None = None
    phone: str | None = None
    area: str | None = None
    carModel: str | None = None
    carNumber: str | None = None
    availableFrom: HHMM | None = None
    availableTo: HHMM | None = None
    status: RecordStatus | None = None


class VerifyBody(Body):
    verified: bool


# ----------------------------------------------------------------- rides


class RideBody(Body):
    fromStopId: str
    toStopId: str
    routeId: str | None = None
    driverId: str | None = None
    vehicleType: VehicleType = VehicleType.CAR
    departureAt: str
    totalSeats: Annotated[int, Field(ge=1, le=8)] = 4
    farePerSeat: Annotated[float, Field(ge=0)]


class RideUpdateBody(Body):
    fromStopId: str | None = None
    toStopId: str | None = None
    routeId: str | None = None
    driverId: str | None = None
    vehicleType: VehicleType | None = None
    departureAt: str | None = None
    totalSeats: Annotated[int, Field(ge=1, le=8)] | None = None
    farePerSeat: Annotated[float, Field(ge=0)] | None = None
    status: RideStatus | None = None


class NotifyMeBody(Body, PhoneMixin):
    phone: str
    area: Annotated[str, Field(max_length=80)] | None = None


# -------------------------------------------------------------- bookings


class BookingCreateBody(Body):
    type: BookingType
    busId: str | None = None
    rideId: str | None = None
    localCarId: str | None = None
    travelDate: DateOnly
    seats: Annotated[int, Field(ge=1, le=10)] = 1
    paymentMode: PaymentMode = PaymentMode.CASH

    @model_validator(mode="after")
    def _id_matches_type(self) -> "BookingCreateBody":
        expected = {
            BookingType.BUS: self.busId,
            BookingType.RIDE: self.rideId,
            BookingType.LOCAL_CAR: self.localCarId,
        }[self.type]
        if not expected:
            raise ValueError("Provide the id matching the booking type")
        return self


class CancelBody(Body):
    reason: Annotated[str, Field(max_length=200)] | None = None


class BookingStatusBody(Body):
    status: BookingStatus
    paymentStatus: PaymentStatus | None = None


# --------------------------------------------------------- notifications


class BroadcastBody(Body):
    title: Annotated[str, Field(min_length=2, max_length=120)]
    message: Annotated[str, Field(min_length=2, max_length=500)]
    type: NotificationType = NotificationType.SYSTEM
    audience: Literal["ALL", "PASSENGER", "BUS_OWNER", "DRIVER", "ADMIN", "SUPER_ADMIN"] = "ALL"
    link: str | None = None


# -------------------------------------------------------------- support


class TicketBody(Body, PhoneMixin):
    name: Name
    phone: str
    email: str | None = None
    category: TicketCategory = TicketCategory.GENERAL
    subject: Annotated[str, Field(min_length=3, max_length=120)]
    message: Annotated[str, Field(min_length=5, max_length=2000)]


class TicketUpdateBody(Body):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    response: Annotated[str, Field(max_length=2000)] | None = None


# ----------------------------------------------------------------- admin


class AdminUserCreateBody(Body, PhoneMixin):
    name: Name
    phone: str
    email: str | None = None
    role: Role
    password: Password


class AdminUserUpdateBody(Body):
    name: Name | None = None
    email: str | None = None
    role: Role | None = None
    status: UserStatus | None = None


class SettingsBody(Body):
    platformName: Annotated[str, Field(min_length=2, max_length=80)] | None = None
    platformEmail: str | None = None
    contactNumber: Annotated[str, Field(max_length=20)] | None = None
    address: Annotated[str, Field(max_length=200)] | None = None
    timezone: Annotated[str, Field(max_length=60)] | None = None
    currency: Annotated[str, Field(max_length=10)] | None = None
    dateFormat: Annotated[str, Field(max_length=20)] | None = None
    timeFormat: Literal["12h", "24h"] | None = None


__all__ = [name for name in dir() if name.endswith("Body")] + [
    "AlarmStatus",
    "BusStatus",
]
