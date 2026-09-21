"""Secure doctor-patient chat (assigned pairs only, linked by unique IDs)."""
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_assigned
from app.db.session import get_db
from app.models.tables import Message, User, Document
from app.schemas.schemas import MessageIn, MessageOut, VideoRequestIn
from app.services.notify import notify, patient_phone, notify_phone_sms

router = APIRouter()

SOS_KEYWORDS = (
    "chest pain", "chestpain", "emergency", "sos", "bleeding", "breathless",
    "breathing difficulty", "shortness of breath", "unconscious", "fainted",
    "severe pain", "heart attack", "stroke", "accident",
)


def _sos(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in SOS_KEYWORDS)


def _out(db: Session, m: Message) -> dict:
    s = db.query(User).filter_by(id=m.sender_id).first()
    attach_title = None
    if getattr(m, "attachment_document_id", None):
        d = db.query(Document).filter_by(id=m.attachment_document_id).first()
        attach_title = d.title if d else None
    return {"id": m.id, "doctor_id": m.doctor_id, "patient_id": m.patient_id,
            "sender_id": m.sender_id, "sender_name": s.full_name if s else None,
            "body": m.body,
            "priority": getattr(m, "priority", "normal") or "normal",
            "category": getattr(m, "category", "general") or "general",
            "attachment_document_id": getattr(m, "attachment_document_id", None),
            "attachment_title": attach_title,
            "sos_detected": bool(getattr(m, "sos_detected", False)),
            "read": m.read, "read_at": getattr(m, "read_at", None),
            "created_at": m.created_at}


def _resolve_user_id(db: Session, raw: str | None, expect_role: str) -> str | None:
    """Accept UUID, AH-XXXX Patient/Doctor ID, or email — return the user UUID."""
    if not raw:
        return None
    v = raw.strip()
    if not v:
        return None
    hid = v.upper().replace(" ", "")
    if hid.startswith("AH-"):
        u = db.query(User).filter_by(health_id=hid).first()
        if u and (expect_role == "any" or u.role == expect_role):
            return u.id
        return None
    if "@" in v:
        u = db.query(User).filter_by(email=v.lower()).first()
        if u and (expect_role == "any" or u.role == expect_role):
            return u.id
        return None
    return v


