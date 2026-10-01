from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, require_doctor, is_assigned
from app.db.session import get_db
from app.models.tables import VisitNote, User
from app.schemas.schemas import VisitNoteIn, VisitNoteOut
from app.services.notify import notify, patient_phone, notify_phone_sms

router = APIRouter()


def _out(db: Session, v: VisitNote) -> dict:
    doc = db.query(User).filter_by(id=v.doctor_id).first()
    return _out_with_map(v, {v.doctor_id: doc} if doc else {})


def _out_with_map(v: VisitNote, doctors: dict) -> dict:
    """Bulk-safe serializer (no per-row query)."""
    doc = doctors.get(v.doctor_id)
    d = {c: getattr(v, c) for c in ("id", "patient_id", "doctor_id", "note_type", "title", "content",
                                    "medicines", "visit_date", "follow_up_date", "created_at")}
    d["family_member_id"] = getattr(v, "family_member_id", None)
    d["diagnosis_code"] = getattr(v, "diagnosis_code", None)
    d["diagnosis_name"] = getattr(v, "diagnosis_name", None)
    d["doctor_name"] = doc.full_name if doc else None
    return d


@router.post("", response_model=VisitNoteOut, status_code=201)
def create_note(data: VisitNoteIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not is_assigned(db, user.id, data.patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    if data.family_member_id:
        from app.models.tables import FamilyMember
        if not db.query(FamilyMember).filter_by(id=data.family_member_id, owner_id=data.patient_id).first():
            raise HTTPException(status_code=400, detail="Unknown family member")
    v = VisitNote(
        patient_id=data.patient_id, doctor_id=user.id, note_type=data.note_type,
        title=data.title, content=data.content,
        medicines=[m.model_dump() for m in data.medicines] if data.medicines else None,
        visit_date=data.visit_date, follow_up_date=data.follow_up_date,
        family_member_id=data.family_member_id,
        diagnosis_code=data.diagnosis_code, diagnosis_name=data.diagnosis_name,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    notify(db, data.patient_id, "prescription" if data.note_type == "prescription" else "visit_note",
           f"New {data.note_type} from Dr. {user.full_name}",
           (data.title + "\n" if data.title else "") + data.content[:300], link="/patient")
    # Continuity: drop the note + follow-up reminder into the secure chat thread
    # so the patient sees it next to the conversation (respects chat consent).
    try:
        from app.models.tables import Message
        from app.api.routes.sharing import consent_allows
        if consent_allows(db, data.patient_id, user.id, "chat"):
            meds = ""
            try:
                meds = ", ".join(m.get("name", "") for m in (v.medicines or []) if m.get("name"))[:200]
            except Exception:
                pass
            chat_body = (f"📋 New {v.note_type} from Dr. {user.full_name}: "
                         f"{v.title or ''}\n{(v.content or '')[:400]}"
                         + (f"\n💊 {meds}" if meds else "")
                         + (f"\n🔁 Follow-up on {v.follow_up_date} — reply here if symptoms change."
                            if v.follow_up_date else "\nReply here if you have questions."))
            db.add(Message(doctor_id=user.id, patient_id=data.patient_id, sender_id=user.id,
                           body=chat_body, priority="normal",
                           category="prescription" if v.note_type == "prescription" else "followup"))
            db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    phone = patient_phone(db, data.patient_id)
    if phone:
        notify_phone_sms(phone, f"MedRec: Dr. {user.full_name} added a {data.note_type} for you.")
    return _out(db, v)


@router.get("/my", response_model=list[VisitNoteOut])
def my_notes(family_member_id: str | None = None, limit: int = 100, offset: int = 0,
             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    try:
        limit = max(1, min(int(limit), settings.MAX_PAGE_SIZE))
    except Exception:
        limit = 100
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    q = db.query(VisitNote).filter_by(patient_id=user.id)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    rows = q.order_by(VisitNote.created_at.desc()).limit(limit).offset(offset).all()
    if not rows:
        return []
    ids = list({v.doctor_id for v in rows})
    doctors = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    return [_out_with_map(v, doctors) for v in rows]


@router.get("/patient/{patient_id}", response_model=list[VisitNoteOut])
def patient_notes(patient_id: str, family_member_id: str | None = None, limit: int = 100, offset: int = 0,
                  db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    if not is_assigned(db, user.id, patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    try:
        limit = max(1, min(int(limit), settings.MAX_PAGE_SIZE))
    except Exception:
        limit = 100
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    q = db.query(VisitNote).filter_by(patient_id=patient_id)
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    rows = q.order_by(VisitNote.created_at.desc()).limit(limit).offset(offset).all()
    if not rows:
        return []
    ids = list({v.doctor_id for v in rows})
    doctors = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}
    return [_out_with_map(v, doctors) for v in rows]


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    v = db.query(VisitNote).filter_by(id=note_id, doctor_id=user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(v)
    db.commit()
    return None


@router.get("/{note_id}/rx-pdf")
def rx_pdf(note_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """E-prescription PDF with doctor letterhead + signature block.

    Patients download own; assigned doctor downloads. Signature name comes from
    the doctor's latest RxTemplate.signature_name or their full name."""
    from fastapi.responses import Response
    from io import BytesIO
    v = db.query(VisitNote).filter_by(id=note_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == "patient" and v.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    if user.role == "doctor" and v.doctor_id != user.id and not is_assigned(db, user.id, v.patient_id):
        raise HTTPException(status_code=403, detail="Not yours")
    doc = db.query(User).filter_by(id=v.doctor_id).first()
    pat = db.query(User).filter_by(id=v.patient_id).first()
    from app.models.tables import RxTemplate
    tpl = db.query(RxTemplate).filter_by(doctor_id=v.doctor_id).order_by(RxTemplate.created_at.desc()).first()
    sig = (tpl.signature_name if tpl and tpl.signature_name else (doc.full_name if doc else "Doctor"))
    spec = ""
    try:
        if doc and doc.doctor_profile:
            spec = f"{doc.doctor_profile.specialization or ''} {doc.doctor_profile.license_no or ''}".strip()
    except Exception:
        pass
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.units import mm
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"<b>Dr. {doc.full_name if doc else ''}</b>{(' — ' + spec) if spec else ''}", styles["Title"]),
        Paragraph("E-Prescription · MedRec", styles["Normal"]),
        HRFlowable(width="100%", thickness=1), Spacer(1, 6),
        Paragraph(f"Patient: <b>{pat.full_name if pat else ''}</b> · Date: {v.visit_date or v.created_at.date()}", styles["Normal"]),
        Paragraph(f"Title: {v.title or '(prescription)'}", styles["Normal"]), Spacer(1, 6),
        Paragraph((v.content or "").replace(chr(10), "<br/>"), styles["Normal"]), Spacer(1, 6),
    ]
    for m in v.medicines or []:
        story.append(Paragraph(
            f"• <b>{m.get('name')}</b> — {m.get('dosage') or ''} {m.get('frequency') or ''} x {m.get('duration') or ''}",
            styles["Normal"]))
    story += [Spacer(1, 12), HRFlowable(width="40%", thickness=1, hAlign="RIGHT"),
              Paragraph(f"<para alignment=right>Signature: <b>{sig}</b><br/>Date: {v.visit_date or v.created_at.date()}</para>",
                        styles["Normal"]),
              Spacer(1, 6),
              Paragraph("<i>Computer-generated via MedRec. Follow your doctor's advice; do not self-medicate.</i>",
                        styles["Italic"])]
    pdf.build(story)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="rx-{note_id[:8]}.pdf"'})
