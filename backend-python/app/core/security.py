"""Password hashing, JWTs and one-time codes.

bcrypt and HS256 match the Node service exactly, so hashes written by either
side verify on the other and tokens are interchangeable when the secrets match.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings
from app.core.errors import ApiError

_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def hash_password(plain: str) -> str:
    # bcrypt caps input at 72 bytes; longer passwords are rejected by the schema.
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def hash_code(code: str) -> str:
    return bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt(rounds=8)).decode("utf-8")


def verify_code(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, role: str, phone: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "phone": phone,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_access_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=settings.refresh_token_days)
    token = jwt.encode(
        {"sub": user_id, "iat": int(now.timestamp()), "exp": int(expires.timestamp())},
        settings.jwt_refresh_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, expires.replace(tzinfo=None)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_access_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise ApiError.unauthorized("Invalid or expired token") from exc


def decode_refresh_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_refresh_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise ApiError.unauthorized("Invalid or expired refresh token") from exc


def hash_token(token: str) -> str:
    """Refresh tokens are stored hashed so a database leak cannot replay them."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def random_ref(prefix: str, length: int = 8) -> str:
    return prefix + "".join(secrets.choice(_REF_ALPHABET) for _ in range(length))
