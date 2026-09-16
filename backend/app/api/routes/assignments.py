from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.tables import DoctorPatientAssignment, User
from app.schemas.schemas import AssignmentCreate, AssignmentOut

router = APIRouter()


@router.get("/my", response_model=list[AssignmentOut])
def my_links(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "doctor":
        links = db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()
    else:
        links = db.query(DoctorPatientAssignment).filter_by(patient_id=user.id).all()
    out = []
    for link in links:
        d = db.query(User).filter(User.id == link.doctor_id).first()
        p = db.query(User).filter(User.id == link.patient_id).first()
        out.append(
            AssignmentOut(
                id=link.id, doctor_id=link.doctor_id, patient_id=link.patient_id,
                doctor_name=d.full_name if d else None, doctor_email=d.email if d else None,
                patient_name=p.full_name if p else None, patient_email=p.email if p else None,
                created_at=link.created_at,
            )
        )
    return out


@router.post("", response_model=AssignmentOut, status_code=201)
def link_by_email(data: AssignmentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Patient passes a doctor's email, or doctor passes a patient's email."""
    other = db.query(User).filter(User.email == data.email.lower()).first()
    if not other:
        raise HTTPException(status_code=404, detail="No user with that email")
    if user.role == "patient":
        if other.role != "doctor":
            raise HTTPException(status_code=400, detail="Email must belong to a doctor")
        doctor_id, patient_id = other.id, user.id
    elif user.role == "doctor":
        if other.role != "patient":
            raise HTTPException(status_code=400, detail="Email must belong to a patient")
        doctor_id, patient_id = user.id, other.id
    else:
        raise HTTPException(status_code=400, detail="Unknown role")

    existing = (
        db.query(DoctorPatientAssignment).filter_by(doctor_id=doctor_id, patient_id=patient_id).first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already linked")
    link = DoctorPatientAssignment(doctor_id=doctor_id, patient_id=patient_id)
    db.add(link)
    db.commit()
    db.refresh(link)
    d = db.query(User).filter(User.id == doctor_id).first()
    p = db.query(User).filter(User.id == patient_id).first()
    return AssignmentOut(
        id=link.id, doctor_id=doctor_id, patient_id=patient_id,
        doctor_name=d.full_name, doctor_email=d.email,
        patient_name=p.full_name, patient_email=p.email,
        created_at=link.created_at,
    )


@router.delete("/{link_id}", status_code=204)
def unlink(link_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    link = db.query(DoctorPatientAssignment).filter_by(id=link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if user.id not in (link.doctor_id, link.patient_id):
        raise HTTPException(status_code=403, detail="Not your link")
    db.delete(link)
    db.commit()
    return None
