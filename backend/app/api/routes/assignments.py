from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_assigned
from app.db.session import get_db
from app.models.tables import DoctorPatientAssignment, User, DoctorProfile
from app.schemas.schemas import AssignmentCreate, AssignmentOut, DirectoryLookupOut

router = APIRouter()


def _out(link: DoctorPatientAssignment, d: User | None, p: User | None) -> AssignmentOut:
    return AssignmentOut(
        id=link.id, doctor_id=link.doctor_id, patient_id=link.patient_id,
        doctor_name=d.full_name if d else None, doctor_email=d.email if d else None,
        doctor_health_id=getattr(d, "health_id", None) if d else None,
        patient_name=p.full_name if p else None, patient_email=p.email if p else None,
        patient_health_id=getattr(p, "health_id", None) if p else None,
        created_at=link.created_at,
    )


def _find_other(db: Session, data: AssignmentCreate) -> User | None:
    """Resolve the other party by email, AH-XXXX health ID, or raw UUID."""
    if data.email:
        return db.query(User).filter(User.email == data.email.lower().strip()).first()
    raw = (data.health_id or data.user_id or "").strip()
    if not raw:
        return None
    hid = raw.upper().replace(" ", "")
    if hid.startswith("AH-"):
        return db.query(User).filter_by(health_id=hid).first()
    if "@" in raw:
        return db.query(User).filter(User.email == raw.lower()).first()
    return db.query(User).filter_by(id=raw).first()


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
        out.append(_out(link, d, p))
    return out


@router.get("/lookup", response_model=DirectoryLookupOut)
def lookup(identifier: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Preview a doctor/patient by AH-XXXX, email or UUID before linking.

    Only returns the opposite role (patients see doctors, doctors see patients)
    plus whether you are already linked. Safe to call with any ID.
    """
    raw = (identifier or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="identifier required (AH-XXXX, email or ID)")
    hid = raw.upper().replace(" ", "")
    other: User | None = None
    if hid.startswith("AH-"):
        other = db.query(User).filter_by(health_id=hid).first()
    elif "@" in raw:
        other = db.query(User).filter(User.email == raw.lower()).first()
    else:
        other = db.query(User).filter_by(id=raw).first()
    if not other:
        raise HTTPException(status_code=404, detail="No doctor/patient found for that ID")
    if other.id == user.id:
        raise HTTPException(status_code=400, detail="That is your own ID")
    # Enforce opposite-role visibility
    if user.role == "patient" and other.role != "doctor":
        raise HTTPException(status_code=400, detail="That ID belongs to a patient, not a doctor")
    if user.role == "doctor" and other.role != "patient":
        raise HTTPException(status_code=400, detail="That ID belongs to a doctor, not a patient")
    if user.role not in ("patient", "doctor"):
        raise HTTPException(status_code=403, detail="Patients/doctors only")
    spec = hosp = None
    if other.role == "doctor":
        prof = db.query(DoctorProfile).filter_by(user_id=other.id).first()
        if prof:
            spec, hosp = prof.specialization, prof.hospital
    if user.role == "patient":
        linked = is_assigned(db, other.id, user.id)
    else:
        linked = is_assigned(db, user.id, other.id)
    return DirectoryLookupOut(
        id=other.id, full_name=other.full_name, role=other.role,
        health_id=getattr(other, "health_id", None),
        specialization=spec, hospital=hosp, already_linked=linked,
    )


@router.post("", response_model=AssignmentOut, status_code=201)
def link(data: AssignmentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Patient passes a doctor's email / AH-XXXX / ID, or doctor passes a patient's."""
    other = _find_other(db, data)
    if not other:
        raise HTTPException(status_code=404, detail="No user found — check the email or AH-XXXX ID")
    if other.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot link to yourself")
    if user.role == "patient":
        if other.role != "doctor":
            raise HTTPException(status_code=400, detail="ID must belong to a doctor")
        doctor_id, patient_id = other.id, user.id
    elif user.role == "doctor":
        if other.role != "patient":
            raise HTTPException(status_code=400, detail="ID must belong to a patient")
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
    from app.services.notify import notify
    try:
        notify(db, other.id, "assignment",
               f"New link: {user.full_name} ({user.role}) connected with you",
               f"Health ID {getattr(user, 'health_id', '') or ''} — say hello in Chat.",
               link="/doctor" if other.role == "doctor" else "/patient")
    except Exception:
        pass
    d = db.query(User).filter(User.id == doctor_id).first()
    p = db.query(User).filter(User.id == patient_id).first()
    return _out(link, d, p)


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
