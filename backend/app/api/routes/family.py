from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_patient
from app.db.session import get_db
from app.models.tables import FamilyMember, User
from app.schemas.schemas import FamilyMemberIn, FamilyMemberOut

router = APIRouter()


@router.get("", response_model=list[FamilyMemberOut])
def list_members(db: Session = Depends(get_db), user: User = Depends(require_patient)):
    return db.query(FamilyMember).filter_by(owner_id=user.id).order_by(FamilyMember.created_at).all()


@router.post("", response_model=FamilyMemberOut, status_code=201)
def add_member(data: FamilyMemberIn, db: Session = Depends(get_db), user: User = Depends(require_patient)):
    m = FamilyMember(owner_id=user.id, **data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.put("/{member_id}", response_model=FamilyMemberOut)
def update_member(member_id: str, data: FamilyMemberIn, db: Session = Depends(get_db),
                  user: User = Depends(require_patient)):
    m = db.query(FamilyMember).filter_by(id=member_id, owner_id=user.id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump().items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{member_id}", status_code=204)
def delete_member(member_id: str, db: Session = Depends(get_db), user: User = Depends(require_patient)):
    m = db.query(FamilyMember).filter_by(id=member_id, owner_id=user.id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(m)
    db.commit()
    return None
