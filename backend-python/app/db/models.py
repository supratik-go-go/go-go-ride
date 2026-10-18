"""SQLAlchemy models for GO-GO Ride.

Table and column names match the Prisma schema exactly (PascalCase tables,
camelCase columns) so this service and the Node backend can read and write the
same database file. Attribute names follow the columns for the same reason: the
JSON contract is camelCase, so a translation layer would only add places for the
two services to drift apart.
"""
from __future__ import annotations

import secrets
import time
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.db.types import PrismaDateTime, utcnow

_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
_counter = 0


def new_id() -> str:
    """A cuid-shaped identifier, so ids look the same as Prisma's."""
    global _counter
    _counter = (_counter + 1) % 1_679_616  # 36 ** 4

    def base36(value: int, width: int) -> str:
        out = ""
        while value:
            value, rem = divmod(value, 36)
            out = _ALPHABET[rem] + out
        return out.rjust(width, "0")[-width:]

    stamp = base36(int(time.time() * 1000), 8)
    count = base36(_counter, 4)
    noise = "".join(secrets.choice(_ALPHABET) for _ in range(12))
    return f"c{stamp}{count}{noise}"


class Base(DeclarativeBase):
    pass


def pk() -> Mapped[str]:
    return mapped_column(String, primary_key=True, default=new_id)


def created() -> Mapped[datetime]:
    return mapped_column(PrismaDateTime, default=utcnow)


def updated() -> Mapped[datetime]:
    return mapped_column(PrismaDateTime, default=utcnow, onupdate=utcnow)


