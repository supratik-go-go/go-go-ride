"""Response models. Shapes match the Node service field for field."""
from __future__ import annotations

from pydantic import Field, computed_field

from app.core.timeutils import to_12h, to_hhmm, to_minutes
from app.schemas.common import Schema, UtcDateTime


class UserOut(Schema):
    id: str
    name: str
    phone: str
    email: str | None = None
    role: str
    avatarUrl: str | None = None
    status: str
    phoneVerified: bool
    createdAt: UtcDateTime | None = None
    lastLoginAt: UtcDateTime | None = None


class UserBrief(Schema):
    id: str
    name: str
    phone: str | None = None
    email: str | None = None
    avatarUrl: str | None = None


class AuthSession(Schema):
    user: UserOut
    accessToken: str
    refreshToken: str


class OtpSession(AuthSession):
    isNewUser: bool = False


class TokenPair(Schema):
    accessToken: str
    refreshToken: str


class StopOut(Schema):
    id: str
    name: str
    area: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: str | None = None
    createdAt: UtcDateTime | None = None
    updatedAt: UtcDateTime | None = None


class StopRef(Schema):
    """Just enough to identify a stop on a search result."""

    id: str
    name: str | None = None


class StopListItem(StopOut):
    busesAvailable: int = 0
    routes: int = 0


class StopNearby(StopListItem):
    distanceKm: float


class RouteBrief(Schema):
    id: str
    name: str
    routeNumber: str
    distanceKm: float | None = None


class RouteStopOut(Schema):
    id: str
    routeId: str | None = None
    stopId: str | None = None
    sequence: int
    distanceFromStartKm: float
    stop: StopOut


class RouteOut(RouteBrief):
    status: str
    fromStopId: str | None = None
    toStopId: str | None = None
    createdAt: UtcDateTime | None = None
    updatedAt: UtcDateTime | None = None
    fromStop: StopOut | None = None
    toStop: StopOut | None = None
    stops: list[RouteStopOut] = []
    totalBuses: int = 0


class PopularRoute(Schema):
    id: str
    name: str
    routeNumber: str
    from_: str | None = Field(None, alias="from")
    to: str | None = None
    distanceKm: float
    totalBuses: int

    model_config = {"populate_by_name": True, "from_attributes": True}


class StopageOut(Schema):
    id: str
    busId: str | None = None
    stopId: str | None = None
    sequence: int
    stop: StopOut
    arrivalTime: str
    departureTime: str
    distanceKm: float
    isStart: bool = False
    isEnd: bool = False

    @computed_field
    @property
    def arrivalTime12h(self) -> str:
        return to_12h(self.arrivalTime)

    @computed_field
    @property
    def departureTime12h(self) -> str:
        return to_12h(self.departureTime)


class BusDocumentOut(Schema):
    id: str
    docType: str
    fileUrl: str
    originalName: str | None = None
    uploadedAt: UtcDateTime


class BusExceptionOut(Schema):
    id: str
    busId: str
    date: UtcDateTime
    reason: str | None = None


class BusOut(Schema):
    id: str
    busNumber: str
    busName: str | None = None
    ownerId: str
    routeId: str | None = None
    type: str
    category: str
    operator: str | None = None
    totalSeats: int
    fare: float
    contactNumber: str | None = None
    contactStart: str
    contactEnd: str
    serviceDays: str
    status: str
    rejectionReason: str | None = None
    ratingAvg: float
    ratingCount: int
    imageUrl: str | None = None
    submittedAt: UtcDateTime | None = None
    reviewedAt: UtcDateTime | None = None
    reviewedById: str | None = None
    createdAt: UtcDateTime | None = None
    updatedAt: UtcDateTime | None = None
    owner: UserBrief | None = None
    route: RouteBrief | None = None
    stopages: list[StopageOut] = []
    documents: list[BusDocumentOut] = []


class Rating(Schema):
    average: float
    count: int


class BusSearchResult(Schema):
    """One card on the Search Results screen, timed for the requested stop pair."""

    id: str
    busNumber: str
    busName: str | None = None
    routeName: str
    routeNumber: str | None = None
    type: str
    category: str
    operator: str | None = None
    fare: float
    totalSeats: int
    rating: Rating
    from_: StopRef | None = Field(None, alias="from")
    to: StopRef | None = None
    departureTime: str
    departureTime12h: str
    arrivalTime: str
    arrivalTime12h: str
    durationMinutes: int
    durationLabel: str
    isRunning: bool
    notRunningReason: str | None = None
    nextDepartureInMinutes: int | None = None

    model_config = {"populate_by_name": True, "from_attributes": True}


