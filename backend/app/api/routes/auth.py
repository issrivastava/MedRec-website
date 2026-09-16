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
from app.schemas.schemas import RegisterIn, TokenOut, UserOut, UserUpdate, FirebaseLoginIn

router = APIRouter()

AVATAR_TYPES = {"image/png", "image/jpeg", "image/webp"}
AVATAR_MAX_BYTES = 5 * 1024 * 1024


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
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if data.role not in ("patient", "doctor", "admin"):
        raise HTTPException(status_code=400, detail="Role must be patient, doctor or admin")
    if data.role == "admin":
        from app.core.config import settings
        if not settings.ADMIN_SIGNUP_KEY or data.admin_key != settings.ADMIN_SIGNUP_KEY:
            raise HTTPException(status_code=403, detail="Invalid admin signup key")
    user = User(
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    db.flush()
    if data.role == "patient":
        db.add(PatientProfile(user_id=user.id))
    elif data.role == "doctor":
        db.add(
            DoctorProfile(
                user_id=user.id,
                specialization=data.specialization,
                license_no=data.license_no,
                hospital=data.hospital,
            )
        )
    # admin needs no profile
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token = create_access_token(subject=user.id)
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_me(data: UserUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if data.full_name:
        user.full_name = data.full_name
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
    """Log in with Firebase: verify the ID token, find-or-create the user, return a MedRec JWT."""
    try:
        claim = firebase_auth.verify_id_token(data.id_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:  # invalid / expired token
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Firebase token")

    user = None
    if claim["uid"]:
        user = db.query(User).filter(User.firebase_uid == claim["uid"]).first()
    if not user:
        user = db.query(User).filter(User.email == claim["email"]).first()
        if user and claim["uid"]:
            user.firebase_uid = claim["uid"]  # link existing account
    if not user:
        if not data.role:
            raise HTTPException(
                status_code=428,
                detail={"code": "role_required", "message": "First Firebase sign-in: choose patient or doctor."},
            )
        import secrets

        user = User(
            email=claim["email"],
            hashed_password=hash_password(secrets.token_urlhex(32)),  # unusable random password
            full_name=data.full_name or claim["name"] or claim["email"].split("@")[0],
            role=data.role,
            firebase_uid=claim["uid"] or None,
        )
        db.add(user)
        db.flush()
        if data.role == "patient":
            db.add(PatientProfile(user_id=user.id))
        else:
            db.add(
                DoctorProfile(
                    user_id=user.id,
                    specialization=data.specialization,
                    license_no=data.license_no,
                    hospital=data.hospital,
                )
            )
        db.commit()
        db.refresh(user)
    else:
        db.commit()  # persist uid link if it changed
        db.refresh(user)
    token = create_access_token(subject=user.id)
    return {"access_token": token, "token_type": "bearer", "user": user}