# ------------------------------------------------------------- users & auth


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(String)
    phone: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    passwordHash: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="PASSENGER")
    avatarUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    phoneVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    lastLoginAt: Mapped[datetime | None] = mapped_column(PrismaDateTime, nullable=True)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    buses: Mapped[list["Bus"]] = relationship(
        back_populates="owner", foreign_keys="Bus.ownerId", cascade="all, delete-orphan"
    )
    alarms: Mapped[list["Alarm"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="user")
    favorites: Mapped[list["Favorite"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    localCars: Mapped[list["LocalCar"]] = relationship(back_populates="owner")


class RefreshToken(Base):
    __tablename__ = "RefreshToken"

    id: Mapped[str] = pk()
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), index=True)
    tokenHash: Mapped[str] = mapped_column(String, unique=True, index=True)
    expiresAt: Mapped[datetime] = mapped_column(PrismaDateTime)
    revokedAt: Mapped[datetime | None] = mapped_column(PrismaDateTime, nullable=True)
    createdAt: Mapped[datetime] = created()


class OtpCode(Base):
    __tablename__ = "OtpCode"

    id: Mapped[str] = pk()
    phone: Mapped[str] = mapped_column(String, index=True)
    codeHash: Mapped[str] = mapped_column(String)
    purpose: Mapped[str] = mapped_column(String, default="LOGIN")
    expiresAt: Mapped[datetime] = mapped_column(PrismaDateTime)
    consumedAt: Mapped[datetime | None] = mapped_column(PrismaDateTime, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    createdAt: Mapped[datetime] = created()


# ------------------------------------------------------ network: stops/routes


class BusStop(Base):
    __tablename__ = "BusStop"
    __table_args__ = (UniqueConstraint("name", "city"),)

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(String, index=True)
    area: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str] = mapped_column(String, default="Kolkata")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    busStopages: Mapped[list["BusStopage"]] = relationship(back_populates="stop")
    routeStops: Mapped[list["RouteStop"]] = relationship(back_populates="stop")


class Route(Base):
    __tablename__ = "Route"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(String)
    routeNumber: Mapped[str] = mapped_column(String, unique=True, index=True)
    fromStopId: Mapped[str | None] = mapped_column(String, ForeignKey("BusStop.id"), nullable=True)
    toStopId: Mapped[str | None] = mapped_column(String, ForeignKey("BusStop.id"), nullable=True)
    distanceKm: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    fromStop: Mapped["BusStop | None"] = relationship(foreign_keys=[fromStopId])
    toStop: Mapped["BusStop | None"] = relationship(foreign_keys=[toStopId])
    stops: Mapped[list["RouteStop"]] = relationship(
        back_populates="route", cascade="all, delete-orphan", order_by="RouteStop.sequence"
    )
    buses: Mapped[list["Bus"]] = relationship(back_populates="route")


class RouteStop(Base):
    __tablename__ = "RouteStop"
    __table_args__ = (UniqueConstraint("routeId", "sequence"),)

    id: Mapped[str] = pk()
    routeId: Mapped[str] = mapped_column(String, ForeignKey("Route.id", ondelete="CASCADE"))
    stopId: Mapped[str] = mapped_column(String, ForeignKey("BusStop.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    distanceFromStartKm: Mapped[float] = mapped_column(Float, default=0)

    route: Mapped["Route"] = relationship(back_populates="stops")
    stop: Mapped["BusStop"] = relationship(back_populates="routeStops")


# ------------------------------------------------------------------- buses


class Bus(Base):
    __tablename__ = "Bus"

    id: Mapped[str] = pk()
    busNumber: Mapped[str] = mapped_column(String, unique=True, index=True)
    busName: Mapped[str | None] = mapped_column(String, nullable=True)
    ownerId: Mapped[str] = mapped_column(String, ForeignKey("User.id"), index=True)
    routeId: Mapped[str | None] = mapped_column(String, ForeignKey("Route.id"), nullable=True)
    type: Mapped[str] = mapped_column(String, default="NON_AC")
    category: Mapped[str] = mapped_column(String, default="NORMAL")
    operator: Mapped[str | None] = mapped_column(String, nullable=True)
    totalSeats: Mapped[int] = mapped_column(Integer, default=45)
    fare: Mapped[float] = mapped_column(Float, default=0)
    contactNumber: Mapped[str | None] = mapped_column(String, nullable=True)
    contactStart: Mapped[str] = mapped_column(String, default="06:00")
    contactEnd: Mapped[str] = mapped_column(String, default="22:00")
    serviceDays: Mapped[str] = mapped_column(String, default="MON,TUE,WED,THU,FRI,SAT,SUN")
    imageUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="PENDING", index=True)
    rejectionReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ratingAvg: Mapped[float] = mapped_column(Float, default=0)
    ratingCount: Mapped[int] = mapped_column(Integer, default=0)
    submittedAt: Mapped[datetime] = created()
    reviewedAt: Mapped[datetime | None] = mapped_column(PrismaDateTime, nullable=True)
    reviewedById: Mapped[str | None] = mapped_column(String, ForeignKey("User.id"), nullable=True)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    owner: Mapped["User"] = relationship(back_populates="buses", foreign_keys=[ownerId])
    reviewedBy: Mapped["User | None"] = relationship(foreign_keys=[reviewedById])
    route: Mapped["Route | None"] = relationship(back_populates="buses")
    stopages: Mapped[list["BusStopage"]] = relationship(
        back_populates="bus", cascade="all, delete-orphan", order_by="BusStopage.sequence"
    )
    documents: Mapped[list["BusDocument"]] = relationship(back_populates="bus", cascade="all, delete-orphan")
    exceptions: Mapped[list["BusException"]] = relationship(back_populates="bus", cascade="all, delete-orphan")
    reviews: Mapped[list["Review"]] = relationship(back_populates="bus", cascade="all, delete-orphan")


class BusDocument(Base):
    __tablename__ = "BusDocument"

    id: Mapped[str] = pk()
    busId: Mapped[str] = mapped_column(String, ForeignKey("Bus.id", ondelete="CASCADE"), index=True)
    docType: Mapped[str] = mapped_column(String)
    fileUrl: Mapped[str] = mapped_column(String)
    originalName: Mapped[str | None] = mapped_column(String, nullable=True)
    uploadedAt: Mapped[datetime] = created()

    bus: Mapped["Bus"] = relationship(back_populates="documents")


class BusStopage(Base):
    """One stop on a bus timetable, with arrival and departure clock times."""

    __tablename__ = "BusStopage"
    __table_args__ = (UniqueConstraint("busId", "sequence"),)

    id: Mapped[str] = pk()
    busId: Mapped[str] = mapped_column(String, ForeignKey("Bus.id", ondelete="CASCADE"))
    stopId: Mapped[str] = mapped_column(String, ForeignKey("BusStop.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    arrivalTime: Mapped[str] = mapped_column(String)
    departureTime: Mapped[str] = mapped_column(String)
    distanceKm: Mapped[float] = mapped_column(Float, default=0)

    bus: Mapped["Bus"] = relationship(back_populates="stopages")
    stop: Mapped["BusStop"] = relationship(back_populates="busStopages")


class BusException(Base):
    """A date on which an otherwise-scheduled bus will not run."""

    __tablename__ = "BusException"
    __table_args__ = (UniqueConstraint("busId", "date"),)

    id: Mapped[str] = pk()
    busId: Mapped[str] = mapped_column(String, ForeignKey("Bus.id", ondelete="CASCADE"))
    date: Mapped[datetime] = mapped_column(PrismaDateTime)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = created()

    bus: Mapped["Bus"] = relationship(back_populates="exceptions")


# ------------------------------------------------------- passenger features


class Alarm(Base):
    __tablename__ = "Alarm"

    id: Mapped[str] = pk()
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), index=True)
    busId: Mapped[str] = mapped_column(String, ForeignKey("Bus.id", ondelete="CASCADE"))
    boardingStopId: Mapped[str] = mapped_column(String, ForeignKey("BusStop.id"))
    arrivalStopId: Mapped[str] = mapped_column(String, ForeignKey("BusStop.id"))
    alarmDate: Mapped[datetime] = mapped_column(PrismaDateTime, index=True)
    expectedArrival: Mapped[str] = mapped_column(String)
    remindBeforeMin: Mapped[int] = mapped_column(Integer, default=15)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    notifiedAt: Mapped[datetime | None] = mapped_column(PrismaDateTime, nullable=True)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    user: Mapped["User"] = relationship(back_populates="alarms")
    bus: Mapped["Bus"] = relationship()
    boardingStop: Mapped["BusStop"] = relationship(foreign_keys=[boardingStopId])
    arrivalStop: Mapped["BusStop"] = relationship(foreign_keys=[arrivalStopId])


class Favorite(Base):
    __tablename__ = "Favorite"
    __table_args__ = (UniqueConstraint("userId", "itemType", "itemId"),)

    id: Mapped[str] = pk()
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"))
    itemType: Mapped[str] = mapped_column(String)
    itemId: Mapped[str] = mapped_column(String)
    createdAt: Mapped[datetime] = created()

    user: Mapped["User"] = relationship(back_populates="favorites")


class RecentSearch(Base):
    __tablename__ = "RecentSearch"

    id: Mapped[str] = pk()
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), index=True)
    searchType: Mapped[str] = mapped_column(String, default="ROUTE")
    fromText: Mapped[str | None] = mapped_column(String, nullable=True)
    toText: Mapped[str | None] = mapped_column(String, nullable=True)
    query: Mapped[str | None] = mapped_column(String, nullable=True)
    searchedAt: Mapped[datetime] = created()


