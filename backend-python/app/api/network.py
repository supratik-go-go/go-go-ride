"""Bus stops and routes - the network the timetables hang off."""
from __future__ import annotations

import math

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession
from app.core.enums import RecordStatus
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.db.models import Bus, BusStop, BusStopage, Route, RouteStop
from app.schemas.common import Empty, Envelope, PageEnvelope
from app.schemas.requests import RouteBody, RouteUpdateBody, StopBody, StopUpdateBody
from app.schemas.responses import PopularRoute, RouteOut, StopListItem, StopNearby, StopOut
from app.services.common import log_activity

stops_router = APIRouter(prefix="/stops", tags=["Bus stops"])
routes_router = APIRouter(prefix="/routes", tags=["Routes"])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    radius = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def _stop_counts(db, stop_ids: list[str]) -> tuple[dict, dict]:
    if not stop_ids:
        return {}, {}
    buses = dict(
        db.execute(
            select(BusStopage.stopId, func.count(BusStopage.id))
            .where(BusStopage.stopId.in_(stop_ids))
            .group_by(BusStopage.stopId)
        ).all()
    )
    routes = dict(
        db.execute(
            select(RouteStop.stopId, func.count(RouteStop.id))
            .where(RouteStop.stopId.in_(stop_ids))
            .group_by(RouteStop.stopId)
        ).all()
    )
    return buses, routes


# ------------------------------------------------------------------- stops


@stops_router.get(
    "", response_model=PageEnvelope[StopListItem], summary="Stop directory / autocomplete"
)
def list_stops(
    db: DbSession,
    page: PageDep,
    city: str | None = None,
    status: RecordStatus | None = None,
):
    filters = []
    if page.search:
        filters.append(or_(BusStop.name.contains(page.search), BusStop.area.contains(page.search)))
    if city:
        filters.append(BusStop.city == city)
    if status:
        filters.append(BusStop.status == status.value)

    total = db.scalar(select(func.count(BusStop.id)).where(*filters)) or 0
    stops = list(
        db.scalars(
            select(BusStop).where(*filters).order_by(BusStop.name).offset(page.skip).limit(page.limit)
        )
    )
    bus_counts, route_counts = _stop_counts(db, [s.id for s in stops])

    data = [
        {
            **{c: getattr(s, c) for c in ("id", "name", "area", "city", "latitude", "longitude", "status")},
            "busesAvailable": bus_counts.get(s.id, 0),
            "routes": route_counts.get(s.id, 0),
        }
        for s in stops
    ]
    return {"data": data, "meta": meta(total, page)}


@stops_router.get(
    "/nearby",
    response_model=Envelope[list[StopNearby]],
    summary="Bus stops near a coordinate",
    description="Great-circle distance, nearest first. Powers the 'Bus Stops Near You' tile.",
)
def nearby_stops(
    db: DbSession,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radiusKm: float = Query(3, gt=0, le=50),
    limit: int = Query(20, ge=1, le=50),
):
    stops = list(
        db.scalars(
            select(BusStop).where(
                BusStop.status == "ACTIVE",
                BusStop.latitude.is_not(None),
                BusStop.longitude.is_not(None),
            )
        )
    )
    bus_counts, route_counts = _stop_counts(db, [s.id for s in stops])

    nearby = []
    for stop in stops:
        distance = round(haversine_km(lat, lng, stop.latitude, stop.longitude), 2)
        if distance > radiusKm:
            continue
        nearby.append(
            {
                **{c: getattr(stop, c) for c in ("id", "name", "area", "city", "latitude", "longitude", "status")},
                "busesAvailable": bus_counts.get(stop.id, 0),
                "routes": route_counts.get(stop.id, 0),
                "distanceKm": distance,
            }
        )

    nearby.sort(key=lambda s: s["distanceKm"])
    nearby = nearby[:limit]
    return {"message": f"{len(nearby)} stops within {radiusKm} km", "data": nearby}