def _check_attachment(db: Session, user: User, doctor_id: str, patient_id: str,
                      doc_id: str | None) -> None:
    if not doc_id:
        return
    d = db.query(Document).filter_by(id=doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Attached report not found")
    # Attachments must belong to the patient of this pair (privacy).
    if d.owner_id != patient_id:
        raise HTTPException(status_code=403, detail="You can only attach this patient's own reports")
    # Doctor must be assigned (already checked) — patient must own it.
    if user.role == "patient" and d.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You can only attach your own reports")


def _pair(db: Session, user: User, data: MessageIn) -> tuple[str, str]:
    if user.role == "patient":
        if not data.doctor_id:
            raise HTTPException(status_code=400, detail="doctor_id required (UUID, AH-XXXX or email)")
        doctor_id = _resolve_user_id(db, data.doctor_id, "doctor")
        if not doctor_id:
            raise HTTPException(status_code=404, detail="Doctor not found for that ID/email")
        if not is_assigned(db, doctor_id, user.id):
            raise HTTPException(status_code=403, detail="Doctor not assigned to you — link by their AH-XXXX ID first")
        _check_attachment(db, user, doctor_id, user.id, data.attachment_document_id)
        return doctor_id, user.id
    if user.role == "doctor":
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="patient_id required (UUID, AH-XXXX or email)")
        raw_patient = data.patient_id
        patient_id = _resolve_user_id(db, raw_patient, "patient")
        if not patient_id:
            raise HTTPException(status_code=404, detail="Patient not found for that ID/email")
        if not is_assigned(db, user.id, patient_id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
        from app.api.routes.sharing import consent_allows
        if not consent_allows(db, patient_id, user.id, "chat"):
            raise HTTPException(status_code=403, detail="Patient disabled chat for you")
        _check_attachment(db, user, user.id, patient_id, data.attachment_document_id)
        return user.id, patient_id
    raise HTTPException(status_code=403, detail="Patients/doctors only")


@router.post("", response_model=MessageOut, status_code=201)
def send_message(data: MessageIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doctor_id, patient_id = _pair(db, user, data)
    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message is empty")
    sos = _sos(body)
    urgent = (data.priority == "urgent") or sos
    m = Message(doctor_id=doctor_id, patient_id=patient_id, sender_id=user.id, body=body,
                priority="urgent" if urgent else "normal",
                category=data.category or "general",
                attachment_document_id=data.attachment_document_id,
                sos_detected=sos)
    db.add(m)
    db.commit()
    db.refresh(m)
    other = patient_id if user.role == "doctor" else doctor_id
    prefix = "🆘 URGENT message" if urgent else "New message"
    title = f"{prefix} from {user.full_name}"
    preview = body[:200] + (" [attached report]" if data.attachment_document_id else "")
    if sos:
        preview += " — possible emergency keywords detected. If this is an emergency, also tap SOS."
    notify(db, other, "message", title, preview,
           link="/doctor" if user.role == "patient" else "/patient")
    # Urgent / SOS also tries SMS + email fan-out (best-effort).
    if urgent:
        try:
            phone = patient_phone(db, patient_id)
            who = f"Dr. {user.full_name}" if user.role == "doctor" else user.full_name
            if user.role == "doctor" and phone:
                notify_phone_sms(phone, f"MedRec URGENT from {who}: {body[:140]}")
            elif user.role == "patient":
                from app.models.tables import DoctorProfile
                prof = db.query(User).filter_by(id=doctor_id).first()
                _ = prof  # doctor gets in-app + email via notify(); SMS only if phone on file
        except Exception:
            pass
    return _out(db, m)


@router.get("", response_model=list[MessageOut])
def list_messages(doctor_id: str | None = None, patient_id: str | None = None,
                  q: str | None = None, category: str | None = None,
                  priority: str | None = None, limit: int = 300,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "patient":
        if not doctor_id:
            raise HTTPException(status_code=400, detail="doctor_id required (UUID, AH-XXXX or email)")
        doctor_id = _resolve_user_id(db, doctor_id, "doctor")
        if not doctor_id:
            raise HTTPException(status_code=404, detail="Doctor not found for that ID/email")
        query = db.query(Message).filter_by(doctor_id=doctor_id, patient_id=user.id)
    elif user.role == "doctor":
        if not patient_id:
            raise HTTPException(status_code=400, detail="patient_id required (UUID, AH-XXXX or email)")
        patient_id = _resolve_user_id(db, patient_id, "patient")
        if not patient_id:
            raise HTTPException(status_code=404, detail="Patient not found for that ID/email")
        query = db.query(Message).filter_by(doctor_id=user.id, patient_id=patient_id)
    else:
        raise HTTPException(status_code=403, detail="Patients/doctors only")
    if category:
        query = query.filter(Message.category == category)
    if priority:
        query = query.filter(Message.priority == priority)
    if q:
        like = f"%{q.strip()[:80]}%"
        query = query.filter(Message.body.ilike(like))
    rows = query.order_by(Message.created_at.asc()).limit(max(1, min(limit, 500))).all()
    now = datetime.utcnow()
    for m in rows:
        if m.sender_id != user.id and not m.read:
            m.read = True
            try:
                m.read_at = now
            except Exception:
                pass
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
                              "other_health_id": getattr(other, "health_id", None) if other else None,
                              "other_email": other.email if other else None,
                              "last_body": m.body[:120], "last_at": m.created_at, "unread": 0,
                              "last_priority": getattr(m, "priority", "normal"),
                              "last_category": getattr(m, "category", "general")}
    for m in rows:
        other_id = getattr(m, key)
        if m.sender_id != user.id and not m.read:
            seen[other_id]["unread"] += 1
    return list(seen.values())


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Bell badge source: total unread chat messages for this user."""
    if user.role == "patient":
        n = db.query(Message).filter_by(patient_id=user.id, read=False)\
            .filter(Message.sender_id != user.id).count()
    elif user.role == "doctor":
        n = db.query(Message).filter_by(doctor_id=user.id, read=False)\
            .filter(Message.sender_id != user.id).count()
    else:
        n = 0
    return {"unread": n}


@router.post("/video-request", status_code=201)
def video_request(data: VideoRequestIn, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    """Chat -> teleconsult in one tap: books a VIDEO slot + posts it as a chat message.

    Uses the doctor's weekly availability like normal booking. The Jitsi link is
    auto-generated by the scheduler, then dropped into the secure chat thread.
    """
    from app.models.tables import AvailabilitySlot, Appointment
    from app.api.routes.scheduling import _parse as _parse_time

    if user.role == "patient":
        doctor_id = _resolve_user_id(db, data.other_id, "doctor")
        if not doctor_id:
            raise HTTPException(status_code=404, detail="Doctor not found for that ID")
        if not is_assigned(db, doctor_id, user.id):
            raise HTTPException(status_code=403, detail="Doctor not assigned to you")
        patient_id = user.id
    elif user.role == "doctor":
        patient_id = _resolve_user_id(db, data.other_id, "patient")
        if not patient_id:
            raise HTTPException(status_code=404, detail="Patient not found for that ID")
        if not is_assigned(db, user.id, patient_id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
        doctor_id = user.id
    else:
        raise HTTPException(status_code=403, detail="Patients/doctors only")
    if data.date < date.today():
        raise HTTPException(status_code=400, detail="Cannot book in the past")
    start = _parse_time(data.start_time)
    slot = db.query(AvailabilitySlot).filter_by(
        doctor_id=doctor_id, weekday=data.date.weekday(), start_time=start).first()
    if not slot:
        raise HTTPException(status_code=400, detail="Doctor not available at that time — check their timings")
    clash = db.query(Appointment).filter_by(
        doctor_id=doctor_id, date=data.date, start_time=start, status="booked").first()
    if clash:
        raise HTTPException(status_code=400, detail="Slot already booked")
    try:
        from app.models.tables import DoctorLeave
        if db.query(DoctorLeave).filter_by(doctor_id=doctor_id, date=data.date).first():
            raise HTTPException(status_code=400, detail="Doctor is on leave that day")
    except HTTPException:
        raise
    except Exception:
        pass
    a = Appointment(doctor_id=doctor_id, patient_id=patient_id, date=data.date,
                    start_time=start, end_time=slot.end_time,
                    reason=data.reason or "Video consult requested from chat",
                    consult_type="video")
    db.add(a)
    db.commit()
    db.refresh(a)
    try:
        if not getattr(a, "video_url", None):
            a.video_url = f"https://meet.jit.si/MedRec-{str(a.id)[:8]}"
        day_count = db.query(Appointment).filter_by(doctor_id=doctor_id, date=data.date).count()
        if not getattr(a, "token_no", None):
            a.token_no = day_count or 1
        db.commit()
        db.refresh(a)
    except Exception:
        pass
    # Post into the secure thread so both sides see it next to the discussion.
    who = "you" if user.role == "patient" else "your doctor"
    body = (f"🎥 Video consult booked with {who}: {a.date} "
            f"{a.start_time.strftime('%H:%M')}–{a.end_time.strftime('%H:%M')} "
            f"(Token {getattr(a, 'token_no', '') or '—'}). Join: {a.video_url}")
    m = Message(doctor_id=doctor_id, patient_id=patient_id, sender_id=user.id,
                body=body, priority="normal", category="video")
    db.add(m)
    db.commit()
    other = patient_id if user.role == "doctor" else doctor_id
    doc = db.query(User).filter_by(id=doctor_id).first()
    notify(db, other, "appointment",
           f"Video consult booked: {a.date} {a.start_time.strftime('%H:%M')} "
           f"with Dr. {doc.full_name if doc else ''}",
           f"Join link in chat: {a.video_url}", link="/doctor" if user.role == "patient" else "/patient")
    notify(db, user.id, "appointment", "Video consult booked",
           f"{a.date} {a.start_time.strftime('%H:%M')} — link posted in chat.",
           link="/patient" if user.role == "patient" else "/doctor")
    return {"appointment_id": a.id, "date": a.date,
            "start_time": a.start_time.strftime("%H:%M"),
            "end_time": a.end_time.strftime("%H:%M"),
            "video_url": a.video_url, "message_id": m.id}