# ----------------------------------------------------------- cars and rides


class LocalCar(Base):
    __tablename__ = "LocalCar"

    id: Mapped[str] = pk()
    ownerId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id"), nullable=True)
    driverName: Mapped[str] = mapped_column(String)
    phone: Mapped[str] = mapped_column(String)
    area: Mapped[str] = mapped_column(String, index=True)
    carModel: Mapped[str | None] = mapped_column(String, nullable=True)
    carNumber: Mapped[str | None] = mapped_column(String, nullable=True)
    photoUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    availableFrom: Mapped[str] = mapped_column(String, default="06:00")
    availableTo: Mapped[str] = mapped_column(String, default="22:00")
    ratingAvg: Mapped[float] = mapped_column(Float, default=0)
    ratingCount: Mapped[int] = mapped_column(Integer, default=0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    owner: Mapped["User | None"] = relationship(back_populates="localCars")
    reviews: Mapped[list["Review"]] = relationship(back_populates="localCar", cascade="all, delete-orphan")


class Ride(Base):
    """A "Running Car" shared ride."""

    __tablename__ = "Ride"

    id: Mapped[str] = pk()
    routeId: Mapped[str | None] = mapped_column(String, ForeignKey("Route.id"), nullable=True)
    fromStopId: Mapped[str] = mapped_column(String, ForeignKey("BusStop.id"))
    toStopId: Mapped[str] = mapped_column(String, ForeignKey("BusStop.id"))
    driverId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id"), nullable=True)
    vehicleType: Mapped[str] = mapped_column(String, default="CAR")
    departureAt: Mapped[datetime] = mapped_column(PrismaDateTime, index=True)
    totalSeats: Mapped[int] = mapped_column(Integer, default=4)
    availableSeats: Mapped[int] = mapped_column(Integer, default=4)
    farePerSeat: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default="SCHEDULED")
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    route: Mapped["Route | None"] = relationship()
    fromStop: Mapped["BusStop"] = relationship(foreign_keys=[fromStopId])
    toStop: Mapped["BusStop"] = relationship(foreign_keys=[toStopId])
    driver: Mapped["User | None"] = relationship()


class RideWaitlist(Base):
    """"Notify Me" sign-ups for the Running Car launch."""

    __tablename__ = "RideWaitlist"

    id: Mapped[str] = pk()
    userId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id"), nullable=True)
    phone: Mapped[str] = mapped_column(String, unique=True)
    area: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = created()


# -------------------------------------------------------- bookings/feedback


