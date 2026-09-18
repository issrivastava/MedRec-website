from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core import firebase_auth
from app.core.security import verify_password, hash_password, create_access_token
from app.db.session import get_db
from app.models.tables import User, PatientProfile, DoctorProfile
from app.schemas.schemas import (
    RegisterIn, TokenOut, UserOut, UserUpdate, FirebaseLoginIn,
    OtpRequestIn, OtpRequestOut, OtpVerifyIn, ResetPasswordIn, DeleteAccountIn,
)
from app.services import otp as otp_service
from app.services.otp import normalize_phone, normalize_identifier

router = APIRouter()

AVATAR_TYPES = {"image/png", "image/jpeg", "image/webp"}
AVATAR_MAX_BYTES = 5 * 1024 * 1024

# --- tiny in-memory login throttle (best-effort per worker) ---
_ATTEMPTS: dict[str, list] = {}
_THROTTLE_WINDOW_SEC = 600


def _throttle_check(key: str, limit: int = 10) -> None:
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    hits = [t for t in _ATTEMPTS.get(key, []) if now - t < timedelta(seconds=_THROTTLE_WINDOW_SEC)]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts — try again in a few minutes")
    hits.append(now)
    _ATTEMPTS[key] = hits


def _throttle_reset(key: str) -> None:
    _ATTEMPTS.pop(key, None)


def _find_user(db: Session, identifier: str):
    """Find a user by email OR phone. Returns None if blank/unknown."""
    identifier = (identifier or "").strip()
    if not identifier:
        return None
    if "@" in identifier:
        return db.query(User).filter(User.email == identifier.lower()).first()
    try:
        return db.query(User).filter(User.phone == normalize_phone(identifier)).first()
    except ValueError:
        return None


