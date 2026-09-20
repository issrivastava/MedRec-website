from datetime import date, time as dtime, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_doctor, is_assigned
from app.db.session import get_db
from app.models.tables import AvailabilitySlot, Appointment, User
from app.schemas.schemas import AvailabilityIn, AvailabilityOut, AppointmentIn, AppointmentOut
from app.services.notify import notify, patient_phone, notify_phone_sms

router = APIRouter()
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _parse(t: str) -> dtime:
    h, m = map(int, t.split(":"))
    return dtime(h, m)


def _slot_out(s: AvailabilitySlot) -> dict:
    return {"id": s.id, "doctor_id": s.doctor_id, "weekday": s.weekday,
            "start_time": s.start_time.strftime("%H:%M"), "end_time": s.end_time.strftime("%H:%M")}


def _appt_out(db: Session, a: Appointment) -> dict:
    d = db.query(User).filter_by(id=a.doctor_id).first()
    p = db.query(User).filter_by(id=a.patient_id).first()
    return {"id": a.id, "doctor_id": a.doctor_id, "patient_id": a.patient_id,
            "family_member_id": getattr(a, "family_member_id", None),
            "doctor_name": d.full_name if d else None, "patient_name": p.full_name if p else None,
            "date": a.date, "start_time": a.start_time.strftime("%H:%M"),
            "end_time": a.end_time.strftime("%H:%M"), "reason": a.reason,
            "status": a.status, "consult_type": getattr(a, "consult_type", "in_person") or "in_person",
            "video_url": getattr(a, "video_url", None),
            "cancel_reason": getattr(a, "cancel_reason", None),
            "token_no": getattr(a, "token_no", None),
            "checked_in": bool(getattr(a, "checked_in", False)),
            "fee": getattr(a, "fee", None),
            "payment_status": getattr(a, "payment_status", "unpaid") or "unpaid",
            "created_at": a.created_at}


def _ensure_video(a: Appointment) -> None:
    if getattr(a, "consult_type", None) == "video" and not getattr(a, "video_url", None):
        a.video_url = f"https://meet.jit.si/MedRec-{str(a.id)[:8]}"


