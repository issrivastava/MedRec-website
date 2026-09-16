from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import User, PatientProfile, Document, VisitNote, Appointment, HealthAlert
from app.services.pdf_export import build_record_pdf

router = APIRouter()


@router.get("/pdf")
def export_pdf(patient_id: str | None = None, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    """Full record PDF for hospital visits / insurance."""
    if user.role == "admin" and patient_id:
        from app.models.tables import User as U
        target = db.query(U).filter_by(id=patient_id).first()
        pid = target.id if target else user.id
    else:
        pid = resolve_patient_id(db, user, patient_id)
    patient = db.query(User).filter_by(id=pid).first()
    prof = db.query(PatientProfile).filter_by(user_id=pid).first()
    profile = {}
    if prof:
        profile = {"Date of birth": prof.dob, "Gender": prof.gender, "Blood group": prof.blood_group,
                   "Phone": prof.phone, "Address": prof.address, "Allergies": prof.allergies,
                   "Chronic conditions": prof.chronic_conditions, "Emergency contact": prof.emergency_contact}

    docs = []
    for d in db.query(Document).filter_by(owner_id=pid).order_by(Document.visit_date.desc()).all():
        docs.append({"title": d.title, "doc_type": d.doc_type,
                     "visit_date": d.visit_date.isoformat() if d.visit_date else "",
                     "doctor_name": d.doctor_name,
                     "summary": d.ai_summary.summary_text if d.ai_summary else ""})
    visits = []
    for v in db.query(VisitNote).filter_by(patient_id=pid).order_by(VisitNote.created_at.desc()).all():
        doc = db.query(User).filter_by(id=v.doctor_id).first()
        visits.append({"note_type": v.note_type, "title": v.title, "content": v.content,
                       "medicines": v.medicines,
                       "visit_date": v.visit_date.isoformat() if v.visit_date else "",
                       "doctor_name": doc.full_name if doc else ""})
    appts = []
    for a in db.query(Appointment).filter_by(patient_id=pid).order_by(Appointment.date.desc()).all():
        doc = db.query(User).filter_by(id=a.doctor_id).first()
        appts.append({"date": a.date.isoformat(), "start_time": a.start_time.strftime("%H:%M"),
                      "doctor_name": doc.full_name if doc else "", "status": a.status})
    alerts = [{"test_name": x.test_name, "value": x.value, "unit": x.unit, "flag": x.flag, "message": x.message}
              for x in db.query(HealthAlert).filter_by(patient_id=pid).all()]

    pdf = build_record_pdf(patient.full_name, patient.email, profile, docs, visits, appts, alerts)
    fname = f"medrec-{patient.full_name.replace(' ', '-').lower()}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})
