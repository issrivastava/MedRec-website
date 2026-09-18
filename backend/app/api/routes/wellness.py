"""Vitals + vaccinations tracker."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import Vital, Vaccination, FamilyMember, User
from app.schemas.schemas import VitalIn, VitalOut, VaccinationIn, VaccinationOut

router = APIRouter()

VITAL_UNITS = {
    "bp": "mmHg", "sugar": "mg/dL", "weight": "kg", "bmi": "kg/m2",
    "temp": "°F", "spo2": "%", "pulse": "bpm",
}


def _check_member(db: Session, owner_id: str, member_id: str | None):
    if member_id and not db.query(FamilyMember).filter_by(id=member_id, owner_id=owner_id).first():
        raise HTTPException(status_code=400, detail="Unknown family member")


# ---- Vitals ----
@router.get("/vitals", response_model=list[VitalOut])
def list_vitals(vital_type: str | None = None, family_member_id: str | None = None,
                patient_id: str | None = None, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    pid = resolve_patient_id(db, user, patient_id)
    q = db.query(Vital).filter_by(owner_id=pid)
    if vital_type:
        q = q.filter_by(vital_type=vital_type)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    return q.order_by(Vital.measured_at.desc().nullslast(), Vital.created_at.desc()).limit(500).all()


@router.post("/vitals", response_model=VitalOut, status_code=201)
def add_vital(data: VitalIn, patient_id: str | None = None, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    _check_member(db, user.id, data.family_member_id)
    if data.vital_type == "bp" and (data.systolic is None or data.diastolic is None):
        raise HTTPException(status_code=400, detail="BP needs systolic + diastolic")
    if data.vital_type != "bp" and data.value is None:
        raise HTTPException(status_code=400, detail="value required")
    v = Vital(owner_id=user.id, vital_type=data.vital_type, value=data.value,
              systolic=data.systolic, diastolic=data.diastolic,
              unit=data.unit or VITAL_UNITS.get(data.vital_type),
              notes=data.notes, measured_at=data.measured_at or date.today(),
              family_member_id=data.family_member_id)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.delete("/vitals/{vital_id}", status_code=204)
def delete_vital(vital_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    v = db.query(Vital).filter_by(id=vital_id, owner_id=user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(v)
    db.commit()
    return None


@router.get("/vitals/summary", response_model=dict)
def vitals_summary(family_member_id: str | None = None, patient_id: str | None = None,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Latest value per vital type + 30-day mini trend for charts."""
    pid = resolve_patient_id(db, user, patient_id)
    q = db.query(Vital).filter_by(owner_id=pid)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    rows = q.order_by(Vital.measured_at.desc().nullslast()).limit(500).all()
    latest: dict = {}
    trends: dict[str, list] = {}
    for r in reversed(rows):  # oldest -> newest for trend building
        key = r.vital_type
        pt = {"date": r.measured_at.isoformat() if r.measured_at else r.created_at.date().isoformat(),
              "value": r.value, "systolic": r.systolic, "diastolic": r.diastolic, "unit": r.unit}
        trends.setdefault(key, []).append(pt)
        latest[key] = pt
    # flag simple out-of-range hints
    hints = []
    if latest.get("bp") and (latest["bp"].get("systolic") or 0) >= 140:
        hints.append("BP looks high (≥140 systolic) — consult your doctor.")
    if latest.get("sugar") and (latest["sugar"].get("value") or 0) >= 200:
        hints.append("Sugar looks high (≥200 mg/dL) — consult your doctor.")
    if latest.get("spo2") and (latest["spo2"].get("value") or 100) < 94:
        hints.append("SpO2 below 94% — seek medical advice promptly.")
    return {"patient_id": pid, "latest": latest, "trends": trends, "hints": hints}


# ---- Vaccinations ----
@router.get("/vaccinations", response_model=list[VaccinationOut])
def list_vaccinations(family_member_id: str | None = None, patient_id: str | None = None,
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pid = resolve_patient_id(db, user, patient_id)
    q = db.query(Vaccination).filter_by(owner_id=pid)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    rows = q.order_by(Vaccination.due_date.asc().nullslast()).all()
    today = date.today()
    # auto-mark overdue in response (due passed + not given)
    for r in rows:
        if r.status == "due" and r.due_date and r.due_date < today and not r.given_date:
            r.status = "missed"
    return rows


@router.post("/vaccinations", response_model=VaccinationOut, status_code=201)
def add_vaccination(data: VaccinationIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    _check_member(db, user.id, data.family_member_id)
    v = Vaccination(owner_id=user.id, **data.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.patch("/vaccinations/{vac_id}", response_model=VaccinationOut)
def update_vaccination(vac_id: str, data: VaccinationIn, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    v = db.query(Vaccination).filter_by(id=vac_id, owner_id=user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    for k, val in data.model_dump(exclude_unset=True).items():
        setattr(v, k, val)
    if v.given_date and not data.status:
        v.status = "given"
    db.commit()
    db.refresh(v)
    return v


@router.delete("/vaccinations/{vac_id}", status_code=204)
def delete_vaccination(vac_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    v = db.query(Vaccination).filter_by(id=vac_id, owner_id=user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(v)
    db.commit()
    return None


@router.get("/vaccinations/due", response_model=dict)
def vaccinations_due(patient_id: str | None = None, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    pid = resolve_patient_id(db, user, patient_id)
    rows = db.query(Vaccination).filter_by(owner_id=pid).all()
    today = date.today()
    due = [r for r in rows if r.status == "due" or (r.due_date and r.due_date <= today and not r.given_date)]
    members = {m.id: m.name for m in db.query(FamilyMember).filter_by(owner_id=pid).all()}
    return {"patient_id": pid, "due_count": len(due),
            "due": [{"id": r.id, "vaccine": r.vaccine_name, "dose": r.dose_no,
                     "due_date": r.due_date, "member": members.get(r.family_member_id or ""),
                     "family_member_id": r.family_member_id} for r in due]}
