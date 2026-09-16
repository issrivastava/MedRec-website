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
    by_role = dict(db.query(User.role, func.count(User.id)).group_by(User.role).all())
    return AdminStatsOut(
        users_total=db.query(func.count(User.id)).scalar() or 0,
        patients=by_role.get("patient", 0),
        doctors=by_role.get("doctor", 0),
        admins=by_role.get("admin", 0),
        documents=db.query(func.count(Document.id)).scalar() or 0,
        appointments_booked=db.query(func.count(Appointment.id)).filter_by(status="booked").scalar() or 0,
        visit_notes=db.query(func.count(VisitNote.id)).scalar() or 0,
        contact_messages=db.query(func.count(ContactMessage.id)).scalar() or 0,
        reviews=db.query(func.count(Review.id)).scalar() or 0,
    )


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
    if role not in ("patient", "doctor", "admin"):
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
