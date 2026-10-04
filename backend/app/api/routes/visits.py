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


def _rx_styles():
    """Shared reportlab paragraph styles for prescription PDFs."""
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from types import SimpleNamespace
    styles = getSampleStyleSheet()
    small = styles["Normal"].__class__("rx-small", parent=styles["Normal"])
    small.fontSize = 9
    small.leading = 12
    small.textColor = colors.HexColor("#334155")
    note_style = styles["Normal"].__class__("rx-note", parent=styles["Normal"])
    note_style.fontSize = 8.5
    note_style.leading = 11.5
    note_style.textColor = colors.HexColor("#64748b")
    right_small = styles["Normal"].__class__("rx-right", parent=small)
    right_small.alignment = 2  # right
    return SimpleNamespace(small=small, note_style=note_style,
                           right_small=right_small)


def _rx_facts(db: Session, v: VisitNote) -> dict:
    """Doctor / patient / signature / demographic facts for one note."""
    from datetime import datetime as _dt
    doc = db.query(User).filter_by(id=v.doctor_id).first()
    pat = db.query(User).filter_by(id=v.patient_id).first()
    pprof = getattr(pat, "patient_profile", None) if pat else None
    dprof = getattr(doc, "doctor_profile", None) if doc else None
    try:
        from app.models.tables import RxTemplate
        tpl = db.query(RxTemplate).filter_by(doctor_id=v.doctor_id)\
            .order_by(RxTemplate.created_at.desc()).first()
    except Exception:
        tpl = None
    sig = (tpl.signature_name if tpl and tpl.signature_name
           else (doc.full_name if doc else "Doctor"))

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
    # ---- Clinical history written by the patient (only filled rows) ----
    history: list[tuple[str, str]] = []
    if pprof is not None:
        def _measure(value, unit: str) -> str:
            if value in (None, ""):
                return ""
            try:
                return f"{float(value):g} {unit}"
            except (TypeError, ValueError):
                return str(value).strip()
        hw = " · ".join(x for x in [
            _measure(getattr(pprof, "height_cm", None), "cm"),
            _measure(getattr(pprof, "weight_kg", None), "kg")] if x)
        background = " · ".join(x for x in [
            str(getattr(pprof, "marital_status", None) or ""),
            str(getattr(pprof, "occupation", None) or "")] if x.strip())
        habits = " · ".join(x for x in [
            (f"Smoking: {getattr(pprof, 'smoking_status', None)}"
             if getattr(pprof, "smoking_status", None) else ""),
            (f"Alcohol: {getattr(pprof, 'alcohol_use', None)}"
             if getattr(pprof, "alcohol_use", None) else ""),
            str(getattr(pprof, "diet", None) or ""),
            (f"Activity: {getattr(pprof, 'activity_level', None)}"
             if getattr(pprof, "activity_level", None) else "")] if x.strip())
        for label, value in [
            ("Height / weight", hw),
            ("Background", background),
            ("Habits", habits),
            ("Past illnesses", str(getattr(pprof, "past_illnesses", None) or "")),
            ("Surgeries / hospitalizations",
             str(getattr(pprof, "surgeries", None) or "")),
            ("Current medications",
             str(getattr(pprof, "current_medications", None) or "")),
            ("Immunizations", str(getattr(pprof, "immunizations", None) or "")),
            ("Family history",
             str(getattr(pprof, "family_history_text", None) or "")),
            ("Menstrual / obstetric",
             str(getattr(pprof, "menstrual_history", None) or "")),
            ("Mental health / lifestyle",
             str(getattr(pprof, "mental_health", None) or "")),
        ]:
            if value and value.strip():
                history.append((label, value.strip()))
    # ---- Allergies: structured records first, profile text as fallback ----
    allergy_names: list[str] = []
    try:
        from app.models.tables import AllergyRecord
        _aq = db.query(AllergyRecord).filter_by(owner_id=v.patient_id,
                                                status="active")
        _recs = _aq.all() if hasattr(_aq, "all") else []
        for a in _recs or []:
            label = str(getattr(a, "allergen", "") or "").strip()
            if not label:
                continue
            extra = str(getattr(a, "reaction", "") or "").strip()
            allergy_names.append(f"{label} ({extra})" if extra else label)
    except Exception:
        allergy_names = []
    if not allergy_names:
        prof_allergy = str(getattr(pprof, "allergies", None) or "").strip()
        if prof_allergy:
            allergy_names = [prof_allergy]

    # ---- Prescription identity: human-readable Rx No + 6-month validity ----
    from datetime import timedelta as _td
    visit_dt = v.visit_date or v.created_at.date()
    rx_no = f"RX-{visit_dt.strftime('%Y%m%d')}-{str(v.id)[:6].upper()}"
    try:
        valid_till = (visit_dt + _td(days=180)).isoformat()
    except Exception:
        valid_till = "—"
    return {
        "doc": doc, "pat": pat, "sig": sig,
        "allergies": allergy_names,
        "rx_no": rx_no, "valid_till": valid_till,
        "visit_dt": visit_dt,
        "d_credentials": d_credentials, "d_addr": d_addr,
        "d_phone": d_phone, "d_reg": d_reg,
        "vit": vit, "age": age,
        "sex": vit.get("sex") or getattr(pprof, "gender", None),
        "p_phone": getattr(pprof, "phone", None) or (pat.phone if pat else None),
        "p_hid": pat.health_id if pat else None,
        "history": history,
        "header_title": f"Dr. {doc.full_name}" if doc else "MedRec Clinic",
        "header_sub": " · ".join(x for x in [
            d_credentials or "", f"Reg: {d_reg}" if d_reg else "",
            f"Ph: {d_phone}" if d_phone else "",
            d_addr or ""] if x),
    }


