from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import Document, VisitNote, Appointment, FamilyMember, User

router = APIRouter()


@router.get("", response_model=list[dict])
def timeline(patient_id: str | None = None, category: str | None = None, report_kind: str | None = None,
             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """All reports, prescriptions, notes and appointments on one health timeline."""
    pid = resolve_patient_id(db, user, patient_id)
    members = {m.id: m.name for m in db.query(FamilyMember).filter_by(owner_id=pid).all()}
    events: list[dict] = []

    for d in db.query(Document).filter_by(owner_id=pid).all():
        if category and getattr(d, "category", None) != category:
            continue
        if report_kind and getattr(d, "report_kind", None) != report_kind:
            continue
        when = d.visit_date.isoformat() if d.visit_date else d.created_at.date().isoformat()
        kind_label = getattr(d, "report_kind", None) or d.doc_type
        events.append({"date": when, "kind": "document", "title": d.title,
                       "detail": f"[{kind_label}] {d.doctor_name or ''}".strip(),
                       "member": members.get(d.family_member_id) if d.family_member_id else None,
                       "member_id": d.family_member_id,
                       "category": getattr(d, "category", None),
                       "report_kind": getattr(d, "report_kind", None),
                       "id": d.id})
    for v in db.query(VisitNote).filter_by(patient_id=pid).all():
        when = (v.visit_date.isoformat() if v.visit_date else v.created_at.date().isoformat())
        doc = db.query(User).filter_by(id=v.doctor_id).first()
        events.append({"date": when, "kind": "prescription" if v.note_type == "prescription" else "visit",
                       "title": v.title or f"Dr. {doc.full_name if doc else ''} note",
                       "detail": (v.content or "")[:160], "member": None, "member_id": getattr(v, "family_member_id", None),
                       "id": v.id})
    for a in db.query(Appointment).filter_by(patient_id=pid).all():
        doc = db.query(User).filter_by(id=a.doctor_id).first()
        events.append({"date": a.date.isoformat(), "kind": "appointment",
                       "title": f"Appointment — Dr. {doc.full_name if doc else ''} [{a.status}]",
                       "detail": a.reason or "", "member": None,
                       "member_id": getattr(a, "family_member_id", None), "id": a.id})

    events.sort(key=lambda e: e["date"], reverse=True)
    return events