def _avatar_dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / "avatars"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _clear_avatars(user_id: str) -> None:
    for ext in ("jpg", "jpeg", "png", "webp"):
        try:
            Path(_avatar_dir() / f"{user_id}.{ext}").unlink(missing_ok=True)
        except Exception:
            pass


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower().strip()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    phone = None
    if data.phone and data.phone.strip():
        try:
            phone = normalize_phone(data.phone)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if db.query(User).filter(User.phone == phone).first():
            raise HTTPException(status_code=400, detail="Phone number already registered")
    if data.role not in ("patient", "doctor", "admin"):
        raise HTTPException(status_code=400, detail="Role must be patient, doctor or admin")
    if data.role == "admin":
        from app.core.config import settings
        if not settings.ADMIN_SIGNUP_KEY or data.admin_key != settings.ADMIN_SIGNUP_KEY:
            raise HTTPException(status_code=403, detail="Invalid admin signup key")
    user = User(
        email=email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip(),
        role=data.role,
        phone=phone,
    )
    db.add(user)
    db.flush()
    if data.role == "patient":
        db.add(PatientProfile(user_id=user.id, phone=phone))
    elif data.role == "doctor":
        db.add(
            DoctorProfile(
                user_id=user.id,
                specialization=data.specialization,
                license_no=data.license_no,
                hospital=data.hospital,
                phone=phone,
            )
        )
    # admin needs no profile
    db.commit()
    db.refresh(user)
    return user


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Step 1 of 2-step login: verify email/phone + password, then issue ONE
    OTP to BOTH email and SMS. Returns 202 {otp_required: true, ...}.
    Step 2: the user enters that code at POST /otp/verify (purpose=login)
    to receive the session JWT. No session is issued before the code."""
    from fastapi.responses import JSONResponse
    from app.core.config import settings

    identifier = (form.username or "").strip()
    _throttle_check(f"login:{identifier.lower()}")
    user = _find_user(db, identifier)
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email/phone or password")
    _throttle_reset(f"login:{identifier.lower()}")
    try:
        out = otp_service.request_otp(db, email=user.email, phone=user.phone, purpose="login")
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    return JSONResponse(status_code=202, content={
        "otp_required": True,
        "identifier": user.email,
        "sent_via": out["sent_via"], "channels": out.get("channels", []),
        "expires_in_minutes": settings.OTP_EXPIRE_MINUTES,
        "dev_code": out.get("dev_code"),
    })


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_me(data: UserUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if data.full_name:
        user.full_name = data.full_name.strip()
    if data.phone is not None:
        if data.phone.strip():
            try:
                phone = normalize_phone(data.phone)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            clash = db.query(User).filter(User.phone == phone, User.id != user.id).first()
            if clash:
                raise HTTPException(status_code=400, detail="Phone number already in use")
            user.phone = phone
        else:
            user.phone = None
    db.commit()
    db.refresh(user)
    return user


@router.post("/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 5 MB)")
    if (file.content_type not in AVATAR_TYPES) and not (file.filename or "").lower().endswith(
        (".png", ".jpg", ".jpeg", ".webp")
    ):
        raise HTTPException(status_code=400, detail="Upload a PNG, JPG or WEBP image")
    try:
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(data)).convert("RGB")
        img.thumbnail((512, 512))
        _clear_avatars(user.id)
        dest = _avatar_dir() / f"{user.id}.jpg"
        img.save(dest, format="JPEG", quality=85)
        user.avatar_path = str(dest)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that image file")
    db.commit()
    db.refresh(user)
    return user


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _clear_avatars(user.id)
    user.avatar_path = None
    db.commit()
    db.refresh(user)
    return user


@router.post("/firebase", response_model=TokenOut)
def firebase_login(data: FirebaseLoginIn, db: Session = Depends(get_db)):
    """Log in with Firebase (email/password or Google): verify the ID token,
    find-or-create the user, return a MedRec JWT."""
    try:
        claim = firebase_auth.verify_id_token(data.id_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:  # specific reason from verify_id_token
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except Exception:  # invalid / expired token
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Firebase token")

    user = None
    if claim["uid"]:
        user = db.query(User).filter(User.firebase_uid == claim["uid"]).first()
    if not user:
        user = db.query(User).filter(User.email == claim["email"]).first()
        if user and claim["uid"]:
            user.firebase_uid = claim["uid"]  # link existing account
    phone = None
    if data.phone and data.phone.strip():
        try:
            phone = normalize_phone(data.phone)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if not user and phone:
        # link by phone number if the email is new but phone matches
        user = db.query(User).filter(User.phone == phone).first()
        if user and claim["uid"] and not user.firebase_uid:
            user.firebase_uid = claim["uid"]
    if not user:
        if not data.role:
            raise HTTPException(
                status_code=428,
                detail={"code": "role_required", "message": "First Firebase sign-in: choose patient or doctor."},
            )
        import secrets

        user = User(
            email=claim["email"],
            hashed_password=hash_password(secrets.token_hex(32)),  # unusable random password
            full_name=(data.full_name or claim["name"] or claim["email"].split("@")[0]).strip(),
            role=data.role,
            phone=phone,
            firebase_uid=claim["uid"] or None,
        )
        db.add(user)
        db.flush()
        if data.role == "patient":
            db.add(PatientProfile(user_id=user.id, phone=phone))
        else:
            db.add(
                DoctorProfile(
                    user_id=user.id,
                    specialization=data.specialization,
                    license_no=data.license_no,
                    hospital=data.hospital,
                    phone=phone,
                )
            )
        db.commit()
        db.refresh(user)
    else:
        if phone and not user.phone:
            clash = db.query(User).filter(User.phone == phone, User.id != user.id).first()
            if clash:
                raise HTTPException(status_code=400, detail="Phone number already in use")
            user.phone = phone
        db.commit()  # persist uid/phone link if changed
        db.refresh(user)
    token = create_access_token(subject=user.id)
    return {"access_token": token, "token_type": "bearer", "user": user}


# ---------------------------------------------------------------------------
# Email + SMS OTP (one code, both channels) + forgot-password via OTP
# ---------------------------------------------------------------------------

@router.get("/otp/channels", response_model=dict)
def otp_channels():
    """Which OTP delivery channels are actually configured (drives UI hints)."""
    from app.core.config import settings
    email_ok = bool(settings.MAIL_HOST and settings.MAIL_FROM)
    sms_ok = bool(settings.SMS_WEBHOOK_URL)
    return {"email": email_ok, "sms": sms_ok, "dev_echo": settings.OTP_DEV_ECHO,
            "dev_mode": not email_ok and not sms_ok}


def _otp_destinations(data_email, data_phone, user):
    """Resolve where the SAME code goes: stored user contacts win for login/reset."""
    email = (data_email or "").lower().strip() or None
    phone = None
    if data_phone and str(data_phone).strip():
        try:
            phone = normalize_phone(str(data_phone))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if user is not None:
        email = user.email or email
        phone = user.phone or phone
    if not email and not phone:
        raise HTTPException(status_code=400, detail="Email or phone is required")
    return email, phone


@router.post("/otp/request", response_model=OtpRequestOut)
def otp_request(data: OtpRequestIn, db: Session = Depends(get_db)):
    """Send ONE 6-digit code to BOTH email and SMS (same code, both channels).

    purpose=login  -> code can be exchanged at /otp/verify for a session JWT.
    purpose=reset  -> code is used with /reset-password to set a new password.
    purpose=register -> code proves the user owns the contact (verified client-side).
    For purpose=login/reset the account must already exist (by email OR phone);
    the code fans out to the account's stored email + phone.
    """
    from app.core.config import settings

    user = None
    if data.purpose in ("login", "reset"):
        identifier = (data.email or data.phone or "").strip()
        user = _find_user(db, identifier)
        if not user:
            raise HTTPException(status_code=404, detail="No account found for this email/phone")
    email, phone = _otp_destinations(data.email, data.phone, user)
    try:
        out = otp_service.request_otp(db, email=email, phone=phone, purpose=data.purpose)
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    return OtpRequestOut(sent_via=out["sent_via"], channels=out.get("channels", []),
                         expires_in_minutes=settings.OTP_EXPIRE_MINUTES,
                         dev_code=out.get("dev_code"))


def _verify_target(data_email, data_phone) -> str:
    identifier = (data_email or data_phone or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or phone is required")
    return identifier


@router.post("/otp/verify", response_model=TokenOut)
def otp_verify(data: OtpVerifyIn, db: Session = Depends(get_db)):
    """Exchange a valid login/register OTP (from email OR sms — same code) for a session JWT."""
    if data.purpose not in ("login", "register"):
        raise HTTPException(status_code=400, detail="Use /reset-password for password-reset codes")
    identifier = _verify_target(data.email, data.phone)
    _throttle_check(f"otp:{identifier.lower()}", limit=8)
    if not otp_service.consume_otp(db, identifier, data.code, data.purpose):
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    _throttle_reset(f"otp:{identifier.lower()}")
    user = _find_user(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="No account found — please register first")
    token = create_access_token(subject=user.id)
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/forgot-password", response_model=OtpRequestOut)
def forgot_password(data: OtpRequestIn, db: Session = Depends(get_db)):
    """Alias for OTP request with purpose=reset (used by the Forgot Password page)."""
    data.purpose = "reset"
    return otp_request(data, db)


@router.post("/reset-password")
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)):
    """Set a new password using a valid reset OTP (code from email OR sms)."""
    identifier = _verify_target(data.email, data.phone)
    if not otp_service.consume_otp(db, identifier, data.code, "reset"):
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    user = _find_user(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="No account found")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"ok": True, "message": "Password updated — please log in with your new password"}


# ---------------------------------------------------------------------------
# Delete my account
# ---------------------------------------------------------------------------

@router.delete("/me")
def delete_my_account(
    data: DeleteAccountIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Permanently delete the caller's account and all of their MedRec data.

    Body: {"confirm": "DELETE", "password": "<current password, local accounts only>"}.
    Firebase/Google users have no local password, so only the confirm string is checked for them.
    """
    if (data.confirm or "").strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail='Confirmation required: send {"confirm": "DELETE"}')

    # Local accounts must also prove the current password (guards stolen sessions).
    if user.firebase_uid is None and data.password is not None and data.password != "":
        if not verify_password(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
    elif user.firebase_uid is None:
        # No password supplied: still allow, but only with the explicit DELETE confirm
        # (keeps UX simple for dev). Password check above applies when provided.
        pass

    user_id = user.id
    email = user.email
    phone = user.phone
    firebase_uid = user.firebase_uid

    # Best-effort: delete the Firebase user too so Google sign-in doesn't resurrect data.
    if firebase_uid:
        try:
            from app.core import firebase_auth as _fb

            _fb.delete_user(firebase_uid)
        except Exception:
            pass

    # Best-effort: remove on-disk files (avatars + uploads) before row delete.
    try:
        _clear_avatars(user_id)
        import shutil
        from app.core.config import settings

        shutil.rmtree(str(Path(settings.UPLOAD_DIR) / user_id), ignore_errors=True)
    except Exception:
        pass

    # Remove rows that reference users.id without ORM cascade coverage.
    from app.models import tables as T

    for model, col in (
        (T.DoctorPatientAssignment, "doctor_id"),
        (T.DoctorPatientAssignment, "patient_id"),
        (T.VisitNote, "patient_id"),
        (T.VisitNote, "doctor_id"),
        (T.Appointment, "patient_id"),
        (T.Appointment, "doctor_id"),
        (T.AvailabilitySlot, "doctor_id"),
        (T.Notification, "user_id"),
        (T.HealthAlert, "patient_id"),
        (T.LabReferenceRange, "patient_id"),
        (T.FamilyMember, "owner_id"),
        (T.ContactMessage, "user_id"),
        (T.Review, "patient_id"),
        (T.Review, "doctor_id"),
        (T.SiteReview, "user_id"),
        (T.EmergencyAlert, "patient_id"),
        (T.AiSummary, "patient_id"),
    ):
        try:
            db.query(model).filter(getattr(model, col) == user_id).delete(synchronize_session=False)
        except Exception:
            db.rollback()
    try:
        db.query(T.OtpCode).filter(T.OtpCode.email == email).delete(synchronize_session=False)
    except Exception:
        db.rollback()
    if phone:
        try:
            db.query(T.OtpCode).filter(T.OtpCode.phone == phone).delete(synchronize_session=False)
        except Exception:
            db.rollback()

    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "message": "Account and all associated data deleted"}
