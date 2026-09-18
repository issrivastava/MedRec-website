"""Email + SMS OTP: ONE 6-digit code delivered on BOTH channels.

Only the SHA-256 hash of the code is stored in the DB.
- Email goes via SMTP when MAIL_* is configured.
- SMS goes via SMS_WEBHOOK_URL (POST {"to","message"}) when configured.
- When neither is configured, the code is logged and (with OTP_DEV_ECHO)
  echoed back as dev_code so local dev works.
"""
from __future__ import annotations
import hashlib
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config import settings
from app.models.tables import OtpCode

VALID_PURPOSES = ("login", "reset", "register")


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def normalize_phone(raw: str | None) -> str:
    """Normalize to +E164-ish. Bare 10-digit numbers get SMS_DEFAULT_PREFIX (+91)."""
    if not raw:
        raise ValueError("Phone number is required")
    digits = re.sub(r"\D", "", raw.strip())
    if raw.strip().startswith("+"):
        norm = "+" + digits
    elif len(digits) == 11 and digits.startswith("0"):
        # trunk prefix (e.g. 09284510103 -> +919284510103)
        norm = f"{settings.SMS_DEFAULT_PREFIX}{digits[1:]}"
    elif len(digits) == 10:
        norm = f"{settings.SMS_DEFAULT_PREFIX}{digits}"
    elif len(digits) == 12 and digits.startswith("91") and settings.SMS_DEFAULT_PREFIX == "+91":
        norm = f"+{digits}"
    elif 10 <= len(digits) <= 15:
        norm = f"+{digits}"
    else:
        raise ValueError("Enter a valid phone number with country code (e.g. +919876543210)")
    if not 11 <= len(norm) <= 16:  # + plus 10-15 digits
        raise ValueError("Enter a valid phone number with country code (e.g. +919876543210)")
    return norm


def is_phone_identifier(raw: str) -> bool:
    return "@" not in (raw or "")


def normalize_identifier(raw: str) -> tuple[str, str]:
    """Returns (kind, value): ('email', lowercased) or ('phone', +E164)."""
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("Email or phone is required")
    if is_phone_identifier(raw):
        return "phone", normalize_phone(raw)
    return "email", raw.lower()


def _send_email_otp(to_email: str, code: str, purpose: str) -> bool:
    """Try SMTP delivery. Returns True if the mail was accepted."""
    if not (settings.MAIL_HOST and settings.MAIL_FROM):
        print(f"[MedRec OTP] ({purpose}) email {to_email}: {code}  [no SMTP configured]", flush=True)
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
            f"The SAME code was also sent to your phone by SMS. "
            f"It expires in {settings.OTP_EXPIRE_MINUTES} minutes. "
            "If you did not request this, please ignore."
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


def _send_sms_otp(to_phone: str, code: str, purpose: str) -> bool:
    """Try SMS delivery via webhook. Returns True if accepted (2xx)."""
    if not (settings.SMS_WEBHOOK_URL and to_phone):
        print(f"[MedRec OTP] ({purpose}) sms {to_phone}: {code}  [no SMS webhook configured]", flush=True)
        return False
    try:
        import httpx
        r = httpx.post(settings.SMS_WEBHOOK_URL, json={
            "to": to_phone,
            "from": settings.SMS_SENDER_ID,
            "message": f"Your MedRec verification code is: {code}. "
                       f"It expires in {settings.OTP_EXPIRE_MINUTES} minutes.",
        }, timeout=10)
        if 200 <= r.status_code < 300:
            return True
        print(f"[MedRec OTP] SMS webhook rejected ({r.status_code}): {r.text[:200]}", flush=True)
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"[MedRec OTP] SMS send failed for {to_phone}: {exc}", flush=True)
        return False


def _target_filter(target: str):
    return or_(OtpCode.email == target, OtpCode.phone == target)


def request_otp(db: Session, email: str | None = None, phone: str | None = None,
                purpose: str = "login") -> dict:
    """Create ONE code and send the SAME code via email AND sms.

    email/phone are the destinations (already normalized by the caller).
    Returns {sent_via, channels, dev_code?} where sent_via is like
    "email+sms", "email", "sms" or "dev-log".
    """
    if purpose not in VALID_PURPOSES:
        raise ValueError("purpose must be login, reset or register")
    email = (email or "").lower().strip() or None
    if phone:
        phone = normalize_phone(phone)
    if not email and not phone:
        raise ValueError("Email or phone is required")
    now = datetime.utcnow()

    # Cooldown: any live row for either destination blocks resend.
    for target in [t for t in (email, phone) if t]:
        recent = (
            db.query(OtpCode)
            .filter(_target_filter(target), OtpCode.purpose == purpose, OtpCode.consumed == False)  # noqa: E712
            .order_by(OtpCode.created_at.desc())
            .first()
        )
        if recent and (now - recent.created_at).total_seconds() < settings.OTP_RESEND_SECONDS:
            wait = settings.OTP_RESEND_SECONDS - int((now - recent.created_at).total_seconds())
            raise ValueError(f"Please wait {wait}s before requesting another code")

    # Invalidate older live codes for both destinations.
    q = db.query(OtpCode).filter(OtpCode.purpose == purpose, OtpCode.consumed == False)  # noqa: E712
    if email and phone:
        q = q.filter(or_(OtpCode.email == email, OtpCode.phone == phone,
                         OtpCode.email == phone, OtpCode.phone == email))
    elif email:
        q = q.filter(_target_filter(email))
    else:
        q = q.filter(_target_filter(phone))
    q.update({"consumed": True})

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    row = OtpCode(
        email=email or "",
        phone=phone,
        purpose=purpose,
        code_hash=_hash(code),
        expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
    )
    db.add(row)
    db.commit()

    # SAME code on both channels.
    sent: list[str] = []
    channels: list[str] = []
    if email:
        channels.append("email")
        if _send_email_otp(email, code, purpose):
            sent.append("email")
    if phone:
        channels.append("sms")
        if _send_sms_otp(phone, code, purpose):
            sent.append("sms")
    out: dict = {"sent_via": "+".join(sent) if sent else "dev-log", "channels": channels}
    # SECURITY: never return the code to the client unless the operator
    # explicitly opted into local-dev echo. The code is always printed to
    # the *server* console (not visible to users) so devs can still test
    # without SMTP/SMS. Frontend must NEVER render dev_code.
    if not sent and settings.OTP_DEV_ECHO:
        out["dev_code"] = code
    return out


def consume_otp(db: Session, target: str, code: str, purpose: str) -> bool:
    """Validate the newest live OTP for an email OR phone target."""
    target = (target or "").strip()
    if not target:
        return False
    if is_phone_identifier(target):
        try:
            target = normalize_phone(target)
        except ValueError:
            return False
    else:
        target = target.lower()
    now = datetime.utcnow()
    row = (
        db.query(OtpCode)
        .filter(_target_filter(target), OtpCode.purpose == purpose, OtpCode.consumed == False)  # noqa: E712
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