# ---- availability ----
@router.get("/availability/my", response_model=list[AvailabilityOut])
def my_slots(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    return [_slot_out(s) for s in db.query(AvailabilitySlot).filter_by(doctor_id=user.id)
            .order_by(AvailabilitySlot.weekday, AvailabilitySlot.start_time).all()]


@router.post("/availability", response_model=AvailabilityOut, status_code=201)
def add_slot(data: AvailabilityIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    start, end = _parse(data.start_time), _parse(data.end_time)
    if start >= end:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    if db.query(AvailabilitySlot).filter_by(doctor_id=user.id, weekday=data.weekday, start_time=start).first():
        raise HTTPException(status_code=400, detail="Slot already exists")
    s = AvailabilitySlot(doctor_id=user.id, weekday=data.weekday, start_time=start, end_time=end)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _slot_out(s)


@router.delete("/availability/{slot_id}", status_code=204)
def delete_slot(slot_id: str, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    s = db.query(AvailabilitySlot).filter_by(id=slot_id, doctor_id=user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Slot not found")
    db.delete(s)
    db.commit()
    return None


@router.get("/doctors/{doctor_id}/availability", response_model=list[AvailabilityOut])
def doctor_slots(doctor_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "patient" and not is_assigned(db, doctor_id, user.id):
        raise HTTPException(status_code=403, detail="Doctor not assigned to you")
    return [_slot_out(s) for s in db.query(AvailabilitySlot).filter_by(doctor_id=doctor_id)
            .order_by(AvailabilitySlot.weekday, AvailabilitySlot.start_time).all()]


# ---- appointments ----
@router.post("/appointments", response_model=AppointmentOut, status_code=201)
def book(data: AppointmentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "patient":
        if not data.doctor_id:
            raise HTTPException(status_code=400, detail="doctor_id required")
        if not is_assigned(db, data.doctor_id, user.id):
            raise HTTPException(status_code=403, detail="Doctor not assigned to you")
        doctor_id, patient_id = data.doctor_id, user.id
    elif user.role == "doctor":
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="patient_id required: pick the patient")
        if not is_assigned(db, user.id, data.patient_id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
        doctor_id, patient_id = user.id, data.patient_id
    else:
        raise HTTPException(status_code=403, detail="Patients and doctors only")
    if data.date < date.today():
        raise HTTPException(status_code=400, detail="Cannot book in the past")
    if data.family_member_id:
        from app.models.tables import FamilyMember
        if not db.query(FamilyMember).filter_by(id=data.family_member_id, owner_id=patient_id).first():
            raise HTTPException(status_code=400, detail="Unknown family member")
    start = _parse(data.start_time)
    slot = db.query(AvailabilitySlot).filter_by(
        doctor_id=doctor_id, weekday=data.date.weekday(), start_time=start).first()
    if not slot:
        raise HTTPException(status_code=400, detail="Doctor not available at that time")
    clash = db.query(Appointment).filter_by(
        doctor_id=doctor_id, date=data.date, start_time=start, status="booked").first()
    if clash:
        raise HTTPException(status_code=400, detail="Slot already booked")
    # block booking on doctor leave days
    try:
        from app.models.tables import DoctorLeave
        if db.query(DoctorLeave).filter_by(doctor_id=doctor_id, date=data.date).first():
            raise HTTPException(status_code=400, detail="Doctor is on leave that day")
    except HTTPException:
        raise
    except Exception:
        pass
    # next token number for the day
    try:
        day_count = db.query(Appointment).filter_by(doctor_id=doctor_id, date=data.date).count()
        token_no = (day_count or 0) + 1
    except Exception:
        token_no = None
    a = Appointment(doctor_id=doctor_id, patient_id=patient_id, date=data.date,
                    start_time=start, end_time=slot.end_time, reason=data.reason,
                    family_member_id=data.family_member_id,
                    consult_type=getattr(data, "consult_type", "in_person") or "in_person")
    db.add(a)
    db.commit()
    db.refresh(a)
    try:
        if token_no:
            a.token_no = token_no
        _ensure_video(a)
        db.commit()
        db.refresh(a)
    except Exception:
        pass
    doc = db.query(User).filter_by(id=doctor_id).first()
    pat = db.query(User).filter_by(id=patient_id).first()
    notify(db, doctor_id, "appointment",
           f"New appointment: {pat.full_name if pat else patient_id} on {data.date} {data.start_time}",
           data.reason, link="/doctor")
    notify(db, patient_id, "appointment",
           f"Appointment booked with Dr. {doc.full_name if doc else ''} on {data.date} {data.start_time}",
           data.reason, link="/patient")
    return _appt_out(db, a)


@router.get("/appointments/my", response_model=list[AppointmentOut])
def my_appointments(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "patient":
        rows = db.query(Appointment).filter_by(patient_id=user.id).order_by(Appointment.date.desc()).all()
    elif user.role == "doctor":
        rows = db.query(Appointment).filter_by(doctor_id=user.id).order_by(Appointment.date.desc()).all()
    else:
        rows = db.query(Appointment).order_by(Appointment.date.desc()).limit(200).all()
    return [_appt_out(db, a) for a in rows]


@router.patch("/appointments/{appt_id}", response_model=AppointmentOut)
def set_status(appt_id: str, status: str, cancel_reason: str | None = None,
               consult_type: str | None = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if status not in ("booked", "cancelled", "completed", "no_show"):
        raise HTTPException(status_code=400, detail="Invalid status")
    a = db.query(Appointment).filter_by(id=appt_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == "patient" and a.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    if user.role == "doctor" and a.doctor_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    a.status = status
    if cancel_reason is not None:
        try:
            a.cancel_reason = cancel_reason
        except Exception:
            pass
    if consult_type in ("in_person", "video"):
        try:
            a.consult_type = consult_type
            _ensure_video(a)
        except Exception:
            pass
    db.commit()
    other = a.doctor_id if user.role == "patient" else a.patient_id
    notify(db, other, "appointment", f"Appointment {status}: {a.date} {a.start_time.strftime('%H:%M')}",
           None, link="/doctor" if user.role == "patient" else "/patient")
    return _appt_out(db, a)
