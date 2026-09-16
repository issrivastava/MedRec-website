"""Default lab reference ranges + per-patient doctor-approved overrides."""
from __future__ import annotations
from sqlalchemy.orm import Session
from app.models.tables import LabReferenceRange

DEFAULTS: list[dict] = [
    {"test_key": "hemoglobin", "display_name": "Hemoglobin", "min_value": 12.0, "max_value": 16.0, "unit": "g/dL"},
    {"test_key": "wbc", "display_name": "WBC", "min_value": 4000, "max_value": 11000, "unit": "/µL"},
    {"test_key": "platelets", "display_name": "Platelets", "min_value": 150000, "max_value": 450000, "unit": "/µL"},
    {"test_key": "glucose_fasting", "display_name": "Fasting Glucose", "min_value": 70, "max_value": 100, "unit": "mg/dL"},
    {"test_key": "hba1c", "display_name": "HbA1c", "min_value": 4.0, "max_value": 5.6, "unit": "%"},
    {"test_key": "cholesterol_total", "display_name": "Total Cholesterol", "min_value": 125, "max_value": 200, "unit": "mg/dL"},
    {"test_key": "creatinine", "display_name": "Creatinine", "min_value": 0.6, "max_value": 1.2, "unit": "mg/dL"},
    {"test_key": "systolic", "display_name": "BP Systolic", "min_value": 90, "max_value": 120, "unit": "mmHg"},
    {"test_key": "diastolic", "display_name": "BP Diastolic", "min_value": 60, "max_value": 80, "unit": "mmHg"},
    {"test_key": "tsh", "display_name": "TSH", "min_value": 0.4, "max_value": 4.0, "unit": "mIU/L"},
]


def seed_defaults(db: Session) -> None:
    if db.query(LabReferenceRange).filter_by(is_default=True).first():
        return
    for d in DEFAULTS:
        db.add(LabReferenceRange(**d, is_default=True))
    db.commit()


def effective_range(db: Session, test_key: str, patient_id: str) -> LabReferenceRange | None:
    override = (
        db.query(LabReferenceRange)
        .filter_by(test_key=test_key, patient_id=patient_id)
        .order_by(LabReferenceRange.id.desc())
        .first()
    )
    if override:
        return override
    return db.query(LabReferenceRange).filter_by(test_key=test_key, is_default=True).first()
