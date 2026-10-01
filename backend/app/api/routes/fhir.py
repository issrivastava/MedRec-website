"""FHIR R4 export (interoperability): Patient + clinical Bundle.

Minimal, standards-shaped output for referrals / insurance / ABDM-style exchange:
- GET /fhir/patient -> FHIR Patient resource
- GET /fhir/bundle -> Bundle(collection) with Patient, Conditions, Medications,
  AllergyIntolerances, Observations (vitals) and Encounters (visit notes).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import (
    User, PatientProfile, MedicalCondition, MedicationRecord, AllergyRecord,
    Vital, VisitNote,
)

router = APIRouter()


def _patient_resource(u: User, prof: PatientProfile | None) -> dict:
    gender_map = {"male": "male", "female": "female", "other": "other"}
    telecom = []
    if u.email:
        telecom.append({"system": "email", "value": u.email})
    if (prof and prof.phone) or u.phone:
        telecom.append({"system": "phone", "value": (prof.phone if prof and prof.phone else u.phone)})
    return {
        "resourceType": "Patient",
        "id": u.id,
        "identifier": [
            {"system": "https://medrec.local/health-id", "value": u.health_id or u.id},
            *([{"system": "https://abha.abdm.gov.in", "value": prof.abha_id}]
              if prof and getattr(prof, "abha_id", None) else []),
        ],
        "name": [{"text": u.full_name}],
        "gender": gender_map.get((prof.gender or "").lower(), "unknown") if prof and prof.gender else "unknown",
        "birthDate": prof.dob.isoformat() if prof and prof.dob else None,
        "telecom": telecom,
        "address": [{"text": prof.address}] if prof and prof.address else [],
    }


@router.get("/patient")
def fhir_patient(patient_id: str | None = None, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    pid = resolve_patient_id(db, user, patient_id)
    u = db.query(User).filter_by(id=pid).first()
    prof = db.query(PatientProfile).filter_by(user_id=pid).first()
    return _patient_resource(u, prof)


@router.get("/bundle")
def fhir_bundle(patient_id: str | None = None, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    pid = resolve_patient_id(db, user, patient_id)
    u = db.query(User).filter_by(id=pid).first()
    prof = db.query(PatientProfile).filter_by(user_id=pid).first()
    entries: list[dict] = [{"resource": _patient_resource(u, prof)}]
    for c in db.query(MedicalCondition).filter_by(owner_id=pid).limit(200).all():
        entries.append({"resource": {
            "resourceType": "Condition",
            "clinicalStatus": {"text": c.status},
            "code": {"text": c.condition_name},
            "onsetDateTime": c.diagnosed_date.isoformat() if c.diagnosed_date else None,
            "note": [{"text": c.notes}] if c.notes else [],
        }})
    for m in db.query(MedicationRecord).filter_by(owner_id=pid).limit(200).all():
        entries.append({"resource": {
            "resourceType": "MedicationStatement",
            "status": "active" if m.status == "ongoing" else "completed",
            "medicationCodeableConcept": {"text": m.medicine_name},
            "dosage": [{"text": f"{m.dosage or ''} {m.frequency or ''}".strip()}],
            "note": [{"text": m.notes}] if m.notes else [],
        }})
    for a in db.query(AllergyRecord).filter_by(owner_id=pid).limit(200).all():
        entries.append({"resource": {
            "resourceType": "AllergyIntolerance",
            "clinicalStatus": {"text": a.status},
            "code": {"text": a.allergen},
            "reaction": [{"manifestation": [{"text": a.reaction}]}] if a.reaction else [],
        }})
    for v in db.query(Vital).filter_by(owner_id=pid).order_by(Vital.created_at.desc()).limit(200).all():
        val = v.value if v.value is not None else (v.systolic or 0)
        entries.append({"resource": {
            "resourceType": "Observation",
            "status": "final",
            "code": {"text": v.vital_type},
            "valueQuantity": {"value": val, "unit": v.unit or ""},
            "effectiveDateTime": v.measured_at.isoformat() if v.measured_at else None,
        }})
    for n in db.query(VisitNote).filter_by(patient_id=pid).order_by(
            VisitNote.created_at.desc()).limit(200).all():
        entries.append({"resource": {
            "resourceType": "Encounter",
            "status": "finished",
            "type": [{"text": n.note_type}],
            "reasonCode": [{"text": n.diagnosis_name or n.title or ""}],
            "period": {"start": n.visit_date.isoformat() if n.visit_date else None},
        }})
    return {"resourceType": "Bundle", "type": "collection", "total": len(entries),
            "entry": entries}
