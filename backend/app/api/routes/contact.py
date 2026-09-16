from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.tables import ContactMessage, User
from app.schemas.schemas import ContactIn, ContactOut

router = APIRouter()


@router.post("", response_model=ContactOut, status_code=201)
def submit_contact(data: ContactIn, db: Session = Depends(get_db)):
    msg = ContactMessage(
        name=data.name,
        email=data.email.lower(),
        subject=data.subject,
        message=data.message,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.get("/my", response_model=list[ContactOut])
def my_messages(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(ContactMessage)
        .filter(ContactMessage.email == user.email)
        .order_by(ContactMessage.created_at.desc())
        .all()
    )
