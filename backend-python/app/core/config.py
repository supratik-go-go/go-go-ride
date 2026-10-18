"""Runtime configuration, loaded from the environment / .env file."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- server ---
    environment: str = "development"
    port: int = 8000
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # --- database ---
    # Points at the Node backend's SQLite file by default: the tables and
    # columns are named identically, so both services can serve one database.
    database_url: str = "sqlite:///../backend/prisma/dev.db"

    # --- auth ---
    jwt_access_secret: str = "change-me-access-secret"
    jwt_refresh_secret: str = "change-me-refresh-secret"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    # --- otp ---
    otp_expiry_minutes: int = 5
    otp_dev_echo: bool = True
    otp_max_attempts: int = 5

    # --- uploads ---
    upload_dir: str = "uploads"
    max_upload_mb: int = 5

    # --- business rules ---
    bus_exception_min_days: int = 5

    @property
    def is_prod(self) -> bool:
        return self.environment == "production"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def echo_otp(self) -> bool:
        """Never leak the OTP in production, whatever the flag says."""
        return self.otp_dev_echo and not self.is_prod


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
