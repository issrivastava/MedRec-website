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
    d["vitals"] = getattr(v, "vitals", None)
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
        vitals=data.vitals.model_dump(exclude_none=True) if data.vitals else None,
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


@router.post("/{note_id}/refill", response_model=dict)
def request_refill(note_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Refill loop: patient asks the prescribing doctor for more of the same
    medicines. Notifies the doctor in-app (+SMS when configured)."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    v = db.query(VisitNote).filter_by(id=note_id, patient_id=user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Prescription not found")
    meds = ", ".join(m.get("name", "") for m in (v.medicines or []) if m.get("name"))[:300]
    notify(db, v.doctor_id, "refill_request",
           f"Refill requested by {user.full_name}",
           f"{v.title or 'Prescription'} ({v.visit_date or v.created_at.date()}): {meds or 'no medicines listed'}. "
           f"Reply with a new prescription if appropriate.",
           link="/doctor", ref=f"refill:{v.id}:{user.id}")
    doc = db.query(User).filter_by(id=v.doctor_id).first()
    try:
        from app.models.tables import DoctorProfile
        prof = db.query(DoctorProfile).filter_by(user_id=v.doctor_id).first()
        phone = prof.phone if prof and prof.phone else None
    except Exception:
        phone = None
    if phone:
        notify_phone_sms(phone, f"MedRec: {user.full_name} requested a refill ({v.title or 'prescription'}).")
    return {"ok": True, "doctor": doc.full_name if doc else None}


