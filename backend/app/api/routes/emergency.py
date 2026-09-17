"""Emergency SOS alerts: patient triggers, assigned doctors get notified."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_patient, is_assigned
from app.db.session import get_db
from app.models.tables import EmergencyAlert, User, DoctorPatientAssignment, PatientProfile
from app.schemas.schemas import EmergencyAlertIn, EmergencyAlertOut
from app.services.notify import notify, notify_phone_sms, patient_phone

router = APIRouter()


def _out(a: EmergencyAlert, db: Session) -> EmergencyAlertOut:
    u = db.query(User).filter_by(id=a.patient_id).first()
    return EmergencyAlertOut(
        id=a.id,
        patient_id=a.patient_id,
        patient_name=u.full_name if u else None,
        patient_email=u.email if u else None,
        message=a.message,
        latitude=a.latitude,
        longitude=a.longitude,
        status=a.status,
        resolved_by=a.resolved_by,
        resolved_at=a.resolved_at,
        created_at=a.created_at,
    )


@router.post("/alert", response_model=EmergencyAlertOut, status_code=201)
def trigger_alert(
    data: EmergencyAlertIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """SOS alert — works for every role.

    Patients file it under themselves and all linked doctors are notified.
    Doctors pass ``patient_id`` (must be an assigned patient) to raise an SOS
    for that patient; the patient, their emergency contact and fellow doctors
    are notified. Admins may pass any patient's id.
    """
    from app.models.tables import User as U

    target_id = user.id
    raised_by_name: str | None = None
    if user.role == "patient":
        target_id = user.id
    elif user.role == "doctor":
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="patient_id required: pick the patient this SOS is for")
        if not is_assigned(db, user.id, data.patient_id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
        target_id = data.patient_id
        raised_by_name = f"Dr. {user.full_name}"
    elif user.role == "admin":
        if not data.patient_id:
            raise HTTPException(status_code=400, detail="patient_id required")
        if not db.query(U).filter_by(id=data.patient_id, role="patient").first():
            raise HTTPException(status_code=404, detail="Patient not found")
        target_id = data.patient_id
        raised_by_name = f"{user.full_name} (admin)"
    else:
        raise HTTPException(status_code=403, detail="Forbidden for your role")

    target = db.query(U).filter_by(id=target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Patient not found")

    alert = EmergencyAlert(
        patient_id=target_id,
        message=(data.message or "").strip() or None,
        latitude=data.latitude,
        longitude=data.longitude,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    loc = f" (📍 {data.latitude:.4f}, {data.longitude:.4f})" if data.latitude and data.longitude else ""
    origin = f"{raised_by_name} raised this SOS for {target.full_name}" if raised_by_name else f"{target.full_name} triggered an SOS"
    title = f"🚨 EMERGENCY — {target.full_name}"
    body = f"{origin}: {(data.message or 'may need help now.')}" + loc

    # 1) In-app + email notifications to all assigned doctors (except the raiser)
    links = db.query(DoctorPatientAssignment).filter_by(patient_id=target_id).all()
    for link in links:
        if link.doctor_id == user.id:
            continue
        notify(db, link.doctor_id, "emergency", title, body, link="/doctor", ref=f"emg-{alert.id}-{link.doctor_id}")

    # 2) In-app notification to the patient themselves
    notify(db, target_id, "emergency", "🚨 Emergency alert sent" if target_id == user.id else f"🚨 {raised_by_name} raised an SOS for you",
           body, link="/patient" if target.role == "patient" else "/doctor", ref=f"emg-self-{alert.id}")

    # 3) SMS webhook to the patient's emergency contact + own phone (when set)
    try:
        prof = db.query(PatientProfile).filter_by(user_id=target_id).first()
        numbers = {patient_phone(db, target_id), prof.emergency_contact if prof else None}
        for num in numbers:
            if num:
                notify_phone_sms(num, f"[MedRec EMERGENCY] {body}")
    except Exception:
        pass

    return _out(alert, db)


@router.get("/my", response_model=list[EmergencyAlertOut])
def my_alerts(db: Session = Depends(get_db), user: User = Depends(require_patient)):
    rows = (
        db.query(EmergencyAlert)
        .filter_by(patient_id=user.id)
        .order_by(EmergencyAlert.created_at.desc())
        .limit(50)
        .all()
    )
    return [_out(a, db) for a in rows]


@router.get("/assigned", response_model=list[EmergencyAlertOut])
def assigned_alerts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Doctors (and admins) see SOS alerts from their assigned patients."""
    if user.role not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden for your role")
    if user.role == "admin":
        rows = db.query(EmergencyAlert).order_by(EmergencyAlert.created_at.desc()).limit(100).all()
        return [_out(a, db) for a in rows]
    links = db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()
    pids = [l.patient_id for l in links]
    if not pids:
        return []
    rows = (
        db.query(EmergencyAlert)
        .filter(EmergencyAlert.patient_id.in_(pids))
        .order_by(EmergencyAlert.created_at.desc())
        .limit(100)
        .all()
    )
    return [_out(a, db) for a in rows]


@router.post("/{alert_id}/resolve", response_model=EmergencyAlertOut)
def resolve_alert(alert_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = db.query(EmergencyAlert).filter_by(id=alert_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    allowed = (
        user.role == "admin"
        or a.patient_id == user.id
        or (user.role == "doctor" and is_assigned(db, user.id, a.patient_id))
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not allowed to resolve this alert")
    a.status = "resolved"
    a.resolved_by = user.id
    a.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(a)
    return _out(a, db)
