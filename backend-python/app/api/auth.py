"""Registration, password and OTP sign-in, token rotation."""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from app.core.config import settings
from app.core.deps import ClientContext, CurrentUser, DbSession
from app.core.errors import ApiError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    generate_otp,
    hash_code,
    hash_password,
    hash_token,
    verify_code,
    verify_password,
)
from app.db.models import LoginActivity, OtpCode, RefreshToken, User
from app.db.types import utcnow
from app.schemas.common import Empty, Envelope
from app.schemas.requests import (
    ChangePasswordBody,
    LoginBody,
    LogoutBody,
    OtpRequestBody,
    OtpVerifyBody,
    RefreshBody,
    RegisterBody,
)
from app.schemas.responses import AuthSession, OtpSession, TokenPair, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger("gogoride")


def issue_session(db: "DbSession", user: User, ctx: dict) -> dict:
    access = create_access_token(user.id, user.role, user.phone)
    refresh, expires = create_refresh_token(user.id)

    db.add(RefreshToken(userId=user.id, tokenHash=hash_token(refresh), expiresAt=expires))
    user.lastLoginAt = utcnow()
    db.add(LoginActivity(userId=user.id, device=ctx.get("device"), ipAddress=ctx.get("ip"), status="SUCCESS"))
    db.commit()
    db.refresh(user)

    return {"user": user, "accessToken": access, "refreshToken": refresh}


@router.post(
    "/register",
    response_model=Envelope[AuthSession],
    status_code=201,
    summary="Create an account with a password",
)
def register(body: RegisterBody, db: DbSession, ctx: ClientContext):
    if db.scalar(select(User).where(User.phone == body.phone)):
        raise ApiError.conflict("An account with this mobile number already exists")
    if body.email and db.scalar(select(User).where(User.email == body.email)):
        raise ApiError.conflict("An account with this email already exists")

    user = User(
        name=body.name,
        phone=body.phone,
        email=body.email,
        role=body.role,
        passwordHash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"message": "Account created successfully", "data": issue_session(db, user, ctx)}


@router.post("/login", response_model=Envelope[AuthSession], summary="Sign in with phone and password")
def login(body: LoginBody, db: DbSession, ctx: ClientContext):
    user = db.scalar(select(User).where(User.phone == body.phone))
    if user is None or not user.passwordHash:
        raise ApiError.unauthorized("Invalid mobile number or password")

    if not verify_password(body.password, user.passwordHash):
        db.add(
            LoginActivity(userId=user.id, device=ctx.get("device"), ipAddress=ctx.get("ip"), status="FAILED")
        )
        db.commit()
        raise ApiError.unauthorized("Invalid mobile number or password")

    if user.status != "ACTIVE":
        raise ApiError.forbidden(f"Account is {user.status.lower()}")

    return {"message": "Logged in successfully", "data": issue_session(db, user, ctx)}


@router.post(
    "/otp/request",
    response_model=Envelope[dict],
    summary="Send a 6-digit login code",
    description=(
        "In development the code is also returned as `devCode` and logged to the server "
        "console, so the flow can be tested without an SMS gateway."
    ),
)
def request_otp(body: OtpRequestBody, db: DbSession):
    recent_count = db.scalar(
        select(func.count(OtpCode.id)).where(
            OtpCode.phone == body.phone, OtpCode.createdAt >= utcnow() - timedelta(minutes=1)
        )
    )
    if (recent_count or 0) >= 3:
        raise ApiError.too_many("Please wait a minute before requesting another code")

    code = generate_otp()
    expires_at = utcnow() + timedelta(minutes=settings.otp_expiry_minutes)
    db.add(
        OtpCode(phone=body.phone, codeHash=hash_code(code), purpose=body.purpose, expiresAt=expires_at)
    )
    db.commit()

    logger.info("[otp] %s -> %s (expires %s)", body.phone, code, expires_at.isoformat())

    data: dict = {"phone": body.phone, "expiresInSeconds": settings.otp_expiry_minutes * 60}
    if settings.echo_otp:
        data["devCode"] = code
    return {"message": "Verification code sent", "data": data}


