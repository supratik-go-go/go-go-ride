"""Local-disk uploads. Swap for S3 (or similar) before production."""
from __future__ import annotations

import secrets
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.errors import ApiError

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}

UPLOAD_ROOT = (Path(__file__).resolve().parents[2] / settings.upload_dir).resolve()
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


def save_upload(file: UploadFile, *, folder: str = "misc") -> str:
    """Store the file and return the URL the API will serve it from."""
    if file.content_type not in ALLOWED_TYPES:
        raise ApiError.bad_request("Only JPG, PNG, WEBP and PDF files are allowed")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ApiError.bad_request("Unsupported file extension")

    destination_dir = UPLOAD_ROOT / folder
    destination_dir.mkdir(parents=True, exist_ok=True)

    name = f"{secrets.token_hex(12)}{suffix}"
    destination = destination_dir / name

    size = 0
    with destination.open("wb") as out:
        while chunk := file.file.read(64 * 1024):
            size += len(chunk)
            if size > settings.max_upload_bytes:
                out.close()
                destination.unlink(missing_ok=True)
                raise ApiError.bad_request("File is too large")
            out.write(chunk)

    if size == 0:
        destination.unlink(missing_ok=True)
        raise ApiError.bad_request("The uploaded file is empty")

    return f"/{settings.upload_dir}/{folder}/{name}"
