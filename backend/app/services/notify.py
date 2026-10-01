"""In-app notifications + optional email (SMTP) and SMS webhook. Best-effort, never raises.

Batch-1 perf: the in-app DB row is written synchronously (fast, needed for
unread badges), but email/SMS delivery runs in a daemon thread so API
responses (book appointment, visit note, chat) return instantly instead of
blocking up to 10s on SMTP/webhook timeouts.
"""
from __future__ import annotations
import threading
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.tables import Notification, PatientProfile


def _fire_and_forget(fn, *args, **kwargs) -> None:
    """Run fn in a daemon thread; never raises, never blocks the request."""
    try:
        t = threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True)
        t.start()
    except Exception:
        pass


def notify(db: Session, user_id: str, kind: str, title: str, body: str | None = None,
           link: str | None = None, ref: str | None = None) -> Notification | None:
    try:
        if ref and db.query(Notification).filter_by(user_id=user_id, ref=ref).first():
            return None  # already sent (dedup)
        n = Notification(user_id=user_id, kind=kind, title=title, body=body, link=link, ref=ref)
        db.add(n)
        db.commit()
        db.refresh(n)
        # Email goes off-request: capture plain values (no session use in thread).
        try:
            to_email = _email_for_bg(db, user_id)
        except Exception:
            to_email = None
        if to_email:
            _fire_and_forget(_send_email_to, to_email, title, body)
        # Wake WS badge loops for instant navbar update (best-effort).
        try:
            from app.api.routes.realtime import bump_badges as _bump
            _bump(user_id)
        except Exception:
            pass
        return n
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None


def _email_for_bg(db: Session, user_id: str) -> str | None:
    """Fetch the recipient email synchronously for the background sender."""
    if not (settings.MAIL_HOST and settings.MAIL_FROM):
        return None
    from app.models.tables import User
    user = db.query(User).filter_by(id=user_id).first()
    return user.email if user else None


def _send_email_to(to_email: str, subject: str, body: str | None) -> None:
    """Thread-safe SMTP send (no DB session — plain address only)."""
    if not (settings.MAIL_HOST and settings.MAIL_FROM):
        return
    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = f"[MedRec] {subject}"
        msg["From"] = settings.MAIL_FROM
        msg["To"] = to_email
        msg.set_content(body or subject)
        with smtplib.SMTP(settings.MAIL_HOST, settings.MAIL_PORT, timeout=10) as s:
            s.starttls()
            if settings.MAIL_USER:
                s.login(settings.MAIL_USER, settings.MAIL_PASSWORD)
            s.send_message(msg)
    except Exception:
        pass


def notify_phone_sms(to_phone: str, message: str) -> None:
    if not settings.SMS_WEBHOOK_URL or not to_phone:
        return
    _fire_and_forget(_send_sms_sync, to_phone, message)


def _send_sms_sync(to_phone: str, message: str) -> None:
    try:
        import httpx
        httpx.post(settings.SMS_WEBHOOK_URL, json={"to": to_phone, "message": message}, timeout=10)
    except Exception:
        pass


def _send_email(db: Session, user_id: str, subject: str, body: str | None) -> None:
    """Back-compat wrapper: resolves address sync, sends off-request."""
    try:
        to_email = _email_for_bg(db, user_id)
    except Exception:
        return
    if to_email:
        _fire_and_forget(_send_email_to, to_email, subject, body)


def patient_phone(db: Session, patient_id: str) -> str | None:
    try:
        prof = db.query(PatientProfile).filter_by(user_id=patient_id).first()
        return prof.phone if prof and prof.phone else None
    except Exception:
        return None
