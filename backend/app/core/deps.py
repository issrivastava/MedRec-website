from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token, is_expired_token
from app.db.session import get_db
from app.models.tables import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _unauthorized(detail: str | dict = "Not authenticated") -> HTTPException:
    # WWW-Authenticate lets browsers/clients know a Bearer token is expected.
    # dict details carry a machine-readable code (e.g. token_expired) that the
    # frontend uses to trigger silent refresh vs full re-login. friendlyError
    # already renders {message} from dict details, so this is backward-safe.
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    if not token:
        raise _unauthorized()
    claims = decode_token(token)
    if not claims or not claims.get("sub"):
        if token and is_expired_token(token):
            raise _unauthorized({"code": "token_expired",
                                 "message": "Session expired — refreshing, please retry"})
        raise _unauthorized("Invalid or expired token")
    user = db.query(User).filter(User.id == claims["sub"]).first()
    if not user:
        raise _unauthorized("User not found")
    # Token revocation: password change bumps token_version, old JWTs die.
    token_ver = claims.get("ver", 0)
    if getattr(user, "token_version", 0) != token_ver:
        raise _unauthorized("Session expired — please log in again")
    return user


def require_role(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden for your role")
        return user

    return checker


require_patient = require_role("patient")
require_doctor = require_role("doctor")
require_admin = require_role("admin")
require_receptionist = require_role("receptionist", "admin")
# Front-desk + clinical support: appointments, queue, check-in, billing,
# patient directory search and pharmacy dispense (never clinical notes).
require_staff = require_role("doctor", "receptionist", "nurse", "admin")
require_clinical_staff = require_role("doctor", "nurse", "admin")

STAFF_ROLES = ("doctor", "receptionist", "nurse", "admin")


def is_assigned(db: Session, doctor_id: str, patient_id: str) -> bool:
    from app.models.tables import DoctorPatientAssignment

    return (
        db.query(DoctorPatientAssignment)
        .filter_by(doctor_id=doctor_id, patient_id=patient_id)
        .first()
        is not None
    )


def resolve_patient_id(db: Session, user: User, patient_id: str | None) -> str:
    """Patients see self; doctors/admins may pass an assigned patient_id."""
    from app.models.tables import User as U

    if user.role == "patient":
        return user.id
    if not patient_id:
        raise HTTPException(status_code=400, detail="patient_id required")
    target = db.query(U).filter_by(id=patient_id, role="patient").first()
    if not target:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role == "doctor" and not is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    return patient_id