class Booking(Base):
    __tablename__ = "Booking"

    id: Mapped[str] = pk()
    bookingRef: Mapped[str] = mapped_column(String, unique=True, index=True)
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id"), index=True)
    type: Mapped[str] = mapped_column(String)
    busId: Mapped[str | None] = mapped_column(String, ForeignKey("Bus.id"), nullable=True)
    rideId: Mapped[str | None] = mapped_column(String, ForeignKey("Ride.id"), nullable=True)
    localCarId: Mapped[str | None] = mapped_column(String, ForeignKey("LocalCar.id"), nullable=True)
    travelDate: Mapped[datetime] = mapped_column(PrismaDateTime, index=True)
    seats: Mapped[int] = mapped_column(Integer, default=1)
    amount: Mapped[float] = mapped_column(Float, default=0)
    paymentMode: Mapped[str] = mapped_column(String, default="CASH")
    paymentStatus: Mapped[str] = mapped_column(String, default="PENDING")
    status: Mapped[str] = mapped_column(String, default="CONFIRMED")
    cancelReason: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    user: Mapped["User"] = relationship(back_populates="bookings")
    bus: Mapped["Bus | None"] = relationship()
    ride: Mapped["Ride | None"] = relationship()
    localCar: Mapped["LocalCar | None"] = relationship()


class Review(Base):
    __tablename__ = "Review"
    __table_args__ = (UniqueConstraint("userId", "busId"),)

    id: Mapped[str] = pk()
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"))
    busId: Mapped[str | None] = mapped_column(String, ForeignKey("Bus.id", ondelete="CASCADE"), nullable=True)
    localCarId: Mapped[str | None] = mapped_column(
        String, ForeignKey("LocalCar.id", ondelete="CASCADE"), nullable=True
    )
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = created()

    user: Mapped["User"] = relationship()
    bus: Mapped["Bus | None"] = relationship(back_populates="reviews")
    localCar: Mapped["LocalCar | None"] = relationship(back_populates="reviews")


# ------------------------------------------------------------- platform ops


class Notification(Base):
    __tablename__ = "Notification"

    id: Mapped[str] = pk()
    userId: Mapped[str | None] = mapped_column(
        String, ForeignKey("User.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String, default="SYSTEM")
    link: Mapped[str | None] = mapped_column(String, nullable=True)
    isRead: Mapped[bool] = mapped_column(Boolean, default=False)
    readAt: Mapped[datetime | None] = mapped_column(PrismaDateTime, nullable=True)
    createdAt: Mapped[datetime] = created()


class SupportTicket(Base):
    __tablename__ = "SupportTicket"

    id: Mapped[str] = pk()
    ticketRef: Mapped[str] = mapped_column(String, unique=True, index=True)
    userId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id"), nullable=True)
    name: Mapped[str] = mapped_column(String)
    phone: Mapped[str] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str] = mapped_column(String, default="GENERAL")
    subject: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="OPEN", index=True)
    priority: Mapped[str] = mapped_column(String, default="NORMAL")
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    user: Mapped["User | None"] = relationship()


class ActivityLog(Base):
    __tablename__ = "ActivityLog"

    id: Mapped[str] = pk()
    actorId: Mapped[str | None] = mapped_column(String, ForeignKey("User.id"), nullable=True)
    action: Mapped[str] = mapped_column(String)
    entityType: Mapped[str | None] = mapped_column(String, nullable=True)
    entityId: Mapped[str | None] = mapped_column(String, nullable=True)
    message: Mapped[str] = mapped_column(Text)
    createdAt: Mapped[datetime] = created()

    actor: Mapped["User | None"] = relationship()


class LoginActivity(Base):
    __tablename__ = "LoginActivity"

    id: Mapped[str] = pk()
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), index=True)
    device: Mapped[str | None] = mapped_column(String, nullable=True)
    ipAddress: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="SUCCESS")
    createdAt: Mapped[datetime] = created()


class Setting(Base):
    __tablename__ = "Setting"

    id: Mapped[str] = mapped_column(String, primary_key=True, default="global")
    platformName: Mapped[str] = mapped_column(String, default="GO-GO Ride")
    platformEmail: Mapped[str] = mapped_column(String, default="support@gogoride.com")
    contactNumber: Mapped[str] = mapped_column(String, default="+91 12345 43210")
    address: Mapped[str] = mapped_column(
        String, default="123, Transport Office Road, Kolkata, West Bengal - 700001"
    )
    timezone: Mapped[str] = mapped_column(String, default="Asia/Kolkata")
    currency: Mapped[str] = mapped_column(String, default="INR")
    dateFormat: Mapped[str] = mapped_column(String, default="DD MMM YYYY")
    timeFormat: Mapped[str] = mapped_column(String, default="12h")
    updatedAt: Mapped[datetime] = updated()
