from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_doctor, is_assigned
from app.db.session import get_db
from app.models.tables import VisitNote, User
from app.schemas.schemas import VisitNoteIn, VisitNoteOut
from app.services.notify import notify, patient_phone, notify_phone_sms

router = APIRouter()


def _out(db: Session, v: VisitNote) -> dict:
    doc = db.query(User).filter_by(id=v.doctor_id).first()
    d = {c: getattr(v, c) for c in ("id", "patient_id", "doctor_id", "note_type", "title", "content",
                                    "medicines", "visit_date", "follow_up_date", "created_at")}
    d["doctor_name"] = doc.full_name if doc else None
    return d


@router.post("", response_model=VisitNoteOut, status_code=201)
def create_note(data: VisitNoteIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not is_assigned(db, user.id, data.patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    v = VisitNote(
        patient_id=data.patient_id, doctor_id=user.id, note_type=data.note_type,
        title=data.title, content=data.content,
        medicines=[m.model_dump() for m in data.medicines] if data.medicines else None,
        visit_date=data.visit_date, follow_up_date=data.follow_up_date,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    notify(db, data.patient_id, "prescription" if data.note_type == "prescription" else "visit_note",
           f"New {data.note_type} from Dr. {user.full_name}",
           (data.title + "\n" if data.title else "") + data.content[:300], link="/patient")
    phone = patient_phone(db, data.patient_id)
    if phone:
        notify_phone_sms(phone, f"MedRec: Dr. {user.full_name} added a {data.note_type} for you.")
    return _out(db, v)


@router.get("/my", response_model=list[VisitNoteOut])
def my_notes(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    rows = db.query(VisitNote).filter_by(patient_id=user.id).order_by(VisitNote.created_at.desc()).all()
    return [_out(db, v) for v in rows]


@router.get("/patient/{patient_id}", response_model=list[VisitNoteOut])
def patient_notes(patient_id: str, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    rows = db.query(VisitNote).filter_by(patient_id=patient_id).order_by(VisitNote.created_at.desc()).all()
    return [_out(db, v) for v in rows]


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    v = db.query(VisitNote).filter_by(id=note_id, doctor_id=user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(v)
    db.commit()
    return None
