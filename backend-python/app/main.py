"""GO-GO Ride API - FastAPI application.

    uvicorn app.main:app --reload --port 8000

Interactive docs at /docs (Swagger UI) and /redoc, generated from the route
signatures, so they cannot drift from the implementation.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api import admin, alarms, auth, bookings, buses, cars, messaging, network, platform, profile
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.storage import UPLOAD_ROOT
from app.db.models import Base
from app.db.session import engine
from app.jobs.alarm_scheduler import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("gogoride")

DESCRIPTION = """
**Smart local transport for West Bengal** - bus timetable search, arrival alarms,
owner-listed buses with admin verification, local cars, shared rides and bookings.

One API serves all three surfaces: the passenger app, the public website and the admin panel.

### Trying it out
1. Run `POST /auth/login` with a seeded account below.
2. Copy `data.accessToken` from the response.
3. Click **Authorize** at the top right and paste it.
4. Every padlocked endpoint is now callable.

| Role | Phone | Password |
| --- | --- | --- |
| Super admin | `9876500001` | `Admin@123` |
| Admin | `9876500002` | `Admin@123` |
| Bus owner | `9876543210` | `Owner@123` |
| Passenger | `9123456789` | `Rider@123` |
| Driver | `9000011223` | `Driver@123` |

### Conventions
- Every response is `{ success, message, data }`; list endpoints add `meta` with pagination.
- Times are `HH:mm` (24h); responses also carry a `...12h` field for display.
- Dates are `YYYY-MM-DD`, stored at midnight UTC.
- Phone numbers are 10 digits; `+91` is accepted and stripped.
"""

limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all is a no-op against a database Prisma already migrated.
    Base.metadata.create_all(bind=engine)
    scheduler = start_scheduler()
    logger.info("GO-GO Ride API ready on port %s%s", settings.port, settings.api_prefix)
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="GO-GO Ride API",
    version="1.0.0",
    description=DESCRIPTION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    swagger_ui_parameters={
        "persistAuthorization": True,
        "displayRequestDuration": True,
        "docExpansion": "none",
        "filter": True,
    },
    openapi_tags=[
        {"name": "Platform", "description": "Health, public counters and settings"},
        {"name": "Auth", "description": "Registration, password and OTP sign-in, token rotation"},
        {"name": "Buses", "description": "Search, details, owner submission and documents"},
        {"name": "Routes", "description": "Route network"},
        {"name": "Bus stops", "description": "Stop directory and nearby search"},
        {"name": "Alarms", "description": "Bus arrival reminders"},
        {"name": "Profile", "description": "Profile, favourites, recent searches, login history"},
        {"name": "Local cars", "description": "Call-the-driver directory"},
        {"name": "Running Car", "description": "Shared rides and the launch waitlist"},
        {"name": "Bookings", "description": "Bus, ride and local car bookings"},
        {"name": "Notifications", "description": "In-app feed and announcements"},
        {"name": "Support", "description": "Help & Support tickets"},
        {"name": "Admin", "description": "Dashboard, approvals, users, reports and settings"},
    ],
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(_request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "message": "Too many requests, please slow down",
            "code": "TOO_MANY_REQUESTS",
        },
    )


# The docs pages call the API from the API's own origin, so same-origin is
# always allowed no matter which host or port the server runs on.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

# Uploaded documents / photos.
Path(UPLOAD_ROOT).mkdir(parents=True, exist_ok=True)
app.mount(f"/{settings.upload_dir}", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

for router in (
    platform.router,
    auth.router,
    profile.router,
    buses.router,
    network.routes_router,
    network.stops_router,
    alarms.router,
    cars.cars_router,
    cars.rides_router,
    bookings.router,
    messaging.notifications_router,
    messaging.support_router,
    admin.router,
):
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
def index():
    return {
        "name": "GO-GO Ride API",
        "tagline": "Smart local transport for West Bengal",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
        "openapi": f"{settings.api_prefix}/openapi.json",
    }