def _rx_section(v: VisitNote, f: dict, st, show_doctor: bool = False) -> list:
    """Designed flowables for one prescription (title band, patient card,
    diagnosis, vitals chart, advice, medicines, signature)."""
    from datetime import datetime as _dt
    from xml.sax.saxutils import escape as _xe
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from app.services.pdf_widgets import (
        title_band, section_head, info_pill, patient_card,
        vitals_chart, vitals_flags_line, styled_table, rx_heading,
        key_value_card, qr_drawing, digi_stamp_paragraph,
    )
    small, note_style, right_small = st.small, st.note_style, st.right_small

    # ---- Designed title band: summary of the visit on one strip ----
    band_right = f"Visit: {f['visit_dt']}"
    if v.follow_up_date:
        band_right += f"  •  Follow-up: {v.follow_up_date}"
    story = [title_band("E-PRESCRIPTION", _xe(band_right)), Spacer(1, 6)]
    if show_doctor and f["doc"] is not None:
        story.append(Paragraph(
            f"Prescribed by <b>Dr. {_xe(f['doc'].full_name)}</b>"
            + (f" · {_xe(f['d_credentials'])}" if f["d_credentials"] else ""),
            note_style))
        story.append(Spacer(1, 4))

    # ---- Patient summary card (identity only — contact details stay
    # in the app, keeping the printout short) ----
    demo = "  •  ".join(x for x in [
        f"Age: {f['age']}" if f["age"] not in (None, "") else "",
        f"Sex: {f['sex']}" if f["sex"] else "",
        f"Health ID: {f['p_hid']}" if f["p_hid"] else ""] if x)
    story.append(patient_card(
        _xe(f["pat"].full_name) if f["pat"] else "—",
        _xe(demo),
        f"Phone: {_xe(f['p_phone'])}" if f["p_phone"] else ""))
    if v.title:
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"<b>{_xe(v.title)}</b>", small))
    story.append(Spacer(1, 6))

    # ---- Allergy safety box (always visible — chemists must see it) ----
    if f.get("allergies"):
        story.append(info_pill(
            "<b>Allergies:</b> "
            + _xe(" • ".join(f["allergies"])[:400]),
            bg="#fef2f2", border="#fca5a5"))
    else:
        story.append(info_pill(
            "<b>Allergies:</b> none recorded — please confirm with the "
            "patient before dispensing",
            bg="#f8fafc", border="#cbd5e1"))
    story.append(Spacer(1, 6))

    # ---- Diagnosis pill (doctor-style "Dx") ----
    if v.diagnosis_code or v.diagnosis_name:
        diag_txt = " ".join(
            x for x in [v.diagnosis_code or "",
                        ("— " + v.diagnosis_name) if v.diagnosis_name else ""]
            if x)
        story.append(info_pill(f"<b>Dx (Diagnosis):</b> {_xe(diag_txt)}"))
        story.append(Spacer(1, 6))

    # ---- Verification row: QR + Rx No + validity ----
    qr_payload = (f"MEDREC-RX:{f['rx_no']}:{v.id}:{f['visit_dt']}")
    rxid_tbl = Table(
        [[qr_drawing(qr_payload, 24.0),
          Paragraph(
              f"Rx No: <b>{_xe(f['rx_no'])}</b><br/>"
              f"Valid till: {_xe(f['valid_till'])} (6 months)<br/>"
              f"<i>Scan to verify these particulars.</i>", small)]],
        colWidths=[28 * mm, 152 * mm])
    rxid_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("INNERPADDING", (0, 0), (-1, -1), 6),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))
    story += [rxid_tbl, Spacer(1, 4)]

    # ---- Follow-up / refill callout ----
    if v.follow_up_date:
        story.append(info_pill(
            f"<b>Review on {_xe(str(v.follow_up_date))}</b> — bring this "
            "prescription. Ask your doctor about refills if medicines run out.",
            bg="#f0fdf4", border="#86efac"))
    else:
        story.append(info_pill(
            "No review scheduled — return if symptoms persist or worsen.",
            bg="#f8fafc", border="#cbd5e1"))
    story.append(Spacer(1, 6))

    # ---- Clinical history written by the patient (filled rows only) ----
    if f.get("history"):
        story.append(section_head("Clinical history (as shared by patient)"))
        story.append(Spacer(1, 4))
        story.append(key_value_card([(f"<b>{_xe(lab)}</b>", _xe(val))
                                     for lab, val in f["history"]]))
        story.append(Spacer(1, 6))

    # ---- Vitals summary chart (bars vs healthy ranges + flags) ----
    chart, flags = vitals_chart(f["vit"])
    if chart is not None or flags:
        story.append(section_head("Vitals at a glance"))
        story.append(Spacer(1, 4))
        if chart is not None:
            story.append(chart)
        summary = vitals_flags_line(flags)
        if summary:
            story.append(Spacer(1, 2))
            story.append(Paragraph(f"<i>{_xe(summary)}</i>", note_style))
        story.append(Spacer(1, 6))

    # ---- Advice / findings ----
    story.append(section_head("Advice / Findings"))
    story.append(Spacer(1, 4))
    story.append(Paragraph((_xe(v.content or "—")).replace(chr(10), "<br/>"), small))
    story.append(Spacer(1, 8))

    # ---- Medicines table (doctor-style Rx badge heading) ----
    meds = list(v.medicines or [])
    if meds:
        story.append(rx_heading(len(meds)))
        story.append(Spacer(1, 4))
        mrows = []
        for i, m in enumerate(meds, 1):
            mrows.append([str(i), _xe(str(m.get("name", ""))),
                          _xe(str(m.get("dosage") or "—")),
                          _xe(str(m.get("frequency") or "—")),
                          _xe(str(m.get("duration") or "—"))])
        story.append(styled_table(
            ["#", "Medicine", "Dosage", "Frequency", "Duration"], mrows,
            [10 * mm, 70 * mm, 35 * mm, 35 * mm, 30 * mm]))
        story.append(Spacer(1, 8))

    generated = _dt.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    sign_tbl = Table(
        [[Paragraph(
            f"<i>Computer-generated via MedRec · {generated}</i><br/>"
            f"<i>Follow your doctor's advice; do not self-medicate.</i>",
            note_style),
          Paragraph(f"Signature: <b>Dr. {_xe(f['sig'])}</b><br/>Date: {f['visit_dt']}<br/>"
                    "Authorised Signatory",
                    right_small)]],
        colWidths=[100 * mm, 60 * mm])
    sign_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (1, 0), (1, 0), 0.7, colors.HexColor("#94a3b8")),
        ("TOPPADDING", (1, 0), (1, 0), 6),
    ]))
    story += [Spacer(1, 6), sign_tbl, Spacer(1, 4),
              digi_stamp_paragraph(f"Dr. {f['sig']}", generated)]
    return story