@stops_router.get("/{stop_id}", response_model=Envelope[dict], summary="Stop with the buses that serve it")
def get_stop(stop_id: str, db: DbSession):
    stop = db.get(BusStop, stop_id)
    if stop is None:
        raise ApiError.not_found("Bus stop not found")

    stopages = db.scalars(
        select(BusStopage)
        .where(BusStopage.stopId == stop_id)
        .options(selectinload(BusStopage.bus).selectinload(Bus.route))
        .order_by(BusStopage.departureTime)
    ).all()

    buses = [
        {
            "id": s.bus.id,
            "busNumber": s.bus.busNumber,
            "busName": s.bus.busName,
            "type": s.bus.type,
            "category": s.bus.category,
            "fare": s.bus.fare,
            "status": s.bus.status,
            "ratingAvg": s.bus.ratingAvg,
            "route": {"id": s.bus.route.id, "name": s.bus.route.name, "routeNumber": s.bus.route.routeNumber}
            if s.bus.route
            else None,
            "arrivalTime": s.arrivalTime,
            "departureTime": s.departureTime,
        }
        for s in stopages
        if s.bus.status == "APPROVED"
    ]

    payload = {c: getattr(stop, c) for c in ("id", "name", "area", "city", "latitude", "longitude", "status")}
    payload["buses"] = buses
    return {"data": payload}


@stops_router.post("", response_model=Envelope[StopOut], status_code=201, summary="Add a stop (admin)")
def create_stop(body: StopBody, db: DbSession, _admin: AdminUser):
    stop = BusStop(**{**body.model_dump(), "status": body.status.value})
    db.add(stop)
    db.commit()
    db.refresh(stop)
    return {"message": "Bus stop added", "data": stop}


