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

try:
    import threading as _threading

    _init_lock = _threading.Lock()
except Exception:  # pragma: no cover - threading is always available
    _init_lock = None


def is_configured() -> bool:
    if settings.FIREBASE_CREDENTIALS_PATH and Path(settings.FIREBASE_CREDENTIALS_PATH).exists():
        return True
    import os

    return bool(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))


def _ensure_init() -> None:
    """Initialize the Admin SDK exactly once, safe under concurrent requests.

    Uvicorn runs sync endpoints in a threadpool, so two simultaneous first-time
    Firebase calls could otherwise both reach initialize_app() — the loser used
    to crash with "The default Firebase app already exists".
    """
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

    try:
        firebase_admin.get_app()  # already initialized -> nothing to do
        if _init_error:
            raise RuntimeError(_init_error)
        return
    except ValueError:
        pass  # no app yet; fall through and create it

    def _do_init() -> None:
        try:
            firebase_admin.get_app()
            return
        except ValueError:
            pass
        if settings.FIREBASE_CREDENTIALS_PATH:
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()  # Application Default Credentials

    try:
        if _init_lock is not None:
            with _init_lock:
                _do_init()
        else:
            _do_init()
    except ValueError as exc:
        # Lost a startup race with another thread: the app exists now, use it.
        if "already exists" not in str(exc):
            _init_error = str(exc)
            raise RuntimeError(_init_error) from exc
    except Exception as exc:  # noqa: BLE001
        _init_error = str(exc)
        raise RuntimeError(_init_error) from exc


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


def delete_user(uid: str) -> None:
    """Best-effort Firebase user delete (used when a MedRec account is removed)."""
    if not uid or not is_configured():
        return
    _ensure_init()
    from firebase_admin import auth as fb_auth

    fb_auth.delete_user(uid)
