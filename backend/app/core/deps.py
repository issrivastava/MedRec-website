from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.tables import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
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
