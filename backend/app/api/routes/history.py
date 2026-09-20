from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_patient, is_assigned
from app.db.session import get_db
from app.models.tables import (
    FamilyHistoryEntry, FamilyMember, PatientProfile, User,
    AllergyRecord, MedicalCondition, MedicationRecord, SurgicalRecord,
)
from app.schemas.schemas import FamilyHistoryIn, FamilyHistoryOut, FamilyMemberOut

router = APIRouter()


def _owns_member(db: Session, user: User, member_id: str | None) -> FamilyMember | None:
    if not member_id:
        return None
    m = db.query(FamilyMember).filter_by(id=member_id, owner_id=user.id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Family member not found")
    return m


@router.get("/family-history", response_model=list[FamilyHistoryOut])
def list_family_history(
    family_member_id: str | None = None,
    patient_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Structured family history. Patients see own; doctors pass patient_id (must be assigned)."""
    if user.role == "doctor":
        if not patient_id or not is_assigned(db, user.id, patient_id):
            raise HTTPException(status_code=403, detail="Not assigned")
        owner = patient_id
        q = db.query(FamilyHistoryEntry).filter_by(owner_id=owner)
    else:
        q = db.query(FamilyHistoryEntry).filter_by(owner_id=user.id)
        if family_member_id:
            _owns_member(db, user, family_member_id)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    return q.order_by(FamilyHistoryEntry.created_at.desc()).all()


@router.post("/family-history", response_model=FamilyHistoryOut, status_code=201)
def add_family_history(
    data: FamilyHistoryIn, db: Session = Depends(get_db), user: User = Depends(require_patient)
):
    _owns_member(db, user, data.family_member_id)
    e = FamilyHistoryEntry(owner_id=user.id, **data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.put("/family-history/{entry_id}", response_model=FamilyHistoryOut)
def update_family_history(
    entry_id: str, data: FamilyHistoryIn, db: Session = Depends(get_db), user: User = Depends(require_patient)
):
    e = db.query(FamilyHistoryEntry).filter_by(id=entry_id, owner_id=user.id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    _owns_member(db, user, data.family_member_id)
    for k, v in data.model_dump().items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


@router.delete("/family-history/{entry_id}", status_code=204)
def delete_family_history(entry_id: str, db: Session = Depends(get_db), user: User = Depends(require_patient)):
    e = db.query(FamilyHistoryEntry).filter_by(id=entry_id, owner_id=user.id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(e)
    db.commit()
    return None


@router.get("/clinical/family/{member_id}", response_model=FamilyMemberOut)
def get_family_clinical(member_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Full detailed clinical record for one family profile (patient owns, or assigned doctor reads)."""
    if user.role == "doctor":
        # doctor must own assignment via owner patient id lookup
        m = db.query(FamilyMember).filter_by(id=member_id).first()
        if not m or not is_assigned(db, user.id, m.owner_id):
            raise HTTPException(status_code=403, detail="Not assigned")
        return m
    m = db.query(FamilyMember).filter_by(id=member_id, owner_id=user.id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    return m


@router.put("/clinical/family/{member_id}", response_model=FamilyMemberOut)
def update_family_clinical(
    member_id: str, data: dict, db: Session = Depends(get_db), user: User = Depends(require_patient)
):
    """Update detailed clinical fields for a family profile (partial allowed)."""
    from app.schemas.schemas import FamilyMemberIn

    m = db.query(FamilyMember).filter_by(id=member_id, owner_id=user.id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    # Validate known fields only
    allowed = set(FamilyMemberIn.model_fields.keys())
    for k, v in (data or {}).items():
        if k in allowed and k != "name":
            setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.get("/clinical/summary", response_model=dict)
def clinical_summary(
    patient_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Compact per-account clinical overview: self + each family profile + entry counts."""
    if user.role == "doctor":
        if not patient_id or not is_assigned(db, user.id, patient_id):
            raise HTTPException(status_code=403, detail="Not assigned")
        owner = patient_id
    else:
        owner = user.id
    prof = db.query(PatientProfile).filter_by(user_id=owner).first()
    members = db.query(FamilyMember).filter_by(owner_id=owner).all()
    total_entries = db.query(FamilyHistoryEntry).filter_by(owner_id=owner).count()
    return {
        "owner_id": owner,
        "self": {"has_profile": prof is not None, "chronic": (prof.chronic_conditions if prof else None)},
        "family_members": len(members),
        "family_history_entries": total_entries,
        "allergies": db.query(AllergyRecord).filter_by(owner_id=owner).count(),
        "conditions": db.query(MedicalCondition).filter_by(owner_id=owner).count(),
        "medications": db.query(MedicationRecord).filter_by(owner_id=owner).count(),
        "surgeries": db.query(SurgicalRecord).filter_by(owner_id=owner).count(),
        "members": [{"id": m.id, "name": m.name, "relation": m.relation} for m in members],
    }