class BusSearchResponse(Schema):
    date: str
    from_: StopRef | None = Field(None, alias="from")
    to: StopRef | None = None
    total: int
    buses: list[BusSearchResult]

    model_config = {"populate_by_name": True, "from_attributes": True}


class Journey(Schema):
    departureTime: str | None = None
    arrivalTime: str | None = None
    durationMinutes: int
    durationLabel: str
    totalDistanceKm: float


class Availability(Schema):
    date: str
    isRunning: bool
    reason: str | None = None


class ReviewOut(Schema):
    id: str
    rating: int
    comment: str | None = None
    createdAt: UtcDateTime
    user: UserBrief | None = None


class BusDetails(BusOut):
    timetable: list[StopageOut] = []
    journey: Journey
    availability: Availability
    exceptions: list[BusExceptionOut] = []
    reviews: list[ReviewOut] = []


class AlarmOut(Schema):
    id: str
    userId: str
    busId: str
    alarmDate: UtcDateTime
    expectedArrival: str
    remindBeforeMin: int
    status: str
    notifiedAt: UtcDateTime | None = None
    createdAt: UtcDateTime | None = None
    bus: BusOut | None = None
    boardingStop: StopOut | None = None
    arrivalStop: StopOut | None = None

    @computed_field
    @property
    def expectedArrival12h(self) -> str:
        return to_12h(self.expectedArrival)

    @computed_field
    @property
    def notifyAt(self) -> str:
        """When the reminder fires: arrival time minus the chosen lead time."""
        return to_hhmm(to_minutes(self.expectedArrival) - self.remindBeforeMin)

    @computed_field
    @property
    def notifyAt12h(self) -> str:
        return to_12h(self.notifyAt)


class LocalCarOut(Schema):
    id: str
    ownerId: str | None = None
    driverName: str
    phone: str
    area: str
    carModel: str | None = None
    carNumber: str | None = None
    photoUrl: str | None = None
    availableFrom: str
    availableTo: str
    ratingAvg: float
    ratingCount: int
    verified: bool
    status: str
    createdAt: UtcDateTime | None = None
    updatedAt: UtcDateTime | None = None

    @computed_field
    @property
    def availabilityLabel(self) -> str:
        return f"{to_12h(self.availableFrom)} - {to_12h(self.availableTo)}"


class LocalCarDetails(LocalCarOut):
    reviews: list[ReviewOut] = []


class RideOut(Schema):
    id: str
    routeId: str | None = None
    vehicleType: str
    departureAt: UtcDateTime
    totalSeats: int
    availableSeats: int
    farePerSeat: float
    status: str
    fromStop: StopOut | None = None
    toStop: StopOut | None = None
    route: RouteBrief | None = None
    driver: UserBrief | None = None


class RideStatus(Schema):
    feature: str
    status: str
    activeRides: int
    waitlistCount: int
    tagline: str


class BookingOut(Schema):
    id: str
    bookingRef: str
    userId: str
    type: str
    travelDate: UtcDateTime
    seats: int
    amount: float
    paymentMode: str
    paymentStatus: str
    status: str
    cancelReason: str | None = None
    createdAt: UtcDateTime
    user: UserBrief | None = None
    bus: BusOut | None = None
    ride: RideOut | None = None
    localCar: LocalCarOut | None = None


class NotificationOut(Schema):
    id: str
    userId: str | None = None
    title: str
    message: str
    type: str
    link: str | None = None
    isRead: bool
    readAt: UtcDateTime | None = None
    createdAt: UtcDateTime


class SupportTicketOut(Schema):
    id: str
    ticketRef: str
    userId: str | None = None
    name: str
    phone: str
    email: str | None = None
    category: str
    subject: str
    message: str
    status: str
    priority: str
    response: str | None = None
    createdAt: UtcDateTime
    user: UserBrief | None = None


class ActivityLogOut(Schema):
    id: str
    action: str
    entityType: str | None = None
    entityId: str | None = None
    message: str
    createdAt: UtcDateTime
    actor: UserBrief | None = None


class LoginActivityOut(Schema):
    id: str
    device: str | None = None
    ipAddress: str | None = None
    location: str | None = None
    status: str
    createdAt: UtcDateTime


class SettingsOut(Schema):
    id: str
    platformName: str
    platformEmail: str
    contactNumber: str
    address: str
    timezone: str
    currency: str
    dateFormat: str
    timeFormat: str


class RecentSearchOut(Schema):
    id: str
    searchType: str
    fromText: str | None = None
    toText: str | None = None
    query: str | None = None
    searchedAt: UtcDateTime
