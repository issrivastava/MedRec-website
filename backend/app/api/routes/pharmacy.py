"""Pharmacy + inventory: stock management, dispense log, safety screens.

- Staff manage stock; dispenses decrement quantity and keep an audit trail.
- Offline rule-based interaction screen (no AI needed): known risky pairs +
  duplicate-therapy detection + allergy cross-check when patient_id is given.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, require_staff
from app.db.session import get_db
from app.models.tables import PharmacyItem, PharmacyDispense, User
from app.schemas.schemas import PharmacyItemIn, PharmacyItemOut, DispenseIn, DispenseOut

router = APIRouter()

# Curated high-risk pairs (screening aid — not exhaustive; confirm with formulary).
RISKY_PAIRS: dict[frozenset, tuple[str, str]] = {
    frozenset({"warfarin", "aspirin"}): ("major", "Bleeding risk — both impair clotting."),
    frozenset({"warfarin", "ibuprofen"}): ("major", "Bleeding risk — NSAID + anticoagulant."),
    frozenset({"lisinopril", "spironolactone"}): ("major", "Hyperkalemia risk — ACE-i + K+ sparing diuretic."),
    frozenset({"simvastatin", "clarithromycin"}): ("major", "Statin toxicity risk — CYP3A4 inhibition."),
    frozenset({"metformin", "contrast"}): ("moderate", "Lactic acidosis caution around iodinated contrast."),
    frozenset({"ssri", "tramadol"}): ("moderate", "Serotonin syndrome caution."),
    frozenset({"alprazolam", "alcohol"}): ("major", "Additive CNS depression."),
    frozenset({"theophylline", "ciprofloxacin"}): ("moderate", "Theophylline levels may rise."),
}


def _out_item(r: PharmacyItem) -> dict:
    return {"id": r.id, "name": r.name, "batch_no": r.batch_no,
            "expiry_date": r.expiry_date, "quantity": r.quantity, "unit": r.unit,
            "price": r.price, "supplier": r.supplier, "low_stock_at": r.low_stock_at,
            "created_at": r.created_at}


@router.post("/items", response_model=PharmacyItemOut, status_code=201)
def add_item(data: PharmacyItemIn, db: Session = Depends(get_db),
             user: User = Depends(require_staff)):
    r = PharmacyItem(name=data.name.strip(), batch_no=data.batch_no,
                     expiry_date=data.expiry_date, quantity=int(data.quantity or 0),
                     unit=data.unit, price=data.price, supplier=data.supplier,
                     low_stock_at=data.low_stock_at, created_by=user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _out_item(r)


@router.get("/items", response_model=list[PharmacyItemOut])
def list_items(q: str | None = None, low_stock: bool = False, expired: bool = False,
               limit: int = 200, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "receptionist", "nurse", "admin"):
        raise HTTPException(status_code=403, detail="Staff only")
    try:
        limit = max(1, min(int(limit), 500))
    except Exception:
        limit = 200
    query = db.query(PharmacyItem)
    if q:
        query = query.filter(PharmacyItem.name.ilike(f"%{q.strip()}%"))
    rows = query.order_by(PharmacyItem.name.asc()).limit(limit).all()
    if expired:
        rows = [r for r in rows if r.expiry_date and r.expiry_date < date.today()]
    if low_stock:
        rows = [r for r in rows
                if (r.low_stock_at is not None and r.quantity <= r.low_stock_at) or r.quantity <= 0]
    return [_out_item(r) for r in rows]


@router.patch("/items/{item_id}", response_model=PharmacyItemOut)
def update_item(item_id: str, data: PharmacyItemIn, db: Session = Depends(get_db),
                user: User = Depends(require_staff)):
    r = db.query(PharmacyItem).filter_by(id=item_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return _out_item(r)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str, db: Session = Depends(get_db),
                user: User = Depends(require_staff)):
    r = db.query(PharmacyItem).filter_by(id=item_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(r)
    db.commit()
    return None


@router.get("/alerts")
def stock_alerts(db: Session = Depends(get_db), user: User = Depends(require_staff)):
    rows = db.query(PharmacyItem).limit(2000).all()
    low = [r for r in rows if (r.low_stock_at is not None and r.quantity <= r.low_stock_at)]
    out_of = [r for r in rows if r.quantity <= 0]
    exp = [r for r in rows if r.expiry_date and r.expiry_date < date.today()]
    soon = [r for r in rows if r.expiry_date and date.today() <= r.expiry_date
            and (r.expiry_date - date.today()).days <= 30]
    return {"low_stock": len(low), "out_of_stock": len(out_of),
            "expired": len(exp), "expiring_30d": len(soon),
            "items_low": [_out_item(r) for r in low[:50]],
            "items_expired": [_out_item(r) for r in exp[:50]],
            "items_expiring_soon": [_out_item(r) for r in soon[:50]]}


@router.post("/dispense", response_model=DispenseOut, status_code=201)
def dispense(data: DispenseIn, db: Session = Depends(get_db),
             user: User = Depends(require_staff)):
    item = db.query(PharmacyItem).filter_by(id=data.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.quantity < data.quantity:
        raise HTTPException(status_code=400,
                            detail=f"Only {item.quantity} in stock")
    if data.patient_id:
        pat = db.query(User).filter_by(id=data.patient_id, role="patient").first()
        if not pat:
            raise HTTPException(status_code=404, detail="Patient not found")
    item.quantity -= int(data.quantity)
    d = PharmacyDispense(item_id=item.id, patient_id=data.patient_id,
                         doctor_id=data.doctor_id, quantity=int(data.quantity),
                         notes=data.notes, created_by=user.id)
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id, "item_id": d.item_id, "item_name": item.name,
            "patient_id": d.patient_id, "doctor_id": d.doctor_id,
            "quantity": d.quantity, "notes": d.notes, "created_at": d.created_at}


@router.get("/dispenses")
def list_dispenses(patient_id: str | None = None, limit: int = 200,
                   db: Session = Depends(get_db), user: User = Depends(require_staff)):
    try:
        limit = max(1, min(int(limit), 500))
    except Exception:
        limit = 200
    q = db.query(PharmacyDispense)
    if patient_id:
        q = q.filter_by(patient_id=patient_id)
    rows = q.order_by(PharmacyDispense.created_at.desc()).limit(limit).all()
    items = {i.id: i for i in db.query(PharmacyItem).filter(
        PharmacyItem.id.in_([r.item_id for r in rows])).all()} if rows else {}
    return [{"id": r.id, "item_id": r.item_id,
             "item_name": items.get(r.item_id).name if items.get(r.item_id) else None,
             "patient_id": r.patient_id, "doctor_id": r.doctor_id,
             "quantity": r.quantity, "notes": r.notes,
             "created_at": r.created_at} for r in rows]


@router.post("/interactions")
def check_interactions(payload: dict, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    """Offline drug-interaction + duplicate-therapy screen.

    Body: {medicines: [str], patient_id?: str (staff/assigned doctor adds allergy overlap)}.
    """
    meds = [(m or "").strip() for m in (payload.get("medicines") or []) if (m or "").strip()]
    if not meds:
        raise HTTPException(status_code=400, detail="medicines[] required")
    lowered = [m.lower() for m in meds]
    warnings: list[dict] = []
    seen: set[str] = set()
    for m in lowered:
        if m in seen:
            warnings.append({"level": "moderate", "pair": [m, m],
                             "reason": f"Duplicate entry: {m} listed twice."})
        seen.add(m)
    for i in range(len(lowered)):
        for j in range(i + 1, len(lowered)):
            key = frozenset({lowered[i], lowered[j]})
            if key in RISKY_PAIRS:
                level, reason = RISKY_PAIRS[key]
                warnings.append({"level": level, "pair": [meds[i], meds[j]], "reason": reason})
            elif lowered[i] == lowered[j]:
                pass
            elif lowered[i] in lowered[j] or lowered[j] in lowered[i]:
                warnings.append({"level": "moderate", "pair": [meds[i], meds[j]],
                                 "reason": "Possible duplicate therapy (same/overlapping ingredient)."})
    patient_id = payload.get("patient_id")
    if patient_id:
        from app.models.tables import AllergyRecord
        from app.core.deps import is_assigned as _assigned
        if user.role == "doctor" and not _assigned(db, user.id, patient_id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
        if user.role == "patient" and patient_id != user.id:
            raise HTTPException(status_code=403, detail="Not yours")
        allergies = db.query(AllergyRecord).filter_by(owner_id=patient_id, status="active").all()
        for m in meds:
            ml = m.lower()
            for a in allergies:
                al = (a.allergen or "").lower().strip()
                if al and (al in ml or ml in al):
                    warnings.append({"level": "major", "pair": [m, a.allergen],
                                     "reason": f"Active allergy: {a.allergen}"})
    return {"checked": len(meds), "warnings": warnings,
            "disclaimer": "Screening aid only — confirm with a pharmacist/formulary."}
