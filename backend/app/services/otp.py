"""Email OTP generation / verification for login and password reset.

Only the SHA-256 hash of the 6-digit code is stored in the DB.
Delivery is via SMTP when MAIL_* is configured; otherwise the code is
logged to the server console and (when OTP_DEV_ECHO is on) echoed back
in the API response so local dev works without an SMTP server.
"""
from __future__ import annotations
import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.tables import OtpCode

VALID_PURPOSES = ("login", "reset", "register")


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _send_email_otp(to_email: str, code: str, purpose: str) -> bool:
    """Try SMTP delivery. Returns True if an SMTP attempt was made."""
    if not (settings.MAIL_HOST and settings.MAIL_FROM):
        print(f"[MedRec OTP] ({purpose}) {to_email}: {code}  [no SMTP configured]", flush=True)
        return False
    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = f"[MedRec] Your verification code: {code}"
        msg["From"] = settings.MAIL_FROM
        msg["To"] = to_email
        msg.set_content(
            f"Your MedRec verification code is: {code}\n\n"
            f"It expires in {settings.OTP_EXPIRE_MINUTES} minutes. "
            "If you did not request this, please ignore this email."
        )
        with smtplib.SMTP(settings.MAIL_HOST, settings.MAIL_PORT, timeout=10) as s:
            s.starttls()
            if settings.MAIL_USER:
                s.login(settings.MAIL_USER, settings.MAIL_PASSWORD)
            s.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 - best effort, log and fall back
        print(f"[MedRec OTP] SMTP send failed for {to_email}: {exc}", flush=True)
        return False


def request_otp(db: Session, email: str, purpose: str) -> dict:
    """Create a fresh OTP row, enforcing resend cooldown. Returns {sent_via, dev_code?}."""
    if purpose not in VALID_PURPOSES:
        raise ValueError("purpose must be login, reset or register")
    email = email.lower().strip()
    now = datetime.utcnow()
    recent = (
        db.query(OtpCode)
        .filter_by(email=email, purpose=purpose, consumed=False)
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if recent and (now - recent.created_at).total_seconds() < settings.OTP_RESEND_SECONDS:
        wait = settings.OTP_RESEND_SECONDS - int((now - recent.created_at).total_seconds())
        raise ValueError(f"Please wait {wait}s before requesting another code")

    # Invalidate older unconsumed codes for this email+purpose
    db.query(OtpCode).filter_by(email=email, purpose=purpose, consumed=False).update({"consumed": True})

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    row = OtpCode(
        email=email,
        purpose=purpose,
        code_hash=_hash(code),
        expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
    )
    db.add(row)
    db.commit()

    emailed = _send_email_otp(email, code, purpose)
    out: dict = {"sent_via": "email" if emailed else "dev-log"}
    # Echo the code for local dev only when no SMTP is configured.
    if not emailed and settings.OTP_DEV_ECHO:
        out["dev_code"] = code
    return out


def consume_otp(db: Session, email: str, code: str, purpose: str) -> bool:
    """Validate the newest live OTP. Returns True once; marks it consumed."""
    email = email.lower().strip()
    now = datetime.utcnow()
    row = (
        db.query(OtpCode)
        .filter_by(email=email, purpose=purpose, consumed=False)
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if not row:
        return False
    if row.expires_at < now:
        row.consumed = True
        db.commit()
        return False
    if row.attempts >= settings.OTP_MAX_ATTEMPTS:
        row.consumed = True
        db.commit()
        return False
    if row.code_hash != _hash(code.strip()):
        row.attempts += 1
        if row.attempts >= settings.OTP_MAX_ATTEMPTS:
            row.consumed = True
        db.commit()
        return False
    row.consumed = True
    db.commit()
    return True
