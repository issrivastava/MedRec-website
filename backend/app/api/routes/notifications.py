from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import Notification, User
from app.schemas.schemas import NotificationOut

router = APIRouter()


@router.get("/my", response_model=list[NotificationOut])
def my_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Notification).filter_by(user_id=user.id).order_by(Notification.created_at.desc()).limit(100).all()


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"unread": db.query(Notification).filter_by(user_id=user.id, read=False).count()}


@router.patch("/{note_id}/read", response_model=NotificationOut)
def mark_read(note_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.query(Notification).filter_by(id=note_id, user_id=user.id).first()
    from fastapi import HTTPException
    if not n:
        raise HTTPException(status_code=404, detail="Not found")
    n.read = True
    db.commit()
    db.refresh(n)
    return n


@router.post("/read-all", response_model=dict)
def mark_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # synchronize_session=False: explicit bulk UPDATE + commit, no session-state
    # surprises — the row count returned is the source of truth for the UI.
    marked = (
        db.query(Notification)
        .filter_by(user_id=user.id, read=False)
        .update({"read": True}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "marked": marked}


@router.delete("/my", response_model=dict)
def clear_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Clear all: permanently delete every notification for the caller."""
    deleted = (
        db.query(Notification)
        .filter_by(user_id=user.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": deleted}
