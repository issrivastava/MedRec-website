from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import (
    Document, LabResult, DocumentVersion, AiSummaryHistory, VisitNote, FamilyMember, User,
)
from app.schemas.schemas import LabResultOut, DocumentVersionOut

router = APIRouter()


def _check_doc_access(db: Session, user: User, doc: Document) -> None:
    if doc.owner_id == user.id:
        return
    if user.role == "doctor":
        from app.models.tables import DoctorPatientAssignment

        if db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id, patient_id=doc.owner_id).first():
            return
    raise HTTPException(status_code=404, detail="Document not found")


@router.get("/labs/results", response_model=list[LabResultOut])
def lab_results(
    test_key: str | None = None,
    family_member_id: str | None = None,
    patient_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All persisted lab values for trends. Patients auto-scoped to self; doctors pass patient_id."""
    pid = resolve_patient_id(db, user, patient_id)
    q = db.query(LabResult).filter_by(owner_id=pid)
    if test_key:
        q = q.filter_by(test_key=test_key)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    return q.order_by(LabResult.measured_at.asc().nullslast(), LabResult.created_at.asc()).all()


@router.get("/labs/trends", response_model=dict)
def lab_trends(
    patient_id: str | None = None,
    family_member_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Grouped time-series per test: {test_key: {display_name, unit, points: [{date, value, flag, doc_id}]}}."""
    pid = resolve_patient_id(db, user, patient_id)
    q = db.query(LabResult).filter_by(owner_id=pid)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    rows = q.order_by(LabResult.measured_at.asc().nullslast(), LabResult.created_at.asc()).all()
    grouped: dict = {}
    for r in rows:
        g = grouped.setdefault(r.test_key, {"display_name": r.display_name, "unit": r.unit, "points": []})
        g["points"].append({
            "date": r.measured_at.isoformat() if r.measured_at else r.created_at.date().isoformat(),
            "value": r.value,
            "flag": r.flag,
            "doc_id": r.document_id,
        })
    members = {m.id: m.name for m in db.query(FamilyMember).filter_by(owner_id=pid).all()}
    return {"patient_id": pid, "tests": grouped, "members": members}


@router.get("/documents/{doc_id}/history", response_model=dict)
def document_history(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Full per-report history: current doc + versions + lab values + AI summary history."""
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _check_doc_access(db, user, doc)
    versions = db.query(DocumentVersion).filter_by(document_id=doc.id).order_by(DocumentVersion.version_no.asc()).all()
    labs = db.query(LabResult).filter_by(document_id=doc.id).all()
    summaries = db.query(AiSummaryHistory).filter_by(document_id=doc.id).order_by(AiSummaryHistory.created_at.desc()).all()
    current = {
        "id": doc.id, "title": doc.title, "doc_type": doc.doc_type, "doctor_name": doc.doctor_name,
        "hospital": doc.hospital, "visit_date": doc.visit_date, "notes": doc.notes,
        "family_member_id": doc.family_member_id, "created_at": doc.created_at,
    }
    return {
        "document": current,
        "versions": [
            {"id": v.id, "version_no": v.version_no, "title": v.title, "notes": v.notes,
             "visit_date": v.visit_date, "doctor_name": v.doctor_name, "hospital": v.hospital,
             "created_at": v.created_at} for v in versions
        ],
        "labs": [
            {"id": l.id, "test_key": l.test_key, "display_name": l.display_name, "value": l.value,
             "unit": l.unit, "flag": l.flag} for l in labs
        ],
        "summaries": [
            {"id": s.id, "summary_text": s.summary_text, "language": s.language,
             "model_used": s.model_used, "created_at": s.created_at} for s in summaries
        ],
    }


@router.get("/documents/{doc_id}/versions", response_model=list[DocumentVersionOut])
def list_versions(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _check_doc_access(db, user, doc)
    return db.query(DocumentVersion).filter_by(document_id=doc.id).order_by(DocumentVersion.version_no.asc()).all()


@router.get("/prescriptions/trends", response_model=list[dict])
def prescription_trends(
    family_member_id: str | None = None,
    patient_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Every prescribed medicine over time, grouped by medicine name (per profile)."""
    pid = resolve_patient_id(db, user, patient_id)
    q = db.query(VisitNote).filter_by(patient_id=pid)
    # Family filter only if column exists (fresh + migrated DBs)
    try:
        if family_member_id:
            q = q.filter_by(family_member_id=family_member_id)
        rows = q.order_by(VisitNote.visit_date.desc().nullslast(), VisitNote.created_at.desc()).all()
    except Exception:
        rows = db.query(VisitNote).filter_by(patient_id=pid).all()
    grouped: dict[str, list] = defaultdict(list)
    for v in rows:
        doc = db.query(User).filter_by(id=v.doctor_id).first()
        when = v.visit_date.isoformat() if v.visit_date else v.created_at.date().isoformat()
        for m in v.medicines or []:
            name = (m.get("name") if isinstance(m, dict) else str(m)) or "Unknown"
            grouped[name].append({
                "date": when,
                "dosage": m.get("dosage") if isinstance(m, dict) else None,
                "frequency": m.get("frequency") if isinstance(m, dict) else None,
                "duration": m.get("duration") if isinstance(m, dict) else None,
                "doctor": doc.full_name if doc else None,
                "visit_id": v.id,
                "title": v.title,
            })
    members = {m.id: m.name for m in db.query(FamilyMember).filter_by(owner_id=pid).all()}
    return [{"medicine": k, "entries": v, "count": len(v)} for k, v in sorted(grouped.items())] + (
        [{"_members": members}] if members else []
    )


@router.get("/overview", response_model=dict)
def analytics_overview(
    patient_id: str | None = None,
    family_member_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Counts per profile for the analytics dashboard: docs, labs, versions, prescriptions."""
    pid = resolve_patient_id(db, user, patient_id)
    dq = db.query(Document).filter_by(owner_id=pid)
    lq = db.query(LabResult).filter_by(owner_id=pid)
    vq = db.query(VisitNote).filter_by(patient_id=pid)
    if family_member_id:
        dq = dq.filter_by(family_member_id=family_member_id)
        lq = lq.filter_by(family_member_id=family_member_id)
        try:
            vq = vq.filter_by(family_member_id=family_member_id)
        except Exception:
            pass
    docs = dq.count()
    labs = lq.count()
    prescriptions = vq.filter_by(note_type="prescription").count() if hasattr(VisitNote, "note_type") else 0
    tests = sorted({r.test_key for r in lq.all()})
    return {"patient_id": pid, "documents": docs, "lab_values": labs, "prescriptions": prescriptions,
            "tracked_tests": tests}
