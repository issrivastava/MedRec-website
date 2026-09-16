from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_patient, get_current_user
from app.db.session import get_db
from app.models.tables import PatientProfile, User
from app.schemas.schemas import PatientProfileIn, PatientProfileOut

router = APIRouter()


def _get_or_create(db: Session, user: User) -> PatientProfile:
    prof = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if not prof:
        prof = PatientProfile(user_id=user.id)
        db.add(prof)
        db.commit()
        db.refresh(prof)
    return prof


@router.get("/me", response_model=PatientProfileOut)
def get_my_profile(db: Session = Depends(get_db), user: User = Depends(require_patient)):
    return _get_or_create(db, user)


@router.put("/me", response_model=PatientProfileOut)
def update_my_profile(
    data: PatientProfileIn, db: Session = Depends(get_db), user: User = Depends(require_patient)
):
    prof = _get_or_create(db, user)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof
