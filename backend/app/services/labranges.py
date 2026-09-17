"""Default lab reference ranges + per-patient doctor-approved overrides."""
from __future__ import annotations
from sqlalchemy.orm import Session
from app.models.tables import LabReferenceRange

DEFAULTS: list[dict] = [
    # CBC
    {"test_key": "hemoglobin", "display_name": "Hemoglobin", "min_value": 12.0, "max_value": 16.0, "unit": "g/dL"},
    {"test_key": "wbc", "display_name": "WBC", "min_value": 4000, "max_value": 11000, "unit": "/µL"},
    {"test_key": "platelets", "display_name": "Platelets", "min_value": 150000, "max_value": 450000, "unit": "/µL"},
    {"test_key": "rbc", "display_name": "RBC Count", "min_value": 4.5, "max_value": 5.5, "unit": "million/µL"},
    {"test_key": "hct", "display_name": "Hematocrit (HCT)", "min_value": 36.0, "max_value": 46.0, "unit": "%"},
    {"test_key": "mcv", "display_name": "MCV", "min_value": 80.0, "max_value": 100.0, "unit": "fL"},
    {"test_key": "mch", "display_name": "MCH", "min_value": 27.0, "max_value": 33.0, "unit": "pg"},
    # Diabetes
    {"test_key": "glucose_fasting", "display_name": "Fasting Glucose", "min_value": 70, "max_value": 100, "unit": "mg/dL"},
    {"test_key": "glucose_pp", "display_name": "Post-Prandial Glucose", "min_value": 70, "max_value": 140, "unit": "mg/dL"},
    {"test_key": "hba1c", "display_name": "HbA1c", "min_value": 4.0, "max_value": 5.6, "unit": "%"},
    # Lipid
    {"test_key": "cholesterol_total", "display_name": "Total Cholesterol", "min_value": 125, "max_value": 200, "unit": "mg/dL"},
    {"test_key": "ldl", "display_name": "LDL Cholesterol", "min_value": 0, "max_value": 100, "unit": "mg/dL"},
    {"test_key": "hdl", "display_name": "HDL Cholesterol", "min_value": 40, "max_value": 100, "unit": "mg/dL"},
    {"test_key": "triglycerides", "display_name": "Triglycerides", "min_value": 0, "max_value": 150, "unit": "mg/dL"},
    # Kidney (KFT)
    {"test_key": "creatinine", "display_name": "Creatinine", "min_value": 0.6, "max_value": 1.2, "unit": "mg/dL"},
    {"test_key": "urea", "display_name": "Blood Urea", "min_value": 15, "max_value": 40, "unit": "mg/dL"},
    # Liver (LFT)
    {"test_key": "bilirubin_total", "display_name": "Total Bilirubin", "min_value": 0.3, "max_value": 1.2, "unit": "mg/dL"},
    {"test_key": "sgot", "display_name": "SGOT / AST", "min_value": 10, "max_value": 40, "unit": "U/L"},
    {"test_key": "sgpt", "display_name": "SGPT / ALT", "min_value": 7, "max_value": 56, "unit": "U/L"},
    {"test_key": "alp", "display_name": "Alkaline Phosphatase (ALP)", "min_value": 44, "max_value": 147, "unit": "U/L"},
    {"test_key": "albumin", "display_name": "Serum Albumin", "min_value": 3.5, "max_value": 5.5, "unit": "g/dL"},
    # Vitals
    {"test_key": "systolic", "display_name": "BP Systolic", "min_value": 90, "max_value": 120, "unit": "mmHg"},
    {"test_key": "diastolic", "display_name": "BP Diastolic", "min_value": 60, "max_value": 80, "unit": "mmHg"},
    # Thyroid
    {"test_key": "tsh", "display_name": "TSH", "min_value": 0.4, "max_value": 4.0, "unit": "mIU/L"},
    {"test_key": "t3", "display_name": "T3 (Triiodothyronine)", "min_value": 80, "max_value": 200, "unit": "ng/dL"},
    {"test_key": "t4", "display_name": "T4 (Thyroxine)", "min_value": 5.0, "max_value": 12.0, "unit": "µg/dL"},
    # Inflammation / vitamins
    {"test_key": "esr", "display_name": "ESR", "min_value": 0, "max_value": 20, "unit": "mm/hr"},
    {"test_key": "crp", "display_name": "CRP", "min_value": 0, "max_value": 3.0, "unit": "mg/L"},
    {"test_key": "vitamin_d", "display_name": "Vitamin D (25-OH)", "min_value": 30, "max_value": 100, "unit": "ng/mL"},
    {"test_key": "vitamin_b12", "display_name": "Vitamin B12", "min_value": 200, "max_value": 900, "unit": "pg/mL"},
    {"test_key": "calcium", "display_name": "Serum Calcium", "min_value": 8.5, "max_value": 10.5, "unit": "mg/dL"},
]


def seed_defaults(db: Session) -> None:
    existing = {r.test_key for r in db.query(LabReferenceRange).filter_by(is_default=True).all()}
    missing = [d for d in DEFAULTS if d["test_key"] not in existing]
    if not missing:
        return
    for d in missing:
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
