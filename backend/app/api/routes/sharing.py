"""Secure share links (expiring, view-limited) + granular consent + public view."""
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.tables import ShareLink, Consent, Document, Vital, VisitNote, User
from app.schemas.schemas import ShareLinkIn, ShareLinkOut, ConsentIn, ConsentOut

router = APIRouter()


def _out(link: ShareLink) -> dict:
    return {"id": link.id, "token": link.token, "url_path": f"/s/{link.token}",
            "scope": link.scope, "expires_at": link.expires_at, "max_views": link.max_views,
            "views": link.views, "revoked": link.revoked, "label": link.label,
            "created_at": link.created_at}


@router.post("/share", response_model=ShareLinkOut, status_code=201)
def create_share(data: ShareLinkIn, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    if data.document_ids:
        owned = {d.id for d in db.query(Document).filter_by(owner_id=user.id).all()}
        bad = [i for i in data.document_ids if i not in owned]
        if bad:
            raise HTTPException(status_code=400, detail="Unknown document ids")
    link = ShareLink(owner_id=user.id, scope=data.scope,
                     document_ids=data.document_ids or None,
                     token=secrets.token_urlsafe(24),
                     expires_at=datetime.utcnow() + timedelta(hours=data.expires_in_hours),
                     max_views=data.max_views, label=data.label)
    db.add(link)
    db.commit()
    db.refresh(link)
    return _out(link)


@router.get("/share", response_model=list[ShareLinkOut])
def list_shares(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    rows = db.query(ShareLink).filter_by(owner_id=user.id).order_by(ShareLink.created_at.desc()).all()
    return [_out(r) for r in rows]


@router.delete("/share/{link_id}", status_code=204)
def revoke_share(link_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    link = db.query(ShareLink).filter_by(id=link_id, owner_id=user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Not found")
    link.revoked = True
    db.commit()
    return None


@router.get("/public/{token}", response_model=dict)
def public_view(token: str, db: Session = Depends(get_db)):
    """No login — hospital/family opens /s/{token}. Enforces expiry + view cap."""
    link = db.query(ShareLink).filter_by(token=token, revoked=False).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link invalid or revoked")
    if link.expires_at and link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Link expired")
    if link.max_views and link.views >= link.max_views:
        raise HTTPException(status_code=410, detail="View limit reached")
    link.views += 1
    db.commit()
    owner = db.query(User).filter_by(id=link.owner_id).first()
    payload: dict = {"owner_name": owner.full_name if owner else "Patient",
                     "scope": link.scope, "label": link.label, "views": link.views}
    if link.scope in ("documents", "all"):
        q = db.query(Document).filter_by(owner_id=link.owner_id)
        if link.document_ids:
            q = q.filter(Document.id.in_(link.document_ids))
        docs = q.order_by(Document.visit_date.desc().nullslast()).limit(50).all()
        payload["documents"] = [{"id": d.id, "title": d.title, "doc_type": d.doc_type,
                                 "visit_date": d.visit_date, "doctor_name": d.doctor_name,
                                 "hospital": d.hospital} for d in docs]
    if link.scope in ("vitals", "all"):
        vitals = db.query(Vital).filter_by(owner_id=link.owner_id).order_by(Vital.measured_at.desc()).limit(30).all()
        payload["vitals"] = [{"type": v.vital_type, "value": v.value, "systolic": v.systolic,
                              "diastolic": v.diastolic, "unit": v.unit,
                              "date": v.measured_at} for v in vitals]
    if link.scope in ("prescriptions", "all"):
        notes = db.query(VisitNote).filter_by(patient_id=link.owner_id).order_by(VisitNote.created_at.desc()).limit(20).all()
        payload["prescriptions"] = [{"title": n.title, "content": n.content, "medicines": n.medicines,
                                     "visit_date": n.visit_date} for n in notes]
    return payload


# ---- Granular consent ----
@router.get("/consents", response_model=list[ConsentOut])
def list_consents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "patient":
        rows = db.query(Consent).filter_by(patient_id=user.id).all()
    elif user.role == "doctor":
        rows = db.query(Consent).filter_by(doctor_id=user.id).all()
    else:
        rows = db.query(Consent).limit(200).all()
    out = []
    for c in rows:
        doc = db.query(User).filter_by(id=c.doctor_id).first()
        out.append({"id": c.id, "patient_id": c.patient_id, "doctor_id": c.doctor_id,
                    "doctor_name": doc.full_name if doc else None, "scope": c.scope,
                    "allowed": c.allowed, "updated_at": c.updated_at})
    return out


@router.post("/consents", response_model=ConsentOut, status_code=201)
def set_consent(data: ConsentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    doc = db.query(User).filter_by(id=data.doctor_id, role="doctor").first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    c = db.query(Consent).filter_by(patient_id=user.id, doctor_id=data.doctor_id, scope=data.scope).first()
    if c:
        c.allowed = data.allowed
    else:
        c = Consent(patient_id=user.id, doctor_id=data.doctor_id, scope=data.scope, allowed=data.allowed)
        db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "patient_id": c.patient_id, "doctor_id": c.doctor_id,
            "doctor_name": doc.full_name, "scope": c.scope, "allowed": c.allowed,
            "updated_at": c.updated_at}


def consent_allows(db: Session, patient_id: str, doctor_id: str, scope: str) -> bool:
    """Default-allow (backward compatible); explicit deny blocks."""
    c = db.query(Consent).filter_by(patient_id=patient_id, doctor_id=doctor_id, scope=scope).first()
    return c.allowed if c else True
