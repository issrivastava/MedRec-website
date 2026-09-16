"""In-app notifications + optional email (SMTP) and SMS webhook. Best-effort, never raises."""
from __future__ import annotations
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.tables import Notification, PatientProfile


def notify(db: Session, user_id: str, kind: str, title: str, body: str | None = None,
           link: str | None = None, ref: str | None = None) -> Notification | None:
    try:
        if ref and db.query(Notification).filter_by(user_id=user_id, ref=ref).first():
            return None  # already sent (dedup)
        n = Notification(user_id=user_id, kind=kind, title=title, body=body, link=link, ref=ref)
        db.add(n)
        db.commit()
        db.refresh(n)
        _send_email(db, user_id, title, body)
        return n
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None


def notify_phone_sms(to_phone: str, message: str) -> None:
    if not settings.SMS_WEBHOOK_URL or not to_phone:
        return
    try:
        import httpx
        httpx.post(settings.SMS_WEBHOOK_URL, json={"to": to_phone, "message": message}, timeout=10)
    except Exception:
        pass


def _send_email(db: Session, user_id: str, subject: str, body: str | None) -> None:
    if not (settings.MAIL_HOST and settings.MAIL_FROM):
        return
    try:
        from app.models.tables import User
        import smtplib
        from email.message import EmailMessage

        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return
        msg = EmailMessage()
        msg["Subject"] = f"[MedRec] {subject}"
        msg["From"] = settings.MAIL_FROM
        msg["To"] = user.email
        msg.set_content(body or subject)
        with smtplib.SMTP(settings.MAIL_HOST, settings.MAIL_PORT, timeout=10) as s:
            s.starttls()
            if settings.MAIL_USER:
                s.login(settings.MAIL_USER, settings.MAIL_PASSWORD)
            s.send_message(msg)
    except Exception:
        pass


def patient_phone(db: Session, patient_id: str) -> str | None:
    try:
        prof = db.query(PatientProfile).filter_by(user_id=patient_id).first()
        return prof.phone if prof and prof.phone else None
    except Exception:
        return None
