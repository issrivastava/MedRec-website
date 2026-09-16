"""Verify Firebase ID tokens using the Admin SDK.

Configured via FIREBASE_CREDENTIALS_PATH (service-account JSON file) or the
standard GOOGLE_APPLICATION_CREDENTIALS env var. If neither is set, Firebase
login stays disabled and POST /api/auth/firebase returns 503 — the built-in
local login keeps working for development.
"""
from __future__ import annotations
from pathlib import Path

from app.core.config import settings

_init_error: str | None = None


def is_configured() -> bool:
    if settings.FIREBASE_CREDENTIALS_PATH and Path(settings.FIREBASE_CREDENTIALS_PATH).exists():
        return True
    import os

    return bool(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))


def _ensure_init() -> None:
    global _init_error
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as exc:
        _init_error = (
            "firebase-admin is not installed in this Python environment "
            "(run: pip install -r requirements.txt with Python 3.11)"
        )
        raise RuntimeError(_init_error) from exc

    if firebase_admin._apps:
        if _init_error:
            raise RuntimeError(_init_error)
        return
    try:
        if settings.FIREBASE_CREDENTIALS_PATH:
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()  # Application Default Credentials
    except Exception as exc:  # noqa: BLE001
        _init_error = str(exc)
        raise RuntimeError(_init_error)


def verify_id_token(id_token: str) -> dict:
    """Returns {uid, email, name, picture}. Raises RuntimeError/ValueError."""
    if not is_configured():
        raise RuntimeError(
            "Firebase login is not configured: set FIREBASE_CREDENTIALS_PATH "
            "to your service-account JSON (see README)."
        )
    _ensure_init()
    from firebase_admin import auth as fb_auth

    decoded = fb_auth.verify_id_token(id_token)
    email = (decoded.get("email") or "").lower()
    if not email:
        raise ValueError("Firebase token has no email (enable Email provider)")
    return {
        "uid": decoded.get("uid", ""),
        "email": email,
        "name": decoded.get("name") or "",
        "picture": decoded.get("picture") or "",
    }
