from datetime import date, time as dtime, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
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
    return _appt_out_with_map(a, {a.doctor_id: d, a.patient_id: p} if d or p else {})


def _appt_out_with_map(a: Appointment, users: dict) -> dict:
    """Bulk-safe serializer: pass a pre-fetched {user_id: User} map (no queries)."""
    d = users.get(a.doctor_id)
    p = users.get(a.patient_id)
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
    # Accept AH-XXXX / email too so chat can pass the ID directly.
    lookup = (doctor_id or "").strip()
    hid = lookup.upper().replace(" ", "")
    if hid.startswith("AH-"):
        u = db.query(User).filter_by(health_id=hid).first()
        if u and u.role == "doctor":
            doctor_id = u.id
    elif "@" in lookup:
        u = db.query(User).filter_by(email=lookup.lower()).first()
        if u and u.role == "doctor":
            doctor_id = u.id
    if user.role == "patient" and not is_assigned(db, doctor_id, user.id):
        raise HTTPException(status_code=403, detail="Doctor not assigned to you")
    return [_slot_out(s) for s in db.query(AvailabilitySlot).filter_by(doctor_id=doctor_id)
            .order_by(AvailabilitySlot.weekday, AvailabilitySlot.start_time).all()]


@router.get("/doctors/{doctor_id}/presence")
def doctor_presence(doctor_id: str, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Chat header data: timings line, on-leave-today, next bookable day.

    Accepts UUID, AH-XXXX or email. Patients must be assigned.
    """
    from datetime import timedelta
    lookup = (doctor_id or "").strip()
    hid = lookup.upper().replace(" ", "")
    target_id = lookup
    if hid.startswith("AH-"):
        u = db.query(User).filter_by(health_id=hid).first()
        if u and u.role == "doctor":
            target_id = u.id
    elif "@" in lookup:
        u = db.query(User).filter_by(email=lookup.lower()).first()
        if u and u.role == "doctor":
            target_id = u.id
    doc = db.query(User).filter_by(id=target_id, role="doctor").first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if user.role == "patient" and not is_assigned(db, target_id, user.id):
        raise HTTPException(status_code=403, detail="Doctor not assigned to you")
    slots = db.query(AvailabilitySlot).filter_by(doctor_id=target_id)\
        .order_by(AvailabilitySlot.weekday, AvailabilitySlot.start_time).all()
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    by_day: dict[int, list[str]] = {}
    for s in slots:
        by_day.setdefault(s.weekday, []).append(
            f"{s.start_time.strftime('%H:%M')}–{s.end_time.strftime('%H:%M')}")
    timings = " · ".join(f"{days[d]} {' ,'.join(v)}" for d, v in sorted(by_day.items()))
    on_leave = False
    try:
        from app.models.tables import DoctorLeave, DoctorPatientAssignment
        on_leave = db.query(DoctorLeave).filter_by(
            doctor_id=target_id, date=date.today()).first() is not None
        total = db.query(DoctorPatientAssignment).filter_by(doctor_id=target_id).count()
    except Exception:
        total = 0
    # Next day with a free slot (scan 14 days).
    next_avail = None
    try:
        from app.models.tables import Appointment
        for i in range(14):
            d = date.today() + timedelta(days=i)
            day_slots = [s for s in slots if s.weekday == d.weekday()]
            if not day_slots:
                continue
            try:
                from app.models.tables import DoctorLeave as _DL
                if db.query(_DL).filter_by(doctor_id=target_id, date=d).first():
                    continue
            except Exception:
                pass
            booked = {a.start_time.strftime("%H:%M") for a in db.query(Appointment)
                      .filter_by(doctor_id=target_id, date=d, status="booked").all()}
            if any(s.start_time.strftime("%H:%M") not in booked for s in day_slots):
                next_avail = d
                break
    except Exception:
        pass
    return {"doctor_id": target_id, "doctor_name": doc.full_name,
            "timings_line": timings, "on_leave_today": on_leave,
            "next_available": next_avail,
            "total_patients": total}


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
    elif user.role in ("receptionist", "nurse", "admin"):
        # Front desk books on behalf of any patient + doctor pair.
        if not data.doctor_id or not data.patient_id:
            raise HTTPException(status_code=400, detail="doctor_id and patient_id required")
        doctor_id, patient_id = data.doctor_id, data.patient_id
        if not db.query(User).filter_by(id=doctor_id, role="doctor").first():
            raise HTTPException(status_code=404, detail="Doctor not found")
        if not db.query(User).filter_by(id=patient_id, role="patient").first():
            raise HTTPException(status_code=404, detail="Patient not found")
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
    return _appt_out_with_map(a, {doctor_id: doc, patient_id: pat} if (doc or pat) else {})


@router.get("/appointments/my", response_model=list[AppointmentOut])
def my_appointments(limit: int = 100, offset: int = 0,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        limit = max(1, min(int(limit), settings.MAX_PAGE_SIZE))
    except Exception:
        limit = 100
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    if user.role == "patient":
        rows = db.query(Appointment).filter_by(patient_id=user.id).order_by(Appointment.date.desc()).limit(limit).offset(offset).all()
    elif user.role == "doctor":
        rows = db.query(Appointment).filter_by(doctor_id=user.id).order_by(Appointment.date.desc()).limit(limit).offset(offset).all()
    else:
        # receptionist / nurse / admin: whole clinic queue (front-desk view)
        rows = db.query(Appointment).order_by(Appointment.date.desc()).limit(limit).offset(offset).all()
    if not rows:
        return []
    # One bulk fetch for all names (was 2 queries per appointment).
    ids = list({a.doctor_id for a in rows} | {a.patient_id for a in rows})
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    return [_appt_out_with_map(a, users) for a in rows]


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
    # receptionist / nurse / admin may update any appointment (front desk)
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


@router.patch("/appointments/{appt_id}/reschedule", response_model=AppointmentOut)
def reschedule(appt_id: str, date: str, start_time: str,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Move a booked appointment to a new date/time (keeps token + history)."""
    from datetime import date as _date
    a = db.query(Appointment).filter_by(id=appt_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == "patient" and a.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    if user.role == "doctor" and a.doctor_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    if a.status != "booked":
        raise HTTPException(status_code=400, detail="Only booked appointments can be rescheduled")
    try:
        new_date = _date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    if new_date < _date.today():
        raise HTTPException(status_code=400, detail="Cannot reschedule to the past")
    start = _parse(start_time)
    slot = db.query(AvailabilitySlot).filter_by(
        doctor_id=a.doctor_id, weekday=new_date.weekday(), start_time=start).first()
    if not slot:
        raise HTTPException(status_code=400, detail="Doctor not available at that time")
    clash = db.query(Appointment).filter_by(
        doctor_id=a.doctor_id, date=new_date, start_time=start, status="booked").first()
    if clash and clash.id != a.id:
        raise HTTPException(status_code=400, detail="Slot already booked")
    try:
        from app.models.tables import DoctorLeave
        if db.query(DoctorLeave).filter_by(doctor_id=a.doctor_id, date=new_date).first():
            raise HTTPException(status_code=400, detail="Doctor is on leave that day")
    except HTTPException:
        raise
    except Exception:
        pass
    old = f"{a.date} {a.start_time.strftime('%H:%M')}"
    a.date, a.start_time, a.end_time = new_date, start, slot.end_time
    db.commit()
    notify(db, a.doctor_id, "appointment", f"Rescheduled: {old} -> {new_date} {start_time}",
           None, link="/doctor")
    notify(db, a.patient_id, "appointment", f"Rescheduled: {old} -> {new_date} {start_time}",
           None, link="/patient")
    return _appt_out(db, a)


@router.post("/appointments/walk-in", response_model=AppointmentOut, status_code=201)
def walk_in(data: AppointmentIn, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    """Front-desk walk-in: no availability-slot check, auto-assigns next token for today."""
    from datetime import date as _date, time as _time
    if user.role not in ("receptionist", "nurse", "admin", "doctor"):
        raise HTTPException(status_code=403, detail="Front desk only")
    doctor_id = data.doctor_id or (user.id if user.role == "doctor" else None)
    if not doctor_id or not data.patient_id:
        raise HTTPException(status_code=400, detail="doctor_id and patient_id required")
    target = data.date or _date.today()
    try:
        start = _parse(data.start_time) if data.start_time else _time(9, 0)
    except Exception:
        raise HTTPException(status_code=400, detail="start_time must be HH:MM")
    day_count = db.query(Appointment).filter_by(doctor_id=doctor_id, date=target).count()
    a = Appointment(doctor_id=doctor_id, patient_id=data.patient_id, date=target,
                    start_time=start, end_time=_time(start.hour + 1, start.minute) if start.hour < 23 else start,
                    reason=data.reason or "Walk-in", status="booked",
                    token_no=(day_count or 0) + 1, checked_in=True,
                    family_member_id=data.family_member_id,
                    consult_type=getattr(data, "consult_type", "in_person") or "in_person")
    try:
        from datetime import datetime as _dt
        a.checked_in_at = _dt.utcnow()
    except Exception:
        pass
    db.add(a)
    db.commit()
    db.refresh(a)
    _ensure_video(a)
    db.commit()
    db.refresh(a)
    notify(db, a.patient_id, "appointment",
           f"Walk-in token {a.token_no} with Dr. {(db.query(User).filter_by(id=doctor_id).first().full_name if db.query(User).filter_by(id=doctor_id).first() else '')} on {target}",
           data.reason, link="/patient")
    return _appt_out(db, a)


@router.get("/appointments/calendar")
def calendar_view(from_date: str | None = None, to_date: str | None = None,
                  doctor_id: str | None = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Calendar feed: appointments grouped by date for a doctor (or whole clinic for staff)."""
    from datetime import date as _date, timedelta
    today = _date.today()
    try:
        start = _date.fromisoformat(from_date) if from_date else today
        end = _date.fromisoformat(to_date) if to_date else today + timedelta(days=7)
    except ValueError:
        raise HTTPException(status_code=400, detail="dates must be YYYY-MM-DD")
    q = db.query(Appointment).filter(Appointment.date >= start, Appointment.date <= end)
    if user.role == "patient":
        q = q.filter_by(patient_id=user.id)
    elif user.role == "doctor":
        q = q.filter_by(doctor_id=user.id)
    elif doctor_id:
        q = q.filter_by(doctor_id=doctor_id)
    rows = q.order_by(Appointment.date.asc(), Appointment.start_time.asc()).limit(1000).all()
    ids = list({a.doctor_id for a in rows} | {a.patient_id for a in rows})
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    grouped: dict[str, list] = {}
    for a in rows:
        grouped.setdefault(a.date.isoformat(), []).append(_appt_out_with_map(a, users))
    return {"from": start.isoformat(), "to": end.isoformat(), "days": grouped}
