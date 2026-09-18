"""Secure doctor-patient chat (assigned pairs only)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_assigned
from app.db.session import get_db
from app.models.tables import Message, User
from app.schemas.schemas import MessageIn, MessageOut
from app.services.notify import notify

router = APIRouter()


def _out(db: Session, m: Message) -> dict:
    s = db.query(User).filter_by(id=m.sender_id).first()
    return {"id": m.id, "doctor_id": m.doctor_id, "patient_id": m.patient_id,
            "sender_id": m.sender_id, "sender_name": s.full_name if s else None,
            "body": m.body, "read": m.read, "created_at": m.created_at}


def _pair(db: Session, user: User, data: MessageIn) -> tuple[str, str]:
    if user.role == "patient":
        if not data.doctor_id:
            raise HTTPException(status_code=400, detail="doctor_id required")
        if not is_assigned(db, data.doctor_id, user.id):
            raise HTTPException(status_code=403, detail="Doctor not assigned to you")
        # consent check: patient can always message; doctor needs chat consent to reply (checked on doctor send)
        return data.doctor_id, user.id
    if user.role == "doctor":
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="patient_id required")
        if not is_assigned(db, user.id, data.patient_id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
        from app.api.routes.sharing import consent_allows
        if not consent_allows(db, data.patient_id, user.id, "chat"):
            raise HTTPException(status_code=403, detail="Patient disabled chat for you")
        return user.id, data.patient_id
    raise HTTPException(status_code=403, detail="Patients/doctors only")


@router.post("", response_model=MessageOut, status_code=201)
def send_message(data: MessageIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doctor_id, patient_id = _pair(db, user, data)
    m = Message(doctor_id=doctor_id, patient_id=patient_id, sender_id=user.id, body=data.body.strip())
    db.add(m)
    db.commit()
    db.refresh(m)
    other = patient_id if user.role == "doctor" else doctor_id
    notify(db, other, "message", f"New message from {user.full_name}", data.body[:200],
           link="/doctor" if user.role == "patient" else "/patient")
    return _out(db, m)


@router.get("", response_model=list[MessageOut])
def list_messages(doctor_id: str | None = None, patient_id: str | None = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "patient":
        if not doctor_id:
            raise HTTPException(status_code=400, detail="doctor_id required")
        rows = db.query(Message).filter_by(doctor_id=doctor_id, patient_id=user.id).order_by(Message.created_at.asc()).limit(300).all()
    elif user.role == "doctor":
        if not patient_id:
            raise HTTPException(status_code=400, detail="patient_id required")
        rows = db.query(Message).filter_by(doctor_id=user.id, patient_id=patient_id).order_by(Message.created_at.asc()).limit(300).all()
    else:
        raise HTTPException(status_code=403, detail="Patients/doctors only")
    # mark incoming as read
    for m in rows:
        if m.sender_id != user.id and not m.read:
            m.read = True
    db.commit()
    return [_out(db, m) for m in rows]


@router.get("/threads", response_model=list[dict])
def list_threads(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Counterpart list with unread counts for the inbox."""
    if user.role == "patient":
        rows = db.query(Message).filter_by(patient_id=user.id).order_by(Message.created_at.desc()).limit(500).all()
        key = "doctor_id"
    elif user.role == "doctor":
        rows = db.query(Message).filter_by(doctor_id=user.id).order_by(Message.created_at.desc()).limit(500).all()
        key = "patient_id"
    else:
        return []
    seen: dict = {}
    for m in rows:
        other_id = getattr(m, key)
        if other_id not in seen:
            other = db.query(User).filter_by(id=other_id).first()
            seen[other_id] = {"other_id": other_id, "other_name": other.full_name if other else "?",
                              "last_body": m.body[:120], "last_at": m.created_at, "unread": 0}
    # unread counts
    for m in rows:
        other_id = getattr(m, key)
        if m.sender_id != user.id and not m.read:
            seen[other_id]["unread"] += 1
    return list(seen.values())
