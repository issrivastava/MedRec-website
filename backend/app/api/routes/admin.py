from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.tables import User, Document, Appointment, VisitNote, ContactMessage, Review
from app.schemas.schemas import AdminStatsOut, UserOut, ContactOut

router = APIRouter()


@router.get("/stats", response_model=AdminStatsOut)
def stats(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    from datetime import date as _date
    by_role = dict(db.query(User.role, func.count(User.id)).group_by(User.role).all())
    try:
        from app.models.tables import Invoice
        from sqlalchemy import func as _f
        revenue = db.query(_f.coalesce(_f.sum(Invoice.paid_amount), 0)).filter(
            Invoice.status.in_(["paid", "partially_paid"])).scalar() or 0.0
        pending = db.query(_f.coalesce(_f.sum(Invoice.amount - Invoice.paid_amount), 0)).filter(
            Invoice.status.in_(["issued", "partially_paid"])).scalar() or 0.0
        invoices = db.query(_f.count(Invoice.id)).scalar() or 0
    except Exception:
        revenue, pending, invoices = 0.0, 0.0, 0
    try:
        today_count = db.query(func.count(Appointment.id)).filter(
            Appointment.date == _date.today()).scalar() or 0
    except Exception:
        today_count = 0
    return AdminStatsOut(
        users_total=db.query(func.count(User.id)).scalar() or 0,
        patients=by_role.get("patient", 0),
        doctors=by_role.get("doctor", 0),
        admins=by_role.get("admin", 0),
        receptionists=by_role.get("receptionist", 0) + by_role.get("nurse", 0),
        documents=db.query(func.count(Document.id)).scalar() or 0,
        appointments_booked=db.query(func.count(Appointment.id)).filter_by(status="booked").scalar() or 0,
        appointments_today=today_count,
        visit_notes=db.query(func.count(VisitNote.id)).scalar() or 0,
        contact_messages=db.query(func.count(ContactMessage.id)).scalar() or 0,
        reviews=db.query(func.count(Review.id)).scalar() or 0,
        invoices=invoices,
        revenue_collected=round(float(revenue or 0.0), 2),
        fees_pending=round(float(pending or 0.0), 2),
    )


@router.get("/activity", response_model=dict)
def activity(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Extended admin insight: new-feature usage + recent signups + risk counts."""
    from app.models.tables import Vital, Vaccination, ShareLink, Message, Referral, SecondOpinion, Announcement
    def _count(model):
        try:
            return db.query(func.count(model.id)).scalar() or 0
        except Exception:
            return 0
    recent = db.query(User).order_by(User.created_at.desc()).limit(10).all()
    try:
        risk_critical = None
        from app.models.tables import EmergencyAlert, HealthAlert
        risk_critical = db.query(func.count(EmergencyAlert.id)).filter_by(status="active").scalar() or 0
        unacked = db.query(func.count(HealthAlert.id)).filter_by(acknowledged=False).scalar() or 0
    except Exception:
        risk_critical, unacked = 0, 0
    return {
        "vitals": _count(Vital), "vaccinations": _count(Vaccination),
        "share_links": _count(ShareLink), "messages": _count(Message),
        "referrals": _count(Referral), "second_opinions": _count(SecondOpinion),
        "announcements": _count(Announcement),
        "active_sos": risk_critical, "unacked_alerts": unacked,
        "recent_users": [{"name": u.full_name, "email": u.email, "role": u.role,
                          "created_at": u.created_at} for u in recent],
    }


@router.get("/users", response_model=list[UserOut])
def list_users(q: str | None = None, role: str | None = None, db: Session = Depends(get_db),
               user: User = Depends(require_admin)):
    query = db.query(User)
    if role:
        query = query.filter_by(role=role)
    if q:
        like = f"%{q}%"
        query = query.filter((User.email.ilike(like)) | (User.full_name.ilike(like)))
    return query.order_by(User.created_at.desc()).limit(200).all()


@router.patch("/users/{user_id}/role", response_model=UserOut)
def set_role(user_id: str, role: str, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if role not in ("patient", "doctor", "admin", "receptionist", "nurse"):
        raise HTTPException(status_code=400, detail="Invalid role")
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    target.role = role
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(target)
    db.commit()
    return None


@router.get("/contact", response_model=list[ContactOut])
def all_contact(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return db.query(ContactMessage).order_by(ContactMessage.created_at.desc()).limit(200).all()


@router.delete("/contact/{msg_id}", status_code=204)
def delete_contact(msg_id: str, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    m = db.query(ContactMessage).filter_by(id=msg_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(m)
    db.commit()
    return None
