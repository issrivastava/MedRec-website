"""Doctor practice suite: clinical workflow, OPD, engagement, AI/analytics, growth, safety.

All endpoints are doctor-only (assigned-patient checks where a patient is involved).
"""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.deps import require_doctor, is_assigned
from app.db.session import get_db
from app.models.tables import (
    User, VisitNote, Appointment, DoctorPatientAssignment, DoctorProfile,
    LabOrder, CarePlan, Certificate, DoctorLeave, DoctorBroadcast,
    PreVisit, Review, ReviewReply, AuditLog, Consent, ShareLink, Notification,
)
from app.schemas.schemas import (
    LabOrderIn, CarePlanIn, CertificateIn, LeaveIn, BroadcastIn,
    PreVisitIn, ReviewReplyIn, CheckinIn, SoapIn, InteractionIn,
)
from app.services.notify import notify

router = APIRouter()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _patient_name(db: Session, pid: str) -> str | None:
    p = db.query(User).filter_by(id=pid).first()
    return p.full_name if p else None


def _require_patient(db: Session, doctor_id: str, patient_id: str) -> User:
    if not is_assigned(db, doctor_id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    p = db.query(User).filter_by(id=patient_id, role="patient").first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p


def _audit(db: Session, actor_id: str, action: str, patient_id: str | None = None,
           detail: str | None = None) -> None:
    try:
        db.add(AuditLog(actor_id=actor_id, action=action, patient_id=patient_id, detail=detail))
        db.commit()
    except Exception:
        db.rollback()


def _lab_out(db: Session, r: LabOrder) -> dict:
    return {"id": r.id, "doctor_id": r.doctor_id, "patient_id": r.patient_id,
            "patient_name": _patient_name(db, r.patient_id), "test_name": r.test_name,
            "instructions": r.instructions, "status": r.status, "due_date": r.due_date,
            "result_doc_id": r.result_doc_id, "created_at": r.created_at}


def _plan_out(db: Session, r: CarePlan) -> dict:
    return {"id": r.id, "doctor_id": r.doctor_id, "patient_id": r.patient_id,
            "patient_name": _patient_name(db, r.patient_id), "title": r.title,
            "diagnosis_code": r.diagnosis_code, "diagnosis_name": r.diagnosis_name,
            "tasks": r.tasks, "status": r.status, "start_date": r.start_date,
            "end_date": r.end_date, "created_at": r.created_at}


def _cert_out(db: Session, r: Certificate) -> dict:
    return {"id": r.id, "doctor_id": r.doctor_id, "patient_id": r.patient_id,
            "patient_name": _patient_name(db, r.patient_id), "cert_type": r.cert_type,
            "title": r.title, "content": r.content, "valid_from": r.valid_from,
            "valid_until": r.valid_until, "created_at": r.created_at}


# ---------------------------------------------------------------------------
# 1. Clinical workflow: follow-ups, lab orders, care plans, certificates
# ---------------------------------------------------------------------------

@router.get("/followups")
def followups(filter: str = "all", db: Session = Depends(get_db),
              user: User = Depends(require_doctor)):
    """All visit notes with a follow-up date, split overdue / upcoming."""
    rows = db.query(VisitNote).filter(
        VisitNote.doctor_id == user.id,
        VisitNote.follow_up_date.isnot(None),
    ).order_by(VisitNote.follow_up_date.asc()).limit(500).all()
    today = date.today()
    out = []
    for v in rows:
        bucket = "overdue" if v.follow_up_date < today else "upcoming"
        if filter != "all" and bucket != filter:
            continue
        out.append({"id": v.id, "patient_id": v.patient_id,
                    "patient_name": _patient_name(db, v.patient_id),
                    "title": v.title, "note_type": v.note_type,
                    "visit_date": v.visit_date, "follow_up_date": v.follow_up_date,
                    "diagnosis_code": getattr(v, "diagnosis_code", None),
                    "diagnosis_name": getattr(v, "diagnosis_name", None),
                    "bucket": bucket,
                    "days_overdue": (today - v.follow_up_date).days if bucket == "overdue" else 0})
    return {"count": len(out),
            "overdue": sum(1 for r in out if r["bucket"] == "overdue"),
            "upcoming": sum(1 for r in out if r["bucket"] == "upcoming"),
            "results": out}


@router.get("/adherence")
def adherence(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Per-patient follow-up compliance: total / overdue / upcoming."""
    links = db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()
    today = date.today()
    out = []
    for link in links:
        notes = db.query(VisitNote).filter_by(doctor_id=user.id, patient_id=link.patient_id).all()
        fus = [n for n in notes if n.follow_up_date]
        overdue = sum(1 for n in fus if n.follow_up_date < today)
        upcoming = len(fus) - overdue
        out.append({"patient_id": link.patient_id, "patient_name": _patient_name(db, link.patient_id),
                    "visits": len(notes), "followups": len(fus),
                    "overdue": overdue, "upcoming": upcoming,
                    "last_visit": max((n.visit_date for n in notes if n.visit_date), default=None)})
    out.sort(key=lambda r: (-r["overdue"], -r["followups"]))
    return {"count": len(out), "results": out}


@router.post("/lab-orders", status_code=201)
def create_lab_order(data: LabOrderIn, db: Session = Depends(get_db),
                     user: User = Depends(require_doctor)):
    _require_patient(db, user.id, data.patient_id)
    r = LabOrder(doctor_id=user.id, patient_id=data.patient_id, test_name=data.test_name.strip(),
                 instructions=data.instructions, due_date=data.due_date)
    db.add(r)
    db.commit()
    db.refresh(r)
    notify(db, data.patient_id, "lab_order", f"Dr. {user.full_name} ordered: {r.test_name}",
           data.instructions, link="/patient")
    _audit(db, user.id, "lab_order", data.patient_id, r.test_name)
    return _lab_out(db, r)


@router.get("/lab-orders")
def list_lab_orders(patient_id: str | None = None, status: str | None = None,
                    db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    q = db.query(LabOrder).filter_by(doctor_id=user.id)
    if patient_id:
        q = q.filter_by(patient_id=patient_id)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(LabOrder.created_at.desc()).limit(300).all()
    return [_lab_out(db, r) for r in rows]


@router.patch("/lab-orders/{order_id}")
def lab_order_status(order_id: str, status: str, result_doc_id: str | None = None,
                     db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if status not in ("ordered", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    r = db.query(LabOrder).filter_by(id=order_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    r.status = status
    if result_doc_id is not None:
        r.result_doc_id = result_doc_id
    db.commit()
    return _lab_out(db, r)


@router.delete("/lab-orders/{order_id}", status_code=204)
def delete_lab_order(order_id: str, db: Session = Depends(get_db),
                     user: User = Depends(require_doctor)):
    r = db.query(LabOrder).filter_by(id=order_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
    return None


@router.post("/care-plans", status_code=201)
def create_care_plan(data: CarePlanIn, db: Session = Depends(get_db),
                     user: User = Depends(require_doctor)):
    _require_patient(db, user.id, data.patient_id)
    r = CarePlan(doctor_id=user.id, patient_id=data.patient_id, title=data.title.strip(),
                 diagnosis_code=data.diagnosis_code, diagnosis_name=data.diagnosis_name,
                 tasks=data.tasks, status=data.status,
                 start_date=data.start_date, end_date=data.end_date)
    db.add(r)
    db.commit()
    db.refresh(r)
    notify(db, data.patient_id, "care_plan", f"New care plan from Dr. {user.full_name}: {r.title}",
           None, link="/patient")
    _audit(db, user.id, "care_plan", data.patient_id, r.title)
    return _plan_out(db, r)


@router.get("/care-plans")
def list_care_plans(patient_id: str | None = None, status: str | None = None,
                    db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    q = db.query(CarePlan).filter_by(doctor_id=user.id)
    if patient_id:
        q = q.filter_by(patient_id=patient_id)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(CarePlan.created_at.desc()).limit(300).all()
    return [_plan_out(db, r) for r in rows]


@router.patch("/care-plans/{plan_id}")
def update_care_plan(plan_id: str, data: CarePlanIn, db: Session = Depends(get_db),
                     user: User = Depends(require_doctor)):
    r = db.query(CarePlan).filter_by(id=plan_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k != "patient_id":
            setattr(r, k, v)
    db.commit()
    return _plan_out(db, r)


@router.delete("/care-plans/{plan_id}", status_code=204)
def delete_care_plan(plan_id: str, db: Session = Depends(get_db),
                     user: User = Depends(require_doctor)):
    r = db.query(CarePlan).filter_by(id=plan_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
    return None


@router.post("/certificates", status_code=201)
def create_certificate(data: CertificateIn, db: Session = Depends(get_db),
                       user: User = Depends(require_doctor)):
    _require_patient(db, user.id, data.patient_id)
    r = Certificate(doctor_id=user.id, patient_id=data.patient_id, cert_type=data.cert_type,
                    title=data.title, content=data.content,
                    valid_from=data.valid_from, valid_until=data.valid_until)
    db.add(r)
    db.commit()
    db.refresh(r)
    notify(db, data.patient_id, "certificate",
           f"New {data.cert_type} certificate from Dr. {user.full_name}",
           (data.title or "")[:200], link="/patient")
    _audit(db, user.id, "certificate", data.patient_id, data.cert_type)
    return _cert_out(db, r)


@router.get("/certificates")
def list_certificates(patient_id: str | None = None, db: Session = Depends(get_db),
                      user: User = Depends(require_doctor)):
    q = db.query(Certificate).filter_by(doctor_id=user.id)
    if patient_id:
        q = q.filter_by(patient_id=patient_id)
    rows = q.order_by(Certificate.created_at.desc()).limit(300).all()
    return [_cert_out(db, r) for r in rows]


@router.delete("/certificates/{cert_id}", status_code=204)
def delete_certificate(cert_id: str, db: Session = Depends(get_db),
                       user: User = Depends(require_doctor)):
    r = db.query(Certificate).filter_by(id=cert_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
    return None


@router.get("/certificates/{cert_id}/pdf")
def certificate_pdf(cert_id: str, db: Session = Depends(get_db),
                    user: User = Depends(require_doctor)):
    from io import BytesIO
    r = db.query(Certificate).filter_by(id=cert_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    doc = db.query(User).filter_by(id=r.doctor_id).first()
    pat = db.query(User).filter_by(id=r.patient_id).first()
    try:
        prof = db.query(DoctorProfile).filter_by(user_id=r.doctor_id).first()
        spec = f"{prof.specialization or ''} {prof.license_no or ''}".strip() if prof else ""
    except Exception:
        spec = ""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.units import mm
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"<b>Dr. {doc.full_name if doc else ''}</b>{(' — ' + spec) if spec else ''}", styles["Title"]),
        Paragraph(f"Medical Certificate ({r.cert_type}) · MedRec", styles["Normal"]),
        HRFlowable(width="100%", thickness=1), Spacer(1, 6),
        Paragraph(f"Patient: <b>{pat.full_name if pat else ''}</b>", styles["Normal"]),
        Paragraph(f"Title: {r.title or r.cert_type}", styles["Normal"]),
        Paragraph(f"Valid: {r.valid_from or '—'} to {r.valid_until or '—'}", styles["Normal"]),
        Spacer(1, 6),
        Paragraph((r.content or "").replace("\n", "<br/>"), styles["Normal"]),
        Spacer(1, 12), HRFlowable(width="40%", thickness=1, hAlign="RIGHT"),
        Paragraph(f"<para alignment=right>Signature: <b>Dr. {doc.full_name if doc else ''}</b><br/>Date: {r.created_at.date()}</para>", styles["Normal"]),
    ]
    pdf.build(story)
    _audit(db, user.id, "certificate_pdf", r.patient_id, r.cert_type)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="cert-{cert_id[:8]}.pdf"'})


# ---------------------------------------------------------------------------
# 2. OPD / practice management: queue, check-in, fees, leave, calendar
# ---------------------------------------------------------------------------

@router.get("/queue")
def opd_queue(day: str | None = None, db: Session = Depends(get_db),
              user: User = Depends(require_doctor)):
    """Today's OPD queue: booked appts ordered by token, with check-in state."""
    try:
        target = date.fromisoformat(day) if day else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="day must be YYYY-MM-DD")
    rows = db.query(Appointment).filter_by(doctor_id=user.id, date=target)\
        .order_by(Appointment.start_time.asc()).all()
    # backfill missing token numbers by time order
    try:
        existing = sorted([a.token_no for a in rows if a.token_no])
        nxt = (max(existing) if existing else 0) + 1
        changed = False
        for a in sorted(rows, key=lambda x: (x.start_time.hour, x.start_time.minute)):
            if not a.token_no:
                a.token_no = nxt
                nxt += 1
                changed = True
        if changed:
            db.commit()
    except Exception:
        db.rollback()
    rows = sorted(rows, key=lambda a: (a.token_no or 9999))
    return {"date": target.isoformat(),
            "total": len(rows),
            "checked_in": sum(1 for a in rows if getattr(a, "checked_in", False)),
            "pending": sum(1 for a in rows if a.status == "booked" and not getattr(a, "checked_in", False)),
            "completed": sum(1 for a in rows if a.status == "completed"),
            "queue": [{"id": a.id, "token_no": getattr(a, "token_no", None),
                       "patient_id": a.patient_id,
                       "patient_name": _patient_name(db, a.patient_id),
                       "start_time": a.start_time.strftime("%H:%M"),
                       "end_time": a.end_time.strftime("%H:%M"),
                       "reason": a.reason, "status": a.status,
                       "consult_type": getattr(a, "consult_type", "in_person"),
                       "video_url": getattr(a, "video_url", None),
                       "checked_in": bool(getattr(a, "checked_in", False)),
                       "fee": getattr(a, "fee", None),
                       "payment_status": getattr(a, "payment_status", "unpaid")} for a in rows]}


@router.patch("/appointments/{appt_id}/checkin")
def checkin(appt_id: str, data: CheckinIn, db: Session = Depends(get_db),
            user: User = Depends(require_doctor)):
    a = db.query(Appointment).filter_by(id=appt_id, doctor_id=user.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    a.checked_in = data.checked_in
    if data.checked_in:
        from datetime import datetime as _dt
        a.checked_in_at = _dt.utcnow()
    if data.fee is not None:
        a.fee = data.fee
    if data.payment_status:
        a.payment_status = data.payment_status
    db.commit()
    _audit(db, user.id, "checkin", a.patient_id, f"appt {str(a.date)} token {a.token_no}")
    from app.api.routes.scheduling import _appt_out
    return _appt_out(db, a)


@router.patch("/appointments/{appt_id}/no-show")
def mark_no_show(appt_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_doctor)):
    a = db.query(Appointment).filter_by(id=appt_id, doctor_id=user.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    a.status = "no_show"
    db.commit()
    notify(db, a.patient_id, "appointment",
           f"Marked as no-show: {a.date} {a.start_time.strftime('%H:%M')} with Dr. {user.full_name}",
           "Please rebook if you still need the visit.", link="/patient")
    _audit(db, user.id, "no_show", a.patient_id, str(a.date))
    from app.api.routes.scheduling import _appt_out
    return _appt_out(db, a)


@router.get("/leaves")
def list_leaves(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    rows = db.query(DoctorLeave).filter_by(doctor_id=user.id)\
        .order_by(DoctorLeave.date.desc()).limit(100).all()
    return [{"id": r.id, "doctor_id": r.doctor_id, "date": r.date,
             "reason": r.reason, "created_at": r.created_at} for r in rows]


@router.post("/leaves", status_code=201)
def add_leave(data: LeaveIn, db: Session = Depends(get_db),
              user: User = Depends(require_doctor)):
    if data.date < date.today():
        raise HTTPException(status_code=400, detail="Cannot add leave in the past")
    if db.query(DoctorLeave).filter_by(doctor_id=user.id, date=data.date).first():
        raise HTTPException(status_code=400, detail="Leave already marked for that day")
    r = DoctorLeave(doctor_id=user.id, date=data.date, reason=data.reason)
    db.add(r)
    db.commit()
    db.refresh(r)
    clash = db.query(Appointment).filter_by(doctor_id=user.id, date=data.date, status="booked").count()
    _audit(db, user.id, "leave", None, f"{data.date} ({clash} booked)")
    return {"id": r.id, "doctor_id": r.doctor_id, "date": r.date,
            "reason": r.reason, "created_at": r.created_at,
            "booked_that_day": clash}


@router.delete("/leaves/{leave_id}", status_code=204)
def delete_leave(leave_id: str, db: Session = Depends(get_db),
                 user: User = Depends(require_doctor)):
    r = db.query(DoctorLeave).filter_by(id=leave_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
    return None


@router.get("/calendar.ics")
def calendar_ics(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Download upcoming appointments as an .ics calendar file (Google/Outlook import)."""
    rows = db.query(Appointment).filter_by(doctor_id=user.id, status="booked")\
        .filter(Appointment.date >= date.today()).order_by(Appointment.date.asc()).limit(200).all()
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MedRec//Doctor Schedule//EN"]
    for a in rows:
        d = a.date.strftime("%Y%m%d")
        s = a.start_time.strftime("%H%M%S")
        e = a.end_time.strftime("%H%M%S")
        pname = (_patient_name(db, a.patient_id) or "Patient").replace(",", " ")
        lines += ["BEGIN:VEVENT",
                  f"UID:{a.id}@medrec",
                  f"DTSTART:{d}T{s}", f"DTEND:{d}T{e}",
                  f"SUMMARY:OPD Token {getattr(a, 'token_no', '') or ''} — {pname}",
                  f"DESCRIPTION:{(a.reason or '')[:200]}",
                  "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return Response(content="\r\n".join(lines), media_type="text/calendar",
                    headers={"Content-Disposition": "attachment; filename=medrec-schedule.ics"})


# ---------------------------------------------------------------------------
# 3. Patient engagement: broadcasts, groups, pre-visit intake
# ---------------------------------------------------------------------------

@router.post("/broadcasts", status_code=201)
def create_broadcast(data: BroadcastIn, db: Session = Depends(get_db),
                     user: User = Depends(require_doctor)):
    b = DoctorBroadcast(doctor_id=user.id, title=data.title.strip(), body=data.body.strip())
    db.add(b)
    db.commit()
    db.refresh(b)
    links = db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()
    for link in links:
        try:
            db.add(Notification(user_id=link.patient_id, kind="doctor_broadcast",
                                title=f"Dr. {user.full_name}: {b.title}",
                                body=b.body[:500], link="/patient",
                                ref=f"broadcast:{b.id}:{link.patient_id}"))
        except Exception:
            pass
    db.commit()
    _audit(db, user.id, "broadcast", None, f"{b.title} -> {len(links)} patients")
    return {"id": b.id, "doctor_id": b.doctor_id, "title": b.title,
            "body": b.body, "created_at": b.created_at, "recipients": len(links)}


@router.get("/broadcasts")
def list_broadcasts(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    rows = db.query(DoctorBroadcast).filter_by(doctor_id=user.id)\
        .order_by(DoctorBroadcast.created_at.desc()).limit(50).all()
    return [{"id": r.id, "doctor_id": r.doctor_id, "title": r.title,
             "body": r.body, "created_at": r.created_at} for r in rows]


@router.get("/patient-groups")
def patient_groups(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Group assigned patients: chronic condition keywords + visit recency."""
    from app.models.tables import PatientProfile, HealthAlert
    links = db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()
    today = date.today()
    patients = []
    cond_counter: Counter = Counter()
    for link in links:
        p = db.query(User).filter_by(id=link.patient_id).first()
        if not p:
            continue
        prof = db.query(PatientProfile).filter_by(user_id=link.patient_id).first()
        chronic = (prof.chronic_conditions or "") if prof else ""
        for token in [t.strip().lower() for t in chronic.replace(";", ",").split(",") if t.strip()]:
            cond_counter[token] += 1
        notes = db.query(VisitNote).filter_by(doctor_id=user.id, patient_id=link.patient_id)\
            .order_by(VisitNote.visit_date.desc().nullslast()).limit(5).all()
        last_visit = next((n.visit_date for n in notes if n.visit_date), None)
        stale_days = (today - last_visit).days if last_visit else None
        unacked = db.query(HealthAlert).filter_by(patient_id=link.patient_id, acknowledged=False).count()
        patients.append({"patient_id": link.patient_id, "patient_name": p.full_name,
                         "patient_email": p.email, "chronic": chronic or None,
                         "visits": len(notes), "last_visit": last_visit,
                         "stale_days": stale_days, "unacked_alerts": unacked,
                         "needs_attention": unacked > 0 or (stale_days is not None and stale_days > 180)})
    patients.sort(key=lambda r: (not r["needs_attention"], -(r["stale_days"] or 0)))
    return {"count": len(patients),
            "top_conditions": [{"condition": k, "count": v} for k, v in cond_counter.most_common(10)],
            "stale_6m": sum(1 for r in patients if (r["stale_days"] or 0) > 180),
            "needs_attention": sum(1 for r in patients if r["needs_attention"]),
            "patients": patients}


@router.post("/pre-visits", status_code=201)
def create_previsit(data: PreVisitIn, db: Session = Depends(get_db),
                    user: User = Depends(require_doctor)):
    a = db.query(Appointment).filter_by(id=data.appointment_id, doctor_id=user.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if db.query(PreVisit).filter_by(appointment_id=a.id).first():
        raise HTTPException(status_code=400, detail="Intake already exists for this appointment")
    r = PreVisit(appointment_id=a.id, doctor_id=user.id, patient_id=a.patient_id,
                 questions=data.questions or ["Current symptoms?", "Any new medicines?",
                                              "Allergies flare-up?", "Anything to discuss?"],
                 answers=data.answers)
    db.add(r)
    db.commit()
    db.refresh(r)
    notify(db, a.patient_id, "pre_visit",
           f"Dr. {user.full_name} shared a pre-visit checklist for {a.date}",
           "Please answer before your visit.", link="/patient")
    return {"id": r.id, "appointment_id": r.appointment_id, "doctor_id": r.doctor_id,
            "patient_id": r.patient_id, "questions": r.questions, "answers": r.answers,
            "status": r.status, "created_at": r.created_at}


@router.get("/pre-visits")
def list_previsits(appointment_id: str | None = None, db: Session = Depends(get_db),
                   user: User = Depends(require_doctor)):
    q = db.query(PreVisit).filter_by(doctor_id=user.id)
    if appointment_id:
        q = q.filter_by(appointment_id=appointment_id)
    rows = q.order_by(PreVisit.created_at.desc()).limit(200).all()
    return [{"id": r.id, "appointment_id": r.appointment_id, "doctor_id": r.doctor_id,
             "patient_id": r.patient_id, "patient_name": _patient_name(db, r.patient_id),
             "questions": r.questions, "answers": r.answers,
             "status": r.status, "created_at": r.created_at} for r in rows]


# ---------------------------------------------------------------------------
# 4. AI + analytics: practice dashboard, SOAP draft, interaction check
# ---------------------------------------------------------------------------

@router.get("/analytics")
def practice_analytics(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    from app.models.tables import HealthAlert
    from sqlalchemy import func
    today = date.today()
    appts = db.query(Appointment).filter_by(doctor_id=user.id).all()
    # visits per week, last 8 weeks
    weeks: dict[str, int] = defaultdict(int)
    for i in range(8):
        key = (today - timedelta(days=7 * i)).isocalendar()[:2]
        weeks[f"{key[0]}-W{key[1]:02d}"] = 0
    for a in appts:
        if a.date and (today - a.date).days <= 56:
            key = a.date.isocalendar()[:2]
            weeks[f"{key[0]}-W{key[1]:02d}"] += 1
    by_status = Counter(a.status for a in appts)
    total = len(appts) or 1
    revenue = sum((a.fee or 0) for a in appts if getattr(a, "payment_status", "") == "paid")
    pending_fees = sum((a.fee or 0) for a in appts if getattr(a, "payment_status", "") != "paid" and a.fee)
    reasons = Counter((a.reason or "").strip().lower() for a in appts if a.reason)
    notes = db.query(VisitNote).filter_by(doctor_id=user.id).all()
    diagnoses = Counter((getattr(n, "diagnosis_name", "") or "").strip() for n in notes
                        if getattr(n, "diagnosis_name", ""))
    avg, count = db.query(func.avg(Review.rating), func.count(Review.id))\
        .filter_by(doctor_id=user.id).first()
    links = db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()
    new_30d = sum(1 for l in links if l.created_at and (datetime.utcnow() - l.created_at).days <= 30)
    return {"patients": len(links), "new_patients_30d": new_30d,
            "appointments_total": len(appts),
            "by_status": dict(by_status),
            "no_show_rate": round(by_status.get("no_show", 0) / total, 3),
            "visits_per_week": dict(sorted(weeks.items())),
            "top_reasons": [{"reason": k, "count": v} for k, v in reasons.most_common(8)],
            "top_diagnoses": [{"diagnosis": k, "count": v} for k, v in diagnoses.most_common(8)],
            "revenue_collected": round(revenue, 2), "fees_pending": round(pending_fees, 2),
            "notes_written": len(notes),
            "rating_avg": round(float(avg), 1) if avg is not None else None,
            "rating_count": count or 0,
            "unacked_alerts": db.query(HealthAlert).filter(
                HealthAlert.patient_id.in_([l.patient_id for l in links]),
                HealthAlert.acknowledged == False).count() if links else 0}  # noqa: E712


async def _ai_answer(prompt: str) -> tuple[str, str]:
    """Gemini first, Ollama fallback. Returns (answer, engine)."""
    from app.core.config import settings
    import httpx
    if settings.GEMINI_API_KEY:
        try:
            url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                   f"{settings.GEMINI_MODEL}:generateContent")
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json={
                    "systemInstruction": {"parts": [{"text": _AI_SYSTEM}]},
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.3},
                })
                r.raise_for_status()
                cands = r.json().get("candidates") or []
                parts = ((cands[0].get("content") or {}).get("parts") or []) if cands else []
                text = "".join(p.get("text", "") for p in parts).strip()
                if text:
                    return text, f"gemini:{settings.GEMINI_MODEL}"
        except Exception:
            pass
    import httpx as _hx
    async with _hx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{settings.OLLAMA_BASE_URL}/api/generate", json={
            "model": settings.OLLAMA_MODEL,
            "prompt": _AI_SYSTEM + "\n\n" + prompt, "stream": False})
        r.raise_for_status()
        text = (r.json().get("response") or "").strip()
        if not text:
            raise HTTPException(status_code=503, detail="AI engine returned nothing — start Ollama or set GEMINI_API_KEY")
        return text, f"ollama:{settings.OLLAMA_MODEL}"


_AI_SYSTEM = ("You are MedRec's clinical documentation helper for qualified doctors. "
              "Be concise and structured. You never replace clinical judgement: always "
              "remind the doctor to verify. Never address the patient directly.")


@router.post("/ai-soap")
async def ai_soap(data: SoapIn, db: Session = Depends(get_db),
                 user: User = Depends(require_doctor)):
    """Draft a SOAP note from free-text visit scribbles. Grounded in records if patient_id given."""
    ctx = ""
    if data.patient_id:
        _require_patient(db, user.id, data.patient_id)
        try:
            from app.models.tables import Vital, AiSummary, Document
            vits = db.query(Vital).filter_by(owner_id=data.patient_id)\
                .order_by(Vital.measured_at.desc()).limit(5).all()
            for v in vits:
                ctx += f"\n- Vital {v.vital_type}: {v.systolic or v.value}/{v.diastolic or ''} {v.unit or ''} on {v.measured_at}"
            docs = db.query(Document).filter_by(owner_id=data.patient_id)\
                .order_by(Document.visit_date.desc().nullslast()).limit(3).all()
            for d in docs:
                s = db.query(AiSummary).filter_by(document_id=d.id).first()
                ctx += f"\n- Report {d.title} ({d.visit_date}): {(s.summary_text[:300] if s else (d.ocr_text or '')[:300])}"
        except Exception:
            pass
    prompt = (f"Convert these visit scribbles into a SOAP note (Subjective, Objective, "
              f"Assessment, Plan bullets):\n\n{data.notes}\n"
              + (f"\nPatient context:{ctx}\n" if ctx else "")
              + "\nEnd with one line: 'Verify before filing.'")
    answer, engine = await _ai_answer(prompt)
    _audit(db, user.id, "ai_soap", data.patient_id, f"{len(data.notes)} chars via {engine}")
    return {"soap_draft": answer, "engine": engine,
            "disclaimer": "Draft only — verify and edit before filing."}


@router.post("/ai-interaction")
async def ai_interaction(data: InteractionIn, db: Session = Depends(get_db),
                        user: User = Depends(require_doctor)):
    """Flag likely drug-drug interactions in a medicine list (screening aid, not advice)."""
    meds = ", ".join(m.strip() for m in data.medicines if m.strip())
    if not meds:
        raise HTTPException(status_code=400, detail="No medicines given")
    prompt = (f"Medicine list for interaction screening: {meds}.\n"
              "List pairwise interactions worth checking (severity: major/moderate/minor + "
              "one-line mechanism + what to monitor). If none well-known, say so explicitly. "
              "Keep under 200 words.")
    answer, engine = await _ai_answer(prompt)
    _audit(db, user.id, "ai_interaction", None, meds[:200])
    return {"review": answer, "engine": engine,
            "disclaimer": "Screening aid only — confirm with a pharmacist/formulary."}


# ---------------------------------------------------------------------------
# 5. Growth: public profile preview, review replies
# ---------------------------------------------------------------------------

@router.get("/public-profile")
def public_profile(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    from sqlalchemy import func
    prof = db.query(DoctorProfile).filter_by(user_id=user.id).first()
    avg, count = db.query(func.avg(Review.rating), func.count(Review.id))\
        .filter_by(doctor_id=user.id).first()
    return {"doctor_id": user.id, "name": user.full_name, "email": user.email,
            "profile": {"specialization": getattr(prof, "specialization", None),
                        "license_no": getattr(prof, "license_no", None),
                        "hospital": getattr(prof, "hospital", None),
                        "phone": getattr(prof, "phone", None),
                        "education": getattr(prof, "education", None),
                        "experience_years": getattr(prof, "experience_years", None),
                        "consultation_fee": getattr(prof, "consultation_fee", None),
                        "languages": getattr(prof, "languages", None),
                        "bio": getattr(prof, "bio", None),
                        "clinic_address": getattr(prof, "clinic_address", None),
                        "timings": getattr(prof, "timings", None)} if prof else None,
            "rating_avg": round(float(avg), 1) if avg is not None else None,
            "rating_count": count or 0,
            "patients": db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).count(),
            "visits_completed": db.query(Appointment).filter_by(doctor_id=user.id, status="completed").count()}


@router.get("/review-replies")
def list_review_replies(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    revs = db.query(Review).filter_by(doctor_id=user.id).order_by(Review.created_at.desc()).all()
    replies = {r.review_id: r for r in db.query(ReviewReply).filter_by(doctor_id=user.id).all()}
    out = []
    for r in revs:
        pat = db.query(User).filter_by(id=r.patient_id).first()
        rp = replies.get(r.id)
        out.append({"review_id": r.id, "patient_name": pat.full_name if pat else None,
                    "rating": r.rating, "comment": r.comment, "created_at": r.created_at,
                    "reply": rp.reply if rp else None, "replied_at": rp.created_at if rp else None})
    return out


@router.post("/review-replies", status_code=201)
def reply_review(data: ReviewReplyIn, db: Session = Depends(get_db),
                 user: User = Depends(require_doctor)):
    r = db.query(Review).filter_by(id=data.review_id, doctor_id=user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Review not found")
    existing = db.query(ReviewReply).filter_by(review_id=r.id).first()
    if existing:
        existing.reply = data.reply.strip()
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "review_id": r.id, "doctor_id": user.id,
                "reply": existing.reply, "created_at": existing.created_at}
    rp = ReviewReply(review_id=r.id, doctor_id=user.id, reply=data.reply.strip())
    db.add(rp)
    db.commit()
    db.refresh(rp)
    notify(db, r.patient_id, "review_reply", f"Dr. {user.full_name} replied to your review",
           data.reply[:200], link="/patient")
    return {"id": rp.id, "review_id": r.id, "doctor_id": user.id,
            "reply": rp.reply, "created_at": rp.created_at}


# ---------------------------------------------------------------------------
# 6. Safety / collaboration: audit trail, consents, patient shares
# ---------------------------------------------------------------------------

@router.get("/audit")
def list_audit(limit: int = 100, db: Session = Depends(get_db),
               user: User = Depends(require_doctor)):
    rows = db.query(AuditLog).filter_by(actor_id=user.id)\
        .order_by(AuditLog.created_at.desc()).limit(min(limit, 300)).all()
    out = []
    for a in rows:
        pat = db.query(User).filter_by(id=a.patient_id).first() if a.patient_id else None
        out.append({"id": a.id, "action": a.action, "patient_id": a.patient_id,
                    "patient_name": pat.full_name if pat else None,
                    "detail": a.detail, "created_at": a.created_at})
    return {"count": len(out), "results": out}


@router.post("/audit", status_code=201)
def log_audit(action: str, patient_id: str | None = None, detail: str | None = None,
              db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if patient_id and not is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    _audit(db, user.id, action[:50], patient_id, (detail or "")[:500])
    return {"ok": True}


@router.get("/consents")
def my_patient_consents(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    rows = db.query(Consent).filter_by(doctor_id=user.id).all()
    out = []
    for c in rows:
        pat = db.query(User).filter_by(id=c.patient_id).first()
        out.append({"id": c.id, "patient_id": c.patient_id,
                    "patient_name": pat.full_name if pat else None,
                    "scope": c.scope, "allowed": c.allowed, "updated_at": c.updated_at})
    return out


@router.get("/shares")
def patient_shares(patient_id: str, db: Session = Depends(get_db),
                   user: User = Depends(require_doctor)):
    """See what an assigned patient has shared via expiring links (scope + expiry)."""
    _require_patient(db, user.id, patient_id)
    rows = db.query(ShareLink).filter_by(owner_id=patient_id)\
        .order_by(ShareLink.created_at.desc()).limit(50).all()
    _audit(db, user.id, "view_shares", patient_id, f"{len(rows)} links")
    return [{"id": r.id, "scope": r.scope, "label": r.label, "url_path": f"/s/{r.token}",
             "expires_at": r.expires_at, "max_views": r.max_views, "views": r.views,
             "revoked": r.revoked, "created_at": r.created_at} for r in rows]
