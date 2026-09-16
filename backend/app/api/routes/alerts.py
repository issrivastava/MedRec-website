from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_doctor, resolve_patient_id, is_assigned
from app.db.session import get_db
from app.models.tables import LabReferenceRange, HealthAlert, Document, User
from app.schemas.schemas import LabRangeIn, LabRangeOut, HealthAlertOut
from app.services.labparse import parse_lab_values
from app.services.labranges import effective_range, DEFAULTS
from app.services.notify import notify, patient_phone, notify_phone_sms

router = APIRouter()


def analyze_document(db: Session, doc: Document) -> list[HealthAlert]:
    """Parse OCR text, compare to ranges, create alerts + notify. Returns new alerts."""
    created: list[HealthAlert] = []
    for test_key, value in parse_lab_values(doc.ocr_text or ""):
        rng = effective_range(db, test_key, doc.owner_id)
        if not rng or (rng.min_value is None and rng.max_value is None):
            continue
        flag = None
        if rng.min_value is not None and value < rng.min_value:
            flag = "low"
        elif rng.max_value is not None and value > rng.max_value:
            flag = "high"
        if not flag:
            continue
        name = rng.display_name
        ref = f"alert:{doc.id}:{test_key}:{flag}"
        if db.query(HealthAlert).filter_by(patient_id=doc.owner_id, document_id=doc.id,
                                           test_name=name, flag=flag).first():
            continue
        msg = (f"{name} is {flag} at {value} {rng.unit or ''} "
               f"(healthy range {rng.min_value}–{rng.max_value}). Please discuss with your doctor "
               f"and consider a checkup.")
        alert = HealthAlert(patient_id=doc.owner_id, document_id=doc.id, test_name=name,
                            value=value, unit=rng.unit, flag=flag, message=msg)
        db.add(alert)
        created.append(alert)
    if created:
        db.commit()
        for a in created:
            notify(db, doc.owner_id, "health_alert", f"Health alert: {a.test_name} {a.flag}",
                   a.message, link="/patient", ref=f"alert:{a.id}")
        phone = patient_phone(db, doc.owner_id)
        if phone:
            notify_phone_sms(phone, f"MedRec: {len(created)} lab value(s) need attention. Check the app.")
    return created


@router.post("/documents/{doc_id}/analyze", response_model=list[HealthAlertOut])
def analyze(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if user.role == "patient" and doc.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    if user.role == "doctor" and not is_assigned(db, user.id, doc.owner_id):
        raise HTTPException(status_code=403, detail="Not assigned")
    return analyze_document(db, doc)


@router.get("/alerts/my", response_model=list[HealthAlertOut])
def my_alerts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    return db.query(HealthAlert).filter_by(patient_id=user.id).order_by(HealthAlert.created_at.desc()).all()


@router.get("/patients/{patient_id}/alerts", response_model=list[HealthAlertOut])
def patient_alerts(patient_id: str, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Not assigned")
    return db.query(HealthAlert).filter_by(patient_id=patient_id).order_by(HealthAlert.created_at.desc()).all()


@router.patch("/alerts/{alert_id}", response_model=HealthAlertOut)
def acknowledge(alert_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = db.query(HealthAlert).filter_by(id=alert_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == "patient" and a.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    a.acknowledged = True
    db.commit()
    db.refresh(a)
    return a


@router.get("/lab-ranges", response_model=list[LabRangeOut])
def list_ranges(patient_id: str | None = None, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    pid = resolve_patient_id(db, user, patient_id) if patient_id or user.role == "patient" else None
    rows = db.query(LabReferenceRange).filter_by(is_default=True).all()
    if pid:
        rows += db.query(LabReferenceRange).filter_by(patient_id=pid, is_default=False).all()
    return rows


@router.get("/lab-ranges/defaults", response_model=list[dict])
def range_defaults():
    return DEFAULTS


@router.post("/lab-ranges", response_model=LabRangeOut, status_code=201)
def set_range(data: LabRangeIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Doctor-approved range: global default tweak or per-patient override (patient_id)."""
    if data.patient_id and not is_assigned(db, user.id, data.patient_id):
        raise HTTPException(status_code=403, detail="Not assigned")
    name = data.display_name or next((d["display_name"] for d in DEFAULTS if d["test_key"] == data.test_key),
                                     data.test_key)
    existing = db.query(LabReferenceRange).filter_by(
        test_key=data.test_key, patient_id=data.patient_id, is_default=False).first()
    if existing:
        existing.display_name = name
        existing.min_value = data.min_value
        existing.max_value = data.max_value
        existing.unit = data.unit
        existing.created_by = user.id
        db.commit()
        db.refresh(existing)
        return existing
    r = LabReferenceRange(test_key=data.test_key, display_name=name, min_value=data.min_value,
                          max_value=data.max_value, unit=data.unit,
                          patient_id=data.patient_id, created_by=user.id, is_default=False)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