@router.get("/bulk-pdf")
def bulk_rx_pdf(patient_id: str | None = None,
                family_member_id: str | None = None, limit: int = 50,
                db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    """Download ALL e-prescriptions as one combined PDF (newest first,
    one designed Rx section per prescription with page breaks).

    Patients download their own (optional ?family_member_id= mirrors
    GET /visits/my); doctors pass ?patient_id= for an assigned patient.
    Non-prescription visit notes are excluded."""
    from datetime import datetime as _dt
    from fastapi.responses import Response
    from io import BytesIO
    from reportlab.platypus import PageBreak
    from app.services.clinic_branding import build_branded_pdf, brand
    try:
        limit = max(1, min(int(limit), 50))
    except Exception:
        limit = 50
    if user.role == "patient":
        pid = user.id
    elif user.role == "doctor":
        if not patient_id:
            raise HTTPException(status_code=400, detail="patient_id required")
        if not is_assigned(db, user.id, patient_id):
            raise HTTPException(status_code=403, detail="Patient not assigned to you")
        pid = patient_id
    else:
        raise HTTPException(status_code=403, detail="Patients and doctors only")
    q = (db.query(VisitNote).filter_by(patient_id=pid, note_type="prescription"))
    if family_member_id:
        q = q.filter_by(family_member_id=family_member_id)
    rows = (q.order_by(VisitNote.visit_date.desc().nullslast(),
                       VisitNote.created_at.desc())
            .limit(limit).all())
    if not rows:
        raise HTTPException(status_code=404, detail="No prescriptions found")
    st = _rx_styles()
    story: list = []
    for i, n in enumerate(rows):
        if i:
            story.append(PageBreak())
        story.extend(_rx_section(n, _rx_facts(db, n), st, show_doctor=True))
    buf = BytesIO()
    b = brand()
    build_branded_pdf(buf, story, b["name"],
                      f"Prescriptions compilation · {len(rows)} prescription(s)")
    stamp = _dt.utcnow().strftime("%Y%m%d")
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'attachment; filename="prescriptions-{stamp}.pdf"'})


@router.get("/{note_id}/rx-pdf")
def rx_pdf(note_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Detailed e-prescription PDF: letterhead, patient demographics + vitals,
    diagnosis, advice, medicines table, follow-up, signature block.

    Patients download own; assigned doctor downloads. Signature name comes from
    the doctor's latest RxTemplate.signature_name or their full name."""
    from fastapi.responses import Response
    from io import BytesIO
    from app.services.clinic_branding import build_branded_pdf
    v = db.query(VisitNote).filter_by(id=note_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == "patient" and v.patient_id != user.id:
        raise HTTPException(status_code=403, detail="Not yours")
    if user.role == "doctor" and v.doctor_id != user.id and not is_assigned(db, user.id, v.patient_id):
        raise HTTPException(status_code=403, detail="Not yours")
    f = _rx_facts(db, v)
    buf = BytesIO()
    build_branded_pdf(buf, _rx_section(v, f, _rx_styles()),
                      f["header_title"], f["header_sub"])
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="rx-{note_id[:8]}.pdf"'})
