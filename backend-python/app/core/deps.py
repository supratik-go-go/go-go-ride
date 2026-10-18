"""Authentication dependencies."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.enums import ADMIN_ROLES, Role
from app.core.errors import ApiError
from app.core.security import decode_access_token
from app.db.models import User
from app.db.session import get_db

# auto_error=False so a missing header raises our own 401 envelope.
bearer_scheme = HTTPBearer(auto_error=False, description="Paste the accessToken from a login response.")

DbSession = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def _load_user(db: Session, token: str) -> User:
    payload = decode_access_token(token)
    user = db.get(User, payload.get("sub"))
    if user is None:
        raise ApiError.unauthorized("Account no longer exists")
    if user.status != "ACTIVE":
        raise ApiError.forbidden(f"Account is {user.status.lower()}")
    return user


def current_user(db: DbSession, credentials: Credentials) -> User:
    if credentials is None or not credentials.credentials:
        raise ApiError.unauthorized()
    return _load_user(db, credentials.credentials)


def optional_user(db: DbSession, credentials: Credentials) -> User | None:
    """Attaches the user when a token is present, but never rejects."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        return _load_user(db, credentials.credentials)
    except ApiError:
        return None


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]


def is_admin(user: User | None) -> bool:
    return user is not None and user.role in {r.value for r in ADMIN_ROLES}


def require_roles(*roles: Role):
    allowed = {r.value for r in roles}

    def dependency(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise ApiError.forbidden()
        return user

    return dependency


require_admin = require_roles(Role.ADMIN, Role.SUPER_ADMIN)
require_super_admin = require_roles(Role.SUPER_ADMIN)
require_owner = require_roles(Role.BUS_OWNER, Role.ADMIN, Role.SUPER_ADMIN)

AdminUser = Annotated[User, Depends(require_admin)]
SuperAdminUser = Annotated[User, Depends(require_super_admin)]
OwnerUser = Annotated[User, Depends(require_owner)]


def client_context(request: Request) -> dict[str, str | None]:
    """Device and IP recorded on the login activity trail."""
    return {
        "device": request.headers.get("user-agent"),
        "ip": request.client.host if request.client else None,
    }


ClientContext = Annotated[dict, Depends(client_context)]
