from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import Document, VisitNote, Appointment, FamilyMember, User

router = APIRouter()


@router.get("", response_model=list[dict])
def timeline(patient_id: str | None = None, category: str | None = None, report_kind: str | None = None,
             limit: int = 200, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """All reports, prescriptions, notes and appointments on one health timeline."""
    try:
        limit = max(1, min(int(limit), 500))
    except Exception:
        limit = 200
    pid = resolve_patient_id(db, user, patient_id)
    members = {m.id: m.name for m in db.query(FamilyMember).filter_by(owner_id=pid).all()}
    events: list[dict] = []

    dq = db.query(Document).filter_by(owner_id=pid)
    if category:
        dq = dq.filter(Document.category == category)
    if report_kind:
        dq = dq.filter(Document.report_kind == report_kind)
    per_kind = max(1, limit // 3 + 10)
    docs = dq.order_by(Document.visit_date.desc().nullslast(), Document.created_at.desc()).limit(per_kind).all()
    for d in docs:
        when = d.visit_date.isoformat() if d.visit_date else d.created_at.date().isoformat()
        kind_label = getattr(d, "report_kind", None) or d.doc_type
        # Uploaded prescriptions are clinical paperwork, not lab reports —
        # surface them as their own timeline kind so filters/badges match.
        event_kind = "prescription" if d.doc_type == "prescription" else "document"
        events.append({"date": when, "kind": event_kind, "title": d.title,
                       "detail": f"[{kind_label}] {d.doctor_name or ''}".strip(),
                       "member": members.get(d.family_member_id) if d.family_member_id else None,
                       "member_id": d.family_member_id,
                       "doc_type": d.doc_type,
                       "category": getattr(d, "category", None),
                       "report_kind": getattr(d, "report_kind", None),
                       "id": d.id})
    visit_rows = (db.query(VisitNote).filter_by(patient_id=pid)
                  .order_by(VisitNote.created_at.desc()).limit(per_kind).all())
    appt_rows = (db.query(Appointment).filter_by(patient_id=pid)
                 .order_by(Appointment.date.desc()).limit(per_kind).all())
    # Bulk-fetch doctor names in one query (was one query per note/appointment).
    doctor_ids = list({v.doctor_id for v in visit_rows} | {a.doctor_id for a in appt_rows})
    doctors = {u.id: u for u in db.query(User).filter(User.id.in_(doctor_ids)).all()} if doctor_ids else {}
    for v in visit_rows:
        when = (v.visit_date.isoformat() if v.visit_date else v.created_at.date().isoformat())
        doc = doctors.get(v.doctor_id)
        events.append({"date": when, "kind": "prescription" if v.note_type == "prescription" else "visit",
                       "title": v.title or f"Dr. {doc.full_name if doc else ''} note",
                       "detail": (v.content or "")[:160], "member": None, "member_id": getattr(v, "family_member_id", None),
                       "id": v.id})
    for a in appt_rows:
        doc = doctors.get(a.doctor_id)
        events.append({"date": a.date.isoformat(), "kind": "appointment",
                       "title": f"Appointment — Dr. {doc.full_name if doc else ''} [{a.status}]",
                       "detail": a.reason or "", "member": None,
                       "member_id": getattr(a, "family_member_id", None), "id": a.id})

    events.sort(key=lambda e: e["date"], reverse=True)
    return events[:limit]