@stops_router.patch("/{stop_id}", response_model=Envelope[StopOut], summary="Update a stop (admin)")
def update_stop(stop_id: str, body: StopUpdateBody, db: DbSession, _admin: AdminUser):
    stop = db.get(BusStop, stop_id)
    if stop is None:
        raise ApiError.not_found("Bus stop not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(stop, field, value.value if hasattr(value, "value") else value)
    db.commit()
    db.refresh(stop)
    return {"message": "Bus stop updated", "data": stop}


@stops_router.delete("/{stop_id}", response_model=Envelope[Empty], summary="Delete a stop (admin)")
def delete_stop(stop_id: str, db: DbSession, _admin: AdminUser):
    stop = db.get(BusStop, stop_id)
    if stop is None:
        raise ApiError.not_found("Bus stop not found")
    db.delete(stop)
    db.commit()
    return {"message": "Bus stop deleted", "data": None}


# ------------------------------------------------------------------ routes

ROUTE_LOADERS = (
    selectinload(Route.fromStop),
    selectinload(Route.toStop),
    selectinload(Route.stops).selectinload(RouteStop.stop),
)


def _route_payload(db, route: Route, bus_counts: dict | None = None) -> dict:
    count = (
        bus_counts.get(route.id, 0)
        if bus_counts is not None
        else (db.scalar(select(func.count(Bus.id)).where(Bus.routeId == route.id)) or 0)
    )
    return {
        "id": route.id,
        "name": route.name,
        "routeNumber": route.routeNumber,
        "distanceKm": route.distanceKm,
        "status": route.status,
        "fromStop": route.fromStop,
        "toStop": route.toStop,
        "stops": route.stops,
        "totalBuses": count,
    }


def _bus_counts(db, route_ids: list[str]) -> dict:
    if not route_ids:
        return {}
    return dict(
        db.execute(
            select(Bus.routeId, func.count(Bus.id))
            .where(Bus.routeId.in_(route_ids))
            .group_by(Bus.routeId)
        ).all()
    )


@routes_router.get("", response_model=PageEnvelope[RouteOut], summary="List routes")
def list_routes(db: DbSession, page: PageDep, status: RecordStatus | None = None):
    filters = []
    if status:
        filters.append(Route.status == status.value)
    if page.search:
        filters.append(
            or_(Route.name.contains(page.search), Route.routeNumber.contains(page.search.upper()))
        )

    total = db.scalar(select(func.count(Route.id)).where(*filters)) or 0
    routes = list(
        db.scalars(
            select(Route)
            .where(*filters)
            .options(*ROUTE_LOADERS)
            .order_by(Route.routeNumber)
            .offset(page.skip)
            .limit(page.limit)
        ).unique()
    )
    counts = _bus_counts(db, [r.id for r in routes])
    return {"data": [_route_payload(db, r, counts) for r in routes], "meta": meta(total, page)}


@routes_router.get(
    "/popular",
    response_model=Envelope[list[PopularRoute]],
    summary="Popular routes - the homepage strip",
)
def popular_routes(db: DbSession, limit: int = Query(6, ge=1, le=20)):
    routes = list(db.scalars(select(Route).where(Route.status == "ACTIVE").options(*ROUTE_LOADERS)).unique())
    counts = _bus_counts(db, [r.id for r in routes])
    routes.sort(key=lambda r: counts.get(r.id, 0), reverse=True)

    data = []
    for route in routes[:limit]:
        first = route.stops[0].stop.name if route.stops else None
        last = route.stops[-1].stop.name if route.stops else None
        data.append(
            {
                "id": route.id,
                "name": route.name,
                "routeNumber": route.routeNumber,
                "from": route.fromStop.name if route.fromStop else first,
                "to": route.toStop.name if route.toStop else last,
                "distanceKm": route.distanceKm,
                "totalBuses": counts.get(route.id, 0),
            }
        )
    return {"data": data}


@routes_router.get("/{route_id}", response_model=Envelope[dict], summary="Route with stops and buses")
def get_route(route_id: str, db: DbSession):
    route = db.scalar(select(Route).where(Route.id == route_id).options(*ROUTE_LOADERS))
    if route is None:
        raise ApiError.not_found("Route not found")

    # Envelope[dict] has no schema to serialise the ORM stops with, so run the
    # payload through RouteOut first (same shape as the list endpoint).
    payload = RouteOut.model_validate(_route_payload(db, route)).model_dump(mode="json")
    payload["buses"] = [
        {
            "id": b.id,
            "busNumber": b.busNumber,
            "busName": b.busName,
            "type": b.type,
            "category": b.category,
            "fare": b.fare,
            "ratingAvg": b.ratingAvg,
        }
        for b in db.scalars(
            select(Bus).where(Bus.routeId == route_id, Bus.status == "APPROVED")
        )
    ]
    return {"data": payload}


@routes_router.post("", response_model=Envelope[RouteOut], status_code=201, summary="Create a route (admin)")
def create_route(body: RouteBody, db: DbSession, admin: AdminUser):
    data = body.model_dump(exclude={"stops"})
    data["status"] = body.status.value
    route = Route(**data)
    db.add(route)
    db.flush()

    for index, stop in enumerate(body.stops or [], start=1):
        db.add(
            RouteStop(
                routeId=route.id,
                stopId=stop.stopId,
                sequence=index,
                distanceFromStartKm=stop.distanceFromStartKm,
            )
        )

    log_activity(
        db,
        actor_id=admin.id,
        action="ROUTE_CREATED",
        entity_type="ROUTE",
        entity_id=route.id,
        message=f"Route {route.routeNumber} created ({route.name})",
        commit=False,
    )
    db.commit()
    db.refresh(route)
    return {"message": "Route created", "data": _route_payload(db, route)}


@routes_router.patch("/{route_id}", response_model=Envelope[RouteOut], summary="Update a route (admin)")
def update_route(route_id: str, body: RouteUpdateBody, db: DbSession, admin: AdminUser):
    route = db.get(Route, route_id)
    if route is None:
        raise ApiError.not_found("Route not found")

    for field, value in body.model_dump(exclude_unset=True, exclude={"stops"}).items():
        setattr(route, field, value.value if hasattr(value, "value") else value)

    if body.stops is not None:
        for existing in list(route.stops):
            db.delete(existing)
        db.flush()
        for index, stop in enumerate(body.stops, start=1):
            db.add(
                RouteStop(
                    routeId=route.id,
                    stopId=stop.stopId,
                    sequence=index,
                    distanceFromStartKm=stop.distanceFromStartKm,
                )
            )

    log_activity(
        db,
        actor_id=admin.id,
        action="ROUTE_UPDATED",
        entity_type="ROUTE",
        entity_id=route.id,
        message=f"Route {route.routeNumber} updated ({route.name})",
        commit=False,
    )
    db.commit()
    db.refresh(route)
    return {"message": "Route updated", "data": _route_payload(db, route)}


@routes_router.delete("/{route_id}", response_model=Envelope[Empty], summary="Delete a route (admin)")
def delete_route(route_id: str, db: DbSession, _admin: AdminUser):
    route = db.get(Route, route_id)
    if route is None:
        raise ApiError.not_found("Route not found")
    db.delete(route)
    db.commit()
    return {"message": "Route deleted", "data": None}