@router.get("/{note_id}/rx-pdf")
def rx_pdf(note_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Detailed e-prescription PDF: letterhead, patient demographics + vitals,
    diagnosis, advice, medicines table, follow-up, signature block.

    Patients download own; assigned doctor downloads. Signature name comes from
    the doctor's latest RxTemplate.signature_name or their full name."""
    from datetime import datetime as _dt
    from fastapi.responses import Response
    from io import BytesIO
    from xml.sax.saxutils import escape as _xe
    v = db.query(VisitNote).filter_by(id=note_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == "patient" and v.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    if user.role == "doctor" and v.doctor_id != user.id and not is_assigned(db, user.id, v.patient_id):
        raise HTTPException(status_code=403, detail="Not yours")
    doc = db.query(User).filter_by(id=v.doctor_id).first()
    pat = db.query(User).filter_by(id=v.patient_id).first()
    pprof = getattr(pat, "patient_profile", None) if pat else None
    dprof = getattr(doc, "doctor_profile", None) if doc else None
    from app.models.tables import RxTemplate
    tpl = db.query(RxTemplate).filter_by(doctor_id=v.doctor_id).order_by(RxTemplate.created_at.desc()).first()
    sig = (tpl.signature_name if tpl and tpl.signature_name else (doc.full_name if doc else "Doctor"))

    # ---- Doctor letterhead ----
    d_credentials = " · ".join(x for x in [
        getattr(dprof, "qualification", None),
        getattr(dprof, "specialization", None)] if x)
    d_addr = " ".join(x for x in [
        getattr(dprof, "hospital", None),
        getattr(dprof, "clinic_address", None)] if x)
    d_phone = getattr(dprof, "phone", None) or (doc.phone if doc else None)
    d_reg = (getattr(dprof, "license_no", None)
             or getattr(dprof, "registration_council", None))

    # ---- Patient demographics: vitals snapshot first, profile as fallback ----
    vit = dict(getattr(v, "vitals", None) or {})
    age = vit.get("age")
    if age in (None, ""):
        try:
            dob = getattr(pprof, "dob", None)
            if dob:
                today = _dt.utcnow().date()
                age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except Exception:
            pass
    sex = vit.get("sex") or getattr(pprof, "gender", None)
    p_phone = getattr(pprof, "phone", None) or (pat.phone if pat else None)
    p_addr = getattr(pprof, "address", None)
    p_hid = pat.health_id if pat else None
    visit_dt = v.visit_date or v.created_at.date()

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    small = styles["Normal"].__class__("rx-small", parent=styles["Normal"])
    small.fontSize = 9
    small.leading = 12
    right_small = styles["Normal"].__class__("rx-right", parent=small)
    right_small.alignment = 2  # right
    TEAL = colors.HexColor("#0e9384")

    story = [
        Paragraph(f"<b>Dr. {_xe(doc.full_name) if doc else 'Doctor'}</b>"
                  f"{(' — ' + _xe(d_addr)) if d_addr else ''}", styles["Title"]),
    ]
    doc_sub = " · ".join(x for x in [
        d_credentials or "", f"Reg: {d_reg}" if d_reg else "",
        f"Ph: {d_phone}" if d_phone else ""] if x)
    if doc_sub:
        story.append(Paragraph(f"<font color=\"#475569\">{_xe(doc_sub)}</font>", small))
    story += [Spacer(1, 4),
              Paragraph("<b><font color=\"#0e9384\" size=\"13\">E-PRESCRIPTION</font></b>", styles["Normal"]),
              HRFlowable(width="100%", thickness=1), Spacer(1, 6)]

    # ---- Patient + visit details ----
    pat_lines = [f"<b>PATIENT</b>", f"<b>{_xe(pat.full_name) if pat else '—'}</b>"]
    demo = " · ".join(x for x in [
        f"Age: {age}" if age not in (None, "") else "",
        f"Sex: {sex}" if sex else "",
        f"Health ID: {p_hid}" if p_hid else ""] if x)
    if demo:
        pat_lines.append(_xe(demo))
    if pat and pat.email:
        pat_lines.append(f"Email: {_xe(pat.email)}")
    if p_phone:
        pat_lines.append(f"Phone: {_xe(p_phone)}")
    if p_addr:
        pat_lines.append(f"Address: {_xe(p_addr)}")
    visit_lines = [f"<b>VISIT DETAILS</b>", f"Date: {visit_dt}"]
    if v.title:
        visit_lines.append(f"Title: {_xe(v.title)}")
    if v.diagnosis_code or v.diagnosis_name:
        visit_lines.append("Diagnosis: " + _xe(" ".join(
            x for x in [v.diagnosis_code or "", ("— " + v.diagnosis_name) if v.diagnosis_name else ""] if x)))
    if v.follow_up_date:
        visit_lines.append(f"<b>Follow-up: {v.follow_up_date}</b>")
    info_tbl = Table([[Paragraph("<br/>".join(pat_lines), small),
                       Paragraph("<br/>".join(visit_lines), small)]],
                     colWidths=[100 * mm, 80 * mm])
    info_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story += [info_tbl, Spacer(1, 8)]

    # ---- Vitals at prescription time ----
    vit_items = []
    if vit.get("bp_sys") or vit.get("bp_dia"):
        vit_items.append(f"BP: {vit.get('bp_sys') or '—'}/{vit.get('bp_dia') or '—'} mmHg")
    if vit.get("pulse") not in (None, ""):
        vit_items.append(f"Pulse: {vit.get('pulse')} /min")
    if vit.get("spo2") not in (None, ""):
        vit_items.append(f"SpO2: {vit.get('spo2')}%")
    if vit.get("temp_c") not in (None, ""):
        vit_items.append(f"Temp: {vit.get('temp_c')} °C")
    if vit.get("weight_kg") not in (None, ""):
        vit_items.append(f"Weight: {vit.get('weight_kg')} kg")
    if vit_items:
        story.append(Paragraph("<b>Vitals:</b> " + _xe(" · ".join(vit_items)), small))
        story.append(Spacer(1, 6))

    # ---- Advice / findings ----
    story.append(Paragraph("<b>Advice / Findings</b>", styles["Normal"]))
    story.append(Paragraph((_xe(v.content or "—")).replace(chr(10), "<br/>"), styles["Normal"]))
    story.append(Spacer(1, 8))

    # ---- Medicines table ----
    meds = list(v.medicines or [])
    if meds:
        story.append(Paragraph("<b>Medicines</b>", styles["Normal"]))
        mrows = [["#", "Medicine", "Dosage", "Frequency", "Duration"]]
        for i, m in enumerate(meds, 1):
            mrows.append([str(i), _xe(str(m.get("name", ""))),
                          _xe(str(m.get("dosage") or "—")),
                          _xe(str(m.get("frequency") or "—")),
                          _xe(str(m.get("duration") or "—"))])
        mtbl = Table(mrows, colWidths=[10 * mm, 70 * mm, 35 * mm, 35 * mm, 30 * mm])
        mtbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.white, colors.HexColor("#f8fafc")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story += [mtbl, Spacer(1, 8)]

    generated = _dt.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    story += [Spacer(1, 12),
              Table([[Paragraph(
                  f"<i>Computer-generated via MedRec · {generated}</i><br/>"
                  f"<i>Follow your doctor's advice; do not self-medicate.</i>",
                  small),
                  Paragraph(f"Signature: <b>{_xe(sig)}</b><br/>Date: {visit_dt}",
                            right_small)]],
                  colWidths=[110 * mm, 50 * mm])]
    pdf.build(story)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="rx-{note_id[:8]}.pdf"'})