@router.post(
    "/otp/verify",
    response_model=Envelope[OtpSession],
    summary="Verify the code and sign in",
    description="Creates the account automatically if the phone number is new.",
)
def verify_otp(body: OtpVerifyBody, db: DbSession, ctx: ClientContext):
    record = db.scalar(
        select(OtpCode)
        .where(
            OtpCode.phone == body.phone,
            OtpCode.purpose == body.purpose,
            OtpCode.consumedAt.is_(None),
        )
        .order_by(OtpCode.createdAt.desc())
    )

    if record is None:
        raise ApiError.bad_request("Request a new verification code")
    if record.expiresAt < utcnow():
        raise ApiError.bad_request("This code has expired")
    if record.attempts >= settings.otp_max_attempts:
        raise ApiError.too_many("Too many incorrect attempts, request a new code")

    if not verify_code(body.code, record.codeHash):
        record.attempts += 1
        db.commit()
        raise ApiError.bad_request("Incorrect verification code")

    record.consumedAt = utcnow()

    user = db.scalar(select(User).where(User.phone == body.phone))
    is_new_user = False

    if user is None:
        # The OTP doubles as sign-up: the phone is proven at this point.
        user = User(
            name=(body.name or "").strip() or f"Rider {body.phone[-4:]}",
            phone=body.phone,
            role=body.role or "PASSENGER",
            phoneVerified=True,
        )
        db.add(user)
        is_new_user = True
    elif not user.phoneVerified:
        user.phoneVerified = True

    db.commit()
    db.refresh(user)

    if user.status != "ACTIVE":
        raise ApiError.forbidden(f"Account is {user.status.lower()}")

    session = issue_session(db, user, ctx)
    return {
        "message": "Welcome to GO-GO Ride" if is_new_user else "Logged in successfully",
        "data": {**session, "isNewUser": is_new_user},
    }


@router.post(
    "/refresh",
    response_model=Envelope[TokenPair],
    summary="Exchange a refresh token for a new pair",
    description="The presented refresh token is revoked (rotation).",
)
def refresh(body: RefreshBody, db: DbSession, request: Request):
    payload = decode_refresh_token(body.refreshToken)
    stored = db.scalar(select(RefreshToken).where(RefreshToken.tokenHash == hash_token(body.refreshToken)))

    if stored is None or stored.revokedAt is not None or stored.expiresAt < utcnow():
        raise ApiError.unauthorized("Session expired, please sign in again")

    user = db.get(User, payload.get("sub"))
    if user is None or user.status != "ACTIVE":
        raise ApiError.unauthorized("Account unavailable")

    stored.revokedAt = utcnow()
    db.commit()

    session = issue_session(
        db, user, {"device": request.headers.get("user-agent"), "ip": request.client.host if request.client else None}
    )
    return {
        "message": "Session refreshed",
        "data": {"accessToken": session["accessToken"], "refreshToken": session["refreshToken"]},
    }


@router.post("/logout", response_model=Envelope[Empty], summary="Revoke one session, or every session")
def logout(body: LogoutBody, db: DbSession, user: CurrentUser):
    query = select(RefreshToken).where(RefreshToken.revokedAt.is_(None))
    if body.refreshToken:
        query = query.where(RefreshToken.tokenHash == hash_token(body.refreshToken))
    else:
        query = query.where(RefreshToken.userId == user.id)

    for token in db.scalars(query):
        token.revokedAt = utcnow()
    db.commit()
    return {"message": "Logged out", "data": None}


@router.get("/me", response_model=Envelope[UserOut], summary="Current user")
def me(user: CurrentUser):
    return {"data": user}


@router.post(
    "/change-password",
    response_model=Envelope[Empty],
    summary="Change password (revokes other sessions)",
)
def change_password(body: ChangePasswordBody, db: DbSession, user: CurrentUser):
    if user.passwordHash:
        if not body.currentPassword:
            raise ApiError.bad_request("Current password is required")
        if not verify_password(body.currentPassword, user.passwordHash):
            raise ApiError.bad_request("Current password is incorrect")

    user.passwordHash = hash_password(body.newPassword)
    for token in db.scalars(
        select(RefreshToken).where(RefreshToken.userId == user.id, RefreshToken.revokedAt.is_(None))
    ):
        token.revokedAt = utcnow()
    db.commit()

    return {"message": "Password updated, please sign in again", "data": None}
