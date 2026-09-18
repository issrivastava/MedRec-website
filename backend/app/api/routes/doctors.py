from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

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
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(prof, k, v)
    db.commit()
    db.refresh(prof)
    return prof


@router.get("/patients", response_model=list[AssignmentOut])
def my_patients(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Assigned-patients dropdown source: only linked patients."""
    links = db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()
    out: list[AssignmentOut] = []
    for link in links:
        p = db.query(User).filter(User.id == link.patient_id).first()
        d = db.query(User).filter(User.id == link.doctor_id).first()
        if not p:
            continue
        out.append(
            AssignmentOut(
                id=link.id,
                doctor_id=link.doctor_id,
                patient_id=link.patient_id,
                doctor_name=d.full_name if d else None,
                doctor_email=d.email if d else None,
                patient_name=p.full_name,
                patient_email=p.email,
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
                      db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not _is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    _notify_view(db, user, patient_id)
    q = db.query(Document).filter(Document.owner_id == patient_id)
    if category:
        q = q.filter(Document.category == category)
    if report_kind:
        q = q.filter(Document.report_kind == report_kind)
    docs = q.order_by(Document.visit_date.desc().nullslast(), Document.created_at.desc()).all()
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
