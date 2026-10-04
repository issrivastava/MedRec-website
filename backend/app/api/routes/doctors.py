from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.deps import require_doctor, get_current_user
from app.db.session import get_db
from app.models.tables import (
    DoctorProfile, DoctorPatientAssignment, PatientProfile, User, Document,
)
from app.schemas.schemas import (
    DoctorProfileIn, DoctorProfileOut, AssignmentCreate, AssignmentOut,
    PatientProfileOut, UserOut,
)
from app.services.notify import notify

router = APIRouter()


def _get_or_create(db: Session, user: User) -> DoctorProfile:
    prof = db.query(DoctorProfile).filter(DoctorProfile.user_id == user.id).first()
    if not prof:
        prof = DoctorProfile(user_id=user.id)
        db.add(prof)
        db.commit()
        db.refresh(prof)
    return prof


def _is_assigned(db: Session, doctor_id: str, patient_id: str) -> bool:
    return (
        db.query(DoctorPatientAssignment)
        .filter_by(doctor_id=doctor_id, patient_id=patient_id)
        .first()
        is not None
    )


@router.get("/me", response_model=DoctorProfileOut)
def get_my_profile(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    return _get_or_create(db, user)


@router.put("/me", response_model=DoctorProfileOut)
def update_my_profile(
    data: DoctorProfileIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)
):
    prof = _get_or_create(db, user)
    patch = data.model_dump(exclude_unset=True)
    # license_no is globally unique — give a 400 instead of a 500 IntegrityError.
    if "license_no" in patch and patch["license_no"]:
        clash = (
            db.query(DoctorProfile)
            .filter(DoctorProfile.license_no == patch["license_no"],
                    DoctorProfile.user_id != user.id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="That license number is already used by another doctor")
    for k, v in patch.items():
        setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof


@router.get("/patients", response_model=list[AssignmentOut])
def my_patients(limit: int = 200, offset: int = 0,
                db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Assigned-patients dropdown source: only linked patients."""
    try:
        limit = max(1, min(int(limit), 500))
    except Exception:
        limit = 200
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    links = (db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id)
             .order_by(DoctorPatientAssignment.created_at.desc())
             .limit(limit).offset(offset).all())
    if not links:
        return []
    # Bulk-fetch users in 2 queries (was 2 queries per link).
    patient_ids = list({l.patient_id for l in links})
    doctor_ids = list({l.doctor_id for l in links})
    patients = {u.id: u for u in db.query(User).filter(User.id.in_(patient_ids)).all()} if patient_ids else {}
    doctors = {u.id: u for u in db.query(User).filter(User.id.in_(doctor_ids)).all()} if doctor_ids else {}
    out: list[AssignmentOut] = []
    for link in links:
        p = patients.get(link.patient_id)
        d = doctors.get(link.doctor_id)
        if not p:
            continue
        out.append(
            AssignmentOut(
                id=link.id,
                doctor_id=link.doctor_id,
                patient_id=link.patient_id,
                doctor_name=d.full_name if d else None,
                doctor_email=d.email if d else None,
                doctor_health_id=getattr(d, "health_id", None) if d else None,
                patient_name=p.full_name,
                patient_email=p.email,
                patient_health_id=getattr(p, "health_id", None),
                created_at=link.created_at,
            )
        )
    return out


@router.get("/patients/{patient_id}/info")
def patient_info(patient_id: str, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not _is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    p = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    _notify_view(db, user, patient_id)
    prof = db.query(PatientProfile).filter(PatientProfile.user_id == patient_id).first()
    return {
        "user": UserOut.model_validate(p).model_dump(),
        "profile": PatientProfileOut.model_validate(prof).model_dump() if prof else None,
    }


def _notify_view(db: Session, doctor: User, patient_id: str) -> None:
    """Tell the patient their doctor viewed their records (max once per doctor per day)."""
    from datetime import date as _date
    notify(db, patient_id, "doctor_view",
           f"Dr. {doctor.full_name} viewed your records",
           "Your assigned doctor opened your profile or reports.", link="/patient",
           ref=f"doctor-view:{doctor.id}:{patient_id}:{_date.today().isoformat()}")
    # safety trail (best-effort, never blocks the view)
    try:
        from app.models.tables import AuditLog
        db.add(AuditLog(actor_id=doctor.id, action="view_records",
                        patient_id=patient_id, detail="opened profile/records"))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


@router.get("/patients/{patient_id}/documents")
def patient_documents(patient_id: str, category: str | None = None, report_kind: str | None = None,
                      limit: int = 100, offset: int = 0,
                      db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not _is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    _notify_view(db, user, patient_id)
    try:
        limit = max(1, min(int(limit), settings.MAX_PAGE_SIZE))
    except Exception:
        limit = 100
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    q = db.query(Document).options(selectinload(Document.ai_summary)).filter(Document.owner_id == patient_id)
    if category:
        q = q.filter(Document.category == category)
    if report_kind:
        q = q.filter(Document.report_kind == report_kind)
    docs = q.order_by(Document.visit_date.desc().nullslast(), Document.created_at.desc()).limit(limit).offset(offset).all()
    return [
        {
            "id": d.id, "owner_id": d.owner_id, "title": d.title, "doc_type": d.doc_type,
            "category": getattr(d, "category", None), "report_kind": getattr(d, "report_kind", None),
            "doctor_name": d.doctor_name, "hospital": d.hospital,
            "visit_date": d.visit_date, "notes": d.notes,
            "family_member_id": d.family_member_id,
            "file_mimetype": d.file_mimetype, "file_size": d.file_size,
            "has_summary": d.ai_summary is not None, "created_at": d.created_at,
            "ocr_chars": len(d.ocr_text or ""), "has_text": len(d.ocr_text or "") > 20,
        }
        for d in docs
    ]


@router.get("/patients/{patient_id}/overall-summary")
def patient_overall_summary(patient_id: str, language: str = "en",
                            db: Session = Depends(get_db),
                            user: User = Depends(require_doctor)):
    """AI overall health summary for an assigned patient (read-only).

    Uses the same Ollama/Gemini engine as per-document summaries. Lets doctors
    'read data using AI' without opening every report."""
    from app.services.ollama import summarize_overall
    if not _is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    p = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    _notify_view(db, user, patient_id)
    docs = (
        db.query(Document).filter(Document.owner_id == patient_id)
        .order_by(Document.visit_date.desc().nullslast()).limit(8).all()
    )
    payload = [
        {"title": d.title, "doc_type": d.doc_type,
         "category": getattr(d, "category", None),
         "report_kind": getattr(d, "report_kind", None),
         "visit_date": str(d.visit_date) if d.visit_date else None,
         "ocr_text": d.ocr_text or ""}
        for d in docs
    ]
    text, used, model = summarize_overall(p.full_name, payload, language)
    return {"patient_id": patient_id, "summary_text": text,
            "model_used": model, "documents_used": used, "language": language}


@router.get("/fee-bands")
def consultation_fee_bands(db: Session = Depends(get_db)):
    """Public: transparent consultation-fee bands per specialization.

    Aggregates only (min/max/doctor count, no personal data) from live
    doctor profiles that publish a fee. Powers the public Pricing page."""
    from collections import defaultdict
    fees: dict[str, list[float]] = defaultdict(list)
    try:
        rows = db.query(DoctorProfile).all()
    except Exception:
        rows = []
    for prof in rows:
        try:
            fee = float(prof.consultation_fee) if prof.consultation_fee else None
        except (TypeError, ValueError):
            fee = None
        spec = (prof.specialization or "General Physician").strip() or "General Physician"
        if fee and fee > 0:
            fees[spec].append(fee)
    bands = [{"specialization": spec,
              "min_fee": round(min(v), 2), "max_fee": round(max(v), 2),
              "doctors": len(v)}
             for spec, v in sorted(fees.items())]
    return {"currency": "INR", "count": len(bands), "bands": bands,
            "note": ("Live bands from doctors publishing a fee on MedRec. "
                     "Your final bill depends on tests, procedures and stay — "
                     "always confirm before treatment.")}
