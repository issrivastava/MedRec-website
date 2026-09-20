"""Structured clinical records: allergies, conditions, medications, surgeries.

Reads: patient (self) + assigned doctor + admin via resolve_patient_id.
Writes: patients only (own or family profile).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import (
    AllergyRecord, MedicalCondition, MedicationRecord, SurgicalRecord,
    FamilyMember, User,
)
from app.schemas.schemas import (
    AllergyIn, AllergyOut, ConditionIn, ConditionOut,
    MedicationIn, MedicationOut, SurgeryIn, SurgeryOut,
)

router = APIRouter()

_MODELS = {
    "allergies": (AllergyRecord, AllergyIn, AllergyOut),
    "conditions": (MedicalCondition, ConditionIn, ConditionOut),
    "medications": (MedicationRecord, MedicationIn, MedicationOut),
    "surgeries": (SurgicalRecord, SurgeryIn, SurgeryOut),
}


def _check_member(db: Session, owner_id: str, member_id: str | None):
    if member_id and not db.query(FamilyMember).filter_by(id=member_id, owner_id=owner_id).first():
        raise HTTPException(status_code=400, detail="Unknown family member")


def _scope(db: Session, user: User, patient_id: str | None, family_member_id: str | None, model):
    """Owner-scoped query: resolves whose records the caller may see."""
    pid = resolve_patient_id(db, user, patient_id)
    q = db.query(model).filter_by(owner_id=pid)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    return q


def _register(kind: str):
    model, _, out = _MODELS[kind]

    @router.get(f"/{kind}", response_model=list[out], name=f"list_{kind}")
    def list_items(family_member_id: str | None = None, patient_id: str | None = None,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        return (_scope(db, user, patient_id, family_member_id, model)
                .order_by(model.created_at.desc()).limit(500).all())

    @router.post(f"/{kind}", response_model=out, status_code=201, name=f"add_{kind}")
    def add_item(data: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        if user.role != "patient":
            raise HTTPException(status_code=403, detail="Patients only")
        _, schema, _ = _MODELS[kind]
        try:
            item = schema(**data)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid data: {exc}")
        _check_member(db, user.id, item.family_member_id)
        row = model(owner_id=user.id, **item.model_dump())
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    @router.delete(f"/{kind}/{{item_id}}", status_code=204, name=f"delete_{kind}")
    def delete_item(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        if user.role != "patient":
            raise HTTPException(status_code=403, detail="Patients only")
        row = db.query(model).filter_by(id=item_id, owner_id=user.id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(row)
        db.commit()
        return None


for _kind in _MODELS:
    _register(_kind)
