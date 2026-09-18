"""Referrals, second opinions, Rx templates, announcements."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_doctor, require_admin, is_assigned
from app.db.session import get_db
from app.models.tables import Referral, SecondOpinion, RxTemplate, Announcement, User, Document
from app.schemas.schemas import (ReferralIn, ReferralOut, SecondOpinionIn, SecondOpinionOut,
                                 SecondOpinionAnswerIn, RxTemplateIn, RxTemplateOut,
                                 AnnouncementIn, AnnouncementOut)
from app.services.notify import notify

router = APIRouter()


def _ref_out(db: Session, r: Referral) -> dict:
    f = db.query(User).filter_by(id=r.from_doctor_id).first()
    p = db.query(User).filter_by(id=r.patient_id).first()
    t = db.query(User).filter_by(id=r.to_doctor_id).first() if r.to_doctor_id else None
    return {"id": r.id, "from_doctor_id": r.from_doctor_id, "from_doctor_name": f.full_name if f else None,
            "to_doctor_id": r.to_doctor_id, "to_doctor_email": r.to_doctor_email or (t.email if t else None),
            "patient_id": r.patient_id, "patient_name": p.full_name if p else None,
            "reason": r.reason, "note": r.note, "status": r.status, "created_at": r.created_at}


# ---- Referrals ----
@router.post("/referrals", response_model=ReferralOut, status_code=201)
def create_referral(data: ReferralIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not is_assigned(db, user.id, data.patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    to_id = data.to_doctor_id
    if not to_id and data.to_doctor_email:
        t = db.query(User).filter_by(email=data.to_doctor_email, role="doctor").first()
        if t:
            to_id = t.id
    r = Referral(from_doctor_id=user.id, to_doctor_id=to_id, to_doctor_email=data.to_doctor_email,
                 patient_id=data.patient_id, reason=data.reason, note=data.note)
    db.add(r)
    db.commit()
    db.refresh(r)
    notify(db, data.patient_id, "referral", f"Dr. {user.full_name} referred you", data.reason[:200], link="/patient")
    if to_id:
        notify(db, to_id, "referral", f"New referral from Dr. {user.full_name}", data.reason[:200], link="/doctor")
    return _ref_out(db, r)


@router.get("/referrals", response_model=list[ReferralOut])
def list_referrals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "doctor":
        rows = db.query(Referral).filter(
            (Referral.from_doctor_id == user.id) | (Referral.to_doctor_id == user.id)).order_by(Referral.created_at.desc()).all()
    elif user.role == "patient":
        rows = db.query(Referral).filter_by(patient_id=user.id).order_by(Referral.created_at.desc()).all()
    else:
        rows = db.query(Referral).order_by(Referral.created_at.desc()).limit(200).all()
    return [_ref_out(db, r) for r in rows]


@router.patch("/referrals/{ref_id}", response_model=ReferralOut)
def referral_status(ref_id: str, status: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if status not in ("pending", "accepted", "declined", "completed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    r = db.query(Referral).filter_by(id=ref_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == "doctor" and user.id not in (r.from_doctor_id, r.to_doctor_id or ""):
        raise HTTPException(status_code=403, detail="Not yours")
    if user.role == "patient" and r.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    r.status = status
    db.commit()
    return _ref_out(db, r)


# ---- Second opinions ----
def _so_out(db: Session, s: SecondOpinion) -> dict:
    p = db.query(User).filter_by(id=s.patient_id).first()
    t = db.query(User).filter_by(id=s.target_doctor_id).first()
    return {"id": s.id, "patient_id": s.patient_id, "patient_name": p.full_name if p else None,
            "target_doctor_id": s.target_doctor_id, "target_doctor_name": t.full_name if t else None,
            "document_ids": s.document_ids, "question": s.question, "answer": s.answer,
            "status": s.status, "created_at": s.created_at}


@router.post("/second-opinions", response_model=SecondOpinionOut, status_code=201)
def request_opinion(data: SecondOpinionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    t = db.query(User).filter_by(id=data.target_doctor_id, role="doctor").first()
    if not t:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if data.document_ids:
        owned = {d.id for d in db.query(Document).filter_by(owner_id=user.id).all()}
        if any(i not in owned for i in data.document_ids):
            raise HTTPException(status_code=400, detail="Unknown document")
    s = SecondOpinion(patient_id=user.id, target_doctor_id=data.target_doctor_id,
                      document_ids=data.document_ids, question=data.question)
    db.add(s)
    db.commit()
    db.refresh(s)
    notify(db, data.target_doctor_id, "second_opinion", f"Second-opinion request from {user.full_name}",
           data.question[:200], link="/doctor")
    return _so_out(db, s)


@router.get("/second-opinions", response_model=list[SecondOpinionOut])
def list_opinions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "patient":
        rows = db.query(SecondOpinion).filter_by(patient_id=user.id).order_by(SecondOpinion.created_at.desc()).all()
    elif user.role == "doctor":
        rows = db.query(SecondOpinion).filter_by(target_doctor_id=user.id).order_by(SecondOpinion.created_at.desc()).all()
    else:
        rows = db.query(SecondOpinion).order_by(SecondOpinion.created_at.desc()).limit(200).all()
    return [_so_out(db, s) for s in rows]


@router.post("/second-opinions/{so_id}/answer", response_model=SecondOpinionOut)
def answer_opinion(so_id: str, data: SecondOpinionAnswerIn, db: Session = Depends(get_db),
                   user: User = Depends(require_doctor)):
    s = db.query(SecondOpinion).filter_by(id=so_id, target_doctor_id=user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    s.answer = data.answer
    s.status = "answered"
    db.commit()
    notify(db, s.patient_id, "second_opinion", f"Dr. {user.full_name} answered your request",
           data.answer[:200], link="/patient")
    return _so_out(db, s)


# ---- Rx templates ----
@router.get("/rx-templates", response_model=list[RxTemplateOut])
def list_templates(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    return db.query(RxTemplate).filter_by(doctor_id=user.id).order_by(RxTemplate.created_at.desc()).all()


@router.post("/rx-templates", response_model=RxTemplateOut, status_code=201)
def create_template(data: RxTemplateIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    t = RxTemplate(doctor_id=user.id, name=data.name, content=data.content,
                   medicines=data.medicines, signature_name=data.signature_name or user.full_name)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/rx-templates/{tpl_id}", status_code=204)
def delete_template(tpl_id: str, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    t = db.query(RxTemplate).filter_by(id=tpl_id, doctor_id=user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(t)
    db.commit()
    return None


# ---- Announcements (admin broadcast, visible to all logged-in) ----
@router.post("/announcements", response_model=AnnouncementOut, status_code=201)
def create_announcement(data: AnnouncementIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    a = Announcement(title=data.title, body=data.body, audience=data.audience, created_by=user.id)
    db.add(a)
    db.commit()
    db.refresh(a)
    # fan-out as notifications
    q = db.query(User)
    if data.audience == "patients":
        q = q.filter_by(role="patient")
    elif data.audience == "doctors":
        q = q.filter_by(role="doctor")
    from app.models.tables import Notification
    for u in q.limit(2000).all():
        db.add(Notification(user_id=u.id, kind="announcement", title=data.title, body=data.body[:500], link="/notifications"))
    db.commit()
    return a


@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Announcement).order_by(Announcement.created_at.desc()).limit(20).all()
    return [r for r in rows if r.audience in ("all", user.role + "s", user.role)]
