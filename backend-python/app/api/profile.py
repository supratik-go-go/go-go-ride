"""Profile, favourites, recent searches and login history."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import ApiError
from app.core.responses import PageDep, meta
from app.core.storage import save_upload
from app.db.models import Bus, BusStop, Favorite, LocalCar, LoginActivity, RecentSearch, Route, User
from app.schemas.common import Empty, Envelope, PageEnvelope
from app.schemas.requests import FavoriteBody, ProfileBody
from app.schemas.responses import LoginActivityOut, RecentSearchOut, UserOut

router = APIRouter(prefix="/users", tags=["Profile"])


@router.get("/me", response_model=Envelope[UserOut], summary="My profile")
def get_profile(user: CurrentUser):
    return {"data": user}


@router.patch("/me", response_model=Envelope[UserOut], summary="Update my profile")
def update_profile(body: ProfileBody, db: DbSession, user: CurrentUser):
    updates = body.model_dump(exclude_unset=True)
    if "email" in updates and updates["email"]:
        clash = db.scalar(select(User).where(User.email == updates["email"], User.id != user.id))
        if clash:
            raise ApiError.conflict("An account with this email already exists")
    for field, value in updates.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return {"message": "Profile updated", "data": user}


@router.post("/me/avatar", response_model=Envelope[UserOut], summary="Upload a profile photo")
def upload_avatar(db: DbSession, user: CurrentUser, file: Annotated[UploadFile, File()]):
    user.avatarUrl = save_upload(file, folder="avatars")
    db.commit()
    db.refresh(user)
    return {"message": "Photo updated", "data": user}


@router.get(
    "/me/login-activity",
    response_model=PageEnvelope[LoginActivityOut],
    summary="Login history - device, IP, location",
)
def login_activity(db: DbSession, user: CurrentUser, page: PageDep):
    total = db.scalar(select(func.count(LoginActivity.id)).where(LoginActivity.userId == user.id)) or 0
    items = list(
        db.scalars(
            select(LoginActivity)
            .where(LoginActivity.userId == user.id)
            .order_by(LoginActivity.createdAt.desc())
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    return {"data": items, "meta": meta(total, page)}


# ------------------------------------------------------------- favourites


@router.get(
    "/me/favorites",
    response_model=Envelope[dict],
    summary="Favourites, resolved to live records",
)
def list_favorites(db: DbSession, user: CurrentUser):
    favorites = list(
        db.scalars(
            select(Favorite).where(Favorite.userId == user.id).order_by(Favorite.createdAt.desc())
        )
    )
    ids = {
        kind: [f.itemId for f in favorites if f.itemType == kind]
        for kind in ("BUS", "ROUTE", "STOP", "LOCAL_CAR")
    }

    def fetch(model, keys):
        return list(db.scalars(select(model).where(model.id.in_(keys)))) if keys else []

    buses = [
        {
            "id": b.id,
            "busNumber": b.busNumber,
            "busName": b.busName,
            "type": b.type,
            "fare": b.fare,
            "ratingAvg": b.ratingAvg,
            "route": {"name": b.route.name, "routeNumber": b.route.routeNumber} if b.route else None,
        }
        for b in fetch(Bus, ids["BUS"])
    ]
    routes = [
        {"id": r.id, "name": r.name, "routeNumber": r.routeNumber, "distanceKm": r.distanceKm}
        for r in fetch(Route, ids["ROUTE"])
    ]
    stops = [
        {"id": s.id, "name": s.name, "area": s.area} for s in fetch(BusStop, ids["STOP"])
    ]
    cars = [
        {"id": c.id, "driverName": c.driverName, "phone": c.phone, "area": c.area, "ratingAvg": c.ratingAvg}
        for c in fetch(LocalCar, ids["LOCAL_CAR"])
    ]

    return {
        "data": {
            "buses": buses,
            "routes": routes,
            "stops": stops,
            "localCars": cars,
            "raw": [
                {"id": f.id, "itemType": f.itemType, "itemId": f.itemId} for f in favorites
            ],
        }
    }


@router.post("/me/favorites", response_model=Envelope[dict], status_code=201, summary="Add a favourite")
def add_favorite(body: FavoriteBody, db: DbSession, user: CurrentUser):
    existing = db.scalar(
        select(Favorite).where(
            Favorite.userId == user.id,
            Favorite.itemType == body.itemType.value,
            Favorite.itemId == body.itemId,
        )
    )
    if existing is None:
        existing = Favorite(userId=user.id, itemType=body.itemType.value, itemId=body.itemId)
        db.add(existing)
        db.commit()
        db.refresh(existing)

    return {
        "message": "Added to favourites",
        "data": {"id": existing.id, "itemType": existing.itemType, "itemId": existing.itemId},
    }


@router.delete("/me/favorites", response_model=Envelope[Empty], summary="Remove a favourite")
def remove_favorite(body: FavoriteBody, db: DbSession, user: CurrentUser):
    for favorite in db.scalars(
        select(Favorite).where(
            Favorite.userId == user.id,
            Favorite.itemType == body.itemType.value,
            Favorite.itemId == body.itemId,
        )
    ):
        db.delete(favorite)
    db.commit()
    return {"message": "Removed from favourites", "data": None}


# --------------------------------------------------------- recent searches


@router.get(
    "/me/recent-searches", response_model=Envelope[list[RecentSearchOut]], summary="Recent Searches"
)
def recent_searches(db: DbSession, user: CurrentUser, limit: int = Query(10, ge=1, le=50)):
    items = list(
        db.scalars(
            select(RecentSearch)
            .where(RecentSearch.userId == user.id)
            .order_by(RecentSearch.searchedAt.desc())
            .limit(limit)
        )
    )
    return {"data": items}


@router.delete("/me/recent-searches", response_model=Envelope[Empty], summary="Clear search history")
def clear_searches(db: DbSession, user: CurrentUser):
    for row in db.scalars(select(RecentSearch).where(RecentSearch.userId == user.id)):
        db.delete(row)
    db.commit()
    return {"message": "Search history cleared", "data": None}


@router.delete(
    "/me/recent-searches/{search_id}", response_model=Envelope[Empty], summary="Remove one recent search"
)
def delete_search(search_id: str, db: DbSession, user: CurrentUser):
    row = db.scalar(
        select(RecentSearch).where(RecentSearch.id == search_id, RecentSearch.userId == user.id)
    )
    if row is not None:
        db.delete(row)
        db.commit()
    return {"message": "Removed", "data": None}
