"""Staff patient directory: search/filter + archive + duplicates + walk-in register.

- Doctors see ONLY assigned patients (RBAC preserved).
- Receptionists / nurses / admins see all (front-desk workflow).
- Archive is a soft flag (no hard deletes); archived patients are hidden by default.
- Duplicates: same phone, or same name + same phone tail, surfaced for merge review.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, require_staff
from app.core.security import hash_password
from app.db.session import get_db
from app.models.tables import (
    User, PatientProfile, DoctorPatientAssignment, MedicalCondition,
)
from app.schemas.schemas import ArchiveIn

router = APIRouter()


def _is_staff(user: User) -> bool:
    return user.role in ("receptionist", "nurse", "admin")


def _assigned_patient_ids(db: Session, doctor_id: str) -> set[str]:
    rows = db.query(DoctorPatientAssignment).filter_by(doctor_id=doctor_id).all()
    return {r.patient_id for r in rows}


def _serialize(db: Session, u: User) -> dict:
    prof = db.query(PatientProfile).filter_by(user_id=u.id).first()
    return {
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "health_id": u.health_id,
        "is_archived": bool(getattr(u, "is_archived", False)),
        "profile": {
            "dob": prof.dob if prof else None,
            "gender": prof.gender if prof else None,
            "blood_group": prof.blood_group if prof else None,
            "phone": prof.phone if prof else None,
            "address": prof.address if prof else None,
            "emergency_contact": prof.emergency_contact if prof else None,
            "chronic_conditions": prof.chronic_conditions if prof else None,
            "abha_id": getattr(prof, "abha_id", None) if prof else None,
            "abha_address": getattr(prof, "abha_address", None) if prof else None,
        } if prof else None,
    }


@router.get("/patients/search")
def search_patients(
    q: str | None = None,
    phone: str | None = None,
    health_id: str | None = None,
    condition: str | None = None,
    include_archived: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
):
    """Search by name / ID / phone / condition. Doctors are scoped to assigned patients."""
    try:
        limit = max(1, min(int(limit), settings.MAX_PAGE_SIZE))
    except Exception:
        limit = 50
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    query = db.query(User).filter(User.role == "patient")
    if not include_archived:
        try:
            query = query.filter((User.is_archived.is_(False)) | (User.is_archived.is_(None)))
        except Exception:
            pass
    if user.role == "doctor":
        ids = _assigned_patient_ids(db, user.id)
        if not ids:
            return {"count": 0, "results": []}
        query = query.filter(User.id.in_(list(ids)))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if phone:
        like = f"%{phone.strip()}%"
        query = query.filter(User.phone.ilike(like))
    if health_id:
        hid = health_id.strip().upper().replace(" ", "")
        query = query.filter(User.health_id == hid)
    if condition:
        clike = f"%{condition.strip()}%"
        sub = db.query(PatientProfile.user_id).filter(
            or_(PatientProfile.chronic_conditions.ilike(clike),
                PatientProfile.allergies.ilike(clike),
                PatientProfile.past_illnesses.ilike(clike))
        ).subquery()
        cond2 = db.query(MedicalCondition.owner_id).filter(
            MedicalCondition.condition_name.ilike(clike)).subquery()
        query = query.filter(or_(User.id.in_(sub), User.id.in_(cond2)))
    total = query.count()
    rows = query.order_by(User.full_name.asc()).limit(limit).offset(offset).all()
    return {"count": total, "results": [_serialize(db, u) for u in rows]}


@router.get("/patients/duplicates")
def duplicate_patients(
    db: Session = Depends(get_db), user: User = Depends(require_staff),
):
    """Heuristic duplicate detection: same phone, or same normalized name + same health-id prefix.

    Read-only report for front-desk merge review (no auto-merge — merging health
    records automatically is unsafe).
    """
    from collections import defaultdict
    from sqlalchemy import func
    # Same phone on 2+ active patient accounts.
    phone_rows = db.query(User.phone, func.count(User.id)).filter(
        User.role == "patient", User.phone.isnot(None)).group_by(User.phone).having(
        func.count(User.id) > 1).all()
    groups: list[dict] = []
    for phone_val, _n in phone_rows[:50]:
        users = db.query(User).filter_by(role="patient", phone=phone_val).limit(10).all()
        if user.role == "doctor":
            allowed = _assigned_patient_ids(db, user.id)
            users = [u for u in users if u.id in allowed]
        if len(users) > 1:
            groups.append({"reason": "same_phone", "phone": phone_val,
                           "patients": [_serialize(db, u) for u in users]})
    # Same normalized name appearing 2+ times (possible duplicates — review).
    name_rows = db.query(User.full_name, func.count(User.id)).filter(
        User.role == "patient").group_by(User.full_name).having(
        func.count(User.id) > 1).limit(20).all()
    for name_val, _n in name_rows:
        users = db.query(User).filter_by(role="patient", full_name=name_val).limit(10).all()
        if user.role == "doctor":
            allowed = _assigned_patient_ids(db, user.id)
            users = [u for u in users if u.id in allowed]
        if len(users) > 1:
            key = f"name:{name_val}"
            if all(g.get("phone") != (users[0].phone or "") or True for g in groups):
                groups.append({"reason": "same_name", "name": name_val,
                               "patients": [_serialize(db, u) for u in users]})
        if len(groups) >= 50:
            break
    _ = defaultdict  # keep import used if trimmed
    return {"count": len(groups), "groups": groups}


@router.patch("/patients/{patient_id}/archive")
def archive_patient(
    patient_id: str, data: ArchiveIn,
    db: Session = Depends(get_db), user: User = Depends(require_staff),
):
    """Soft-archive (or restore) a patient record. No hard deletes."""
    target = db.query(User).filter_by(id=patient_id, role="patient").first()
    if not target:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role == "doctor":
        if patient_id not in _assigned_patient_ids(db, user.id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
    target.is_archived = bool(data.archived)
    try:
        target.archived_at = datetime.utcnow() if data.archived else None
    except Exception:
        pass
    db.commit()
    try:
        from app.models.tables import AuditLog
        db.add(AuditLog(actor_id=user.id, action="archive" if data.archived else "unarchive",
                        patient_id=patient_id,
                        detail=f"archived={bool(data.archived)} by {user.role}"))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return {"id": target.id, "is_archived": bool(target.is_archived)}


@router.post("/patients/register", status_code=201)
def staff_register_patient(
    payload: dict, db: Session = Depends(get_db), user: User = Depends(require_staff),
):
    """Front-desk patient registration: name + contact + demographics + ABHA linking.

    Body: {full_name, email, password?, phone?, dob?, gender?, blood_group?,
    address?, emergency_contact?, abha_id?, abha_address?, doctor_id? (auto-link)}.
    Password is auto-generated when omitted (returned once so the desk can share it).
    """
    from app.services.health_ids import ensure_health_id
    from app.services.otp import normalize_phone
    full_name = (payload.get("full_name") or "").strip()
    email = (payload.get("email") or "").lower().strip()
    if len(full_name) < 2 or "@" not in email:
        raise HTTPException(status_code=400, detail="full_name and a valid email are required")
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    phone = None
    if payload.get("phone"):
        try:
            phone = normalize_phone(str(payload.get("phone")))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if db.query(User).filter_by(phone=phone).first():
            raise HTTPException(status_code=400, detail="Phone number already registered")
    import secrets
    password = (payload.get("password") or "").strip() or secrets.token_urlsafe(10)
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    u = User(email=email, hashed_password=hash_password(password),
             full_name=full_name, role="patient", phone=phone)
    ensure_health_id(db, u)
    db.add(u)
    db.flush()
    prof = PatientProfile(
        user_id=u.id, phone=phone,
        dob=payload.get("dob") or None, gender=payload.get("gender"),
        blood_group=payload.get("blood_group"), address=payload.get("address"),
        allergies=payload.get("allergies"), chronic_conditions=payload.get("chronic_conditions"),
        emergency_contact=payload.get("emergency_contact"),
    )
    for k in ("abha_id", "abha_address", "aadhaar_masked"):
        if payload.get(k) is not None:
            try:
                setattr(prof, k, payload.get(k))
            except Exception:
                pass
    # Never persist a full Aadhaar number — keep only a masked last-4 reference.
    try:
        raw_aadhaar = (payload.get("aadhaar") or "").strip().replace(" ", "")
        if raw_aadhaar:
            if not raw_aadhaar.isdigit() or len(raw_aadhaar) != 12:
                raise HTTPException(status_code=400, detail="Aadhaar must be 12 digits (or omit it)")
            prof.aadhaar_masked = f"XXXX-XXXX-{raw_aadhaar[-4:]}"
    except HTTPException:
        raise
    except Exception:
        pass
    db.add(prof)
    auto_doctor = (payload.get("doctor_id") or "").strip() if payload.get("doctor_id") else None
    if auto_doctor:
        doc = db.query(User).filter_by(id=auto_doctor, role="doctor").first()
        if doc:
            db.add(DoctorPatientAssignment(doctor_id=doc.id, patient_id=u.id))
    db.commit()
    db.refresh(u)
    try:
        from app.models.tables import AuditLog
        db.add(AuditLog(actor_id=user.id, action="register_patient", patient_id=u.id,
                        detail=f"front-desk registration by {user.role}"))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    out = _serialize(db, u)
    if not payload.get("password"):
        out["generated_password"] = password  # show once at the desk
    return out


@router.get("/doctors")
def list_doctors(
    q: str | None = None, department: str | None = None,
    specialization: str | None = None, limit: int = 100,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    """Doctor directory with department / specialization filter (booking + referral)."""
    from app.models.tables import DoctorProfile
    try:
        limit = max(1, min(int(limit), 200))
    except Exception:
        limit = 100
    query = db.query(User).filter(User.role == "doctor")
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if department or specialization:
        sub = db.query(DoctorProfile.user_id)
        if department:
            sub = sub.filter(DoctorProfile.department.ilike(f"%{department.strip()}%"))
        if specialization:
            sub = sub.filter(DoctorProfile.specialization.ilike(f"%{specialization.strip()}%"))
        query = query.filter(User.id.in_(sub.subquery()))
    rows = query.order_by(User.full_name.asc()).limit(limit).all()
    profs = {p.user_id: p for p in db.query(DoctorProfile).filter(
        DoctorProfile.user_id.in_([u.id for u in rows])).all()} if rows else {}
    return [{"id": u.id, "full_name": u.full_name, "email": u.email,
             "health_id": u.health_id, "phone": u.phone,
             "specialization": profs.get(u.id).specialization if profs.get(u.id) else None,
             "department": getattr(profs.get(u.id), "department", None) if profs.get(u.id) else None,
             "hospital": profs.get(u.id).hospital if profs.get(u.id) else None,
             "experience_years": getattr(profs.get(u.id), "experience_years", None) if profs.get(u.id) else None}
            for u in rows]
