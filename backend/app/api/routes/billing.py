"""Billing + payments: invoices, receipts, insurance, revenue dashboards.

- Staff (doctor/receptionist/nurse/admin) create and manage invoices.
- Patients read/download their own invoices + receipts.
- Receipt numbers are unique (R-YYYYMMDD-XXXX); revenue aggregates feed admin dashboards.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, require_staff, is_assigned
from app.db.session import get_db
from app.models.tables import Invoice, User
from app.schemas.schemas import InvoiceIn, InvoiceOut, InvoicePayIn

router = APIRouter()

VALID_STATUS = ("draft", "issued", "paid", "partially_paid", "cancelled", "refunded")

# Bill types shown in the New-invoice dropdown. Keep in sync with Billing.jsx.
BILL_CATEGORIES = ("consultation", "lab", "xray", "mri", "imaging", "pharmacy",
                   "procedure", "room", "vaccination", "other")


def _names(db: Session, ids: set[str]) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: u for u in db.query(User).filter(User.id.in_(list(ids))).all()}


def _out(db: Session, inv: Invoice) -> dict:
    users = _names(db, {inv.patient_id, inv.doctor_id})
    pat = users.get(inv.patient_id)
    doc = users.get(inv.doctor_id) if inv.doctor_id else None
    balance = max(0.0, float(inv.amount or 0.0) - float(inv.paid_amount or 0.0))
    return {
        "id": inv.id, "patient_id": inv.patient_id,
        "patient_name": pat.full_name if pat else None,
        "doctor_id": inv.doctor_id, "doctor_name": doc.full_name if doc else None,
        "appointment_id": inv.appointment_id, "receipt_no": inv.receipt_no,
        "category": getattr(inv, "category", None) or "other",
        "amount": inv.amount, "currency": inv.currency or "INR", "items": inv.items,
        "status": inv.status, "payment_mode": inv.payment_mode,
        "paid_amount": inv.paid_amount or 0.0, "balance": round(balance, 2),
        "upi_ref": getattr(inv, "upi_ref", None),
        "insurance_provider": inv.insurance_provider,
        "insurance_policy_no": inv.insurance_policy_no,
        "insurance_claim_amount": inv.insurance_claim_amount,
        "referred_by": getattr(inv, "referred_by", None),
        "notes": inv.notes, "issued_at": inv.issued_at, "paid_at": inv.paid_at,
        "created_at": inv.created_at,
    }


def _check_invoice_access(db: Session, user: User, inv: Invoice) -> None:
    if user.role in ("admin", "receptionist", "nurse"):
        return
    if user.role == "patient" and inv.patient_id == user.id:
        return
    if user.role == "doctor" and inv.doctor_id == user.id:
        return
    if user.role == "doctor" and is_assigned(db, user.id, inv.patient_id):
        return
    raise HTTPException(status_code=403, detail="Not yours")


def _receipt_no(db: Session) -> str:
    import secrets
    base = datetime.utcnow().strftime("R-%Y%m%d")
    for _ in range(5):
        cand = f"{base}-{secrets.token_hex(2).upper()}"
        if not db.query(Invoice).filter_by(receipt_no=cand).first():
            return cand
    return f"{base}-{secrets.token_hex(3).upper()}"


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
def create_invoice(data: InvoiceIn, db: Session = Depends(get_db),
                   user: User = Depends(require_staff)):
    pat = db.query(User).filter_by(id=data.patient_id, role="patient").first()
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role == "doctor" and not is_assigned(db, user.id, data.patient_id):
        raise HTTPException(status_code=403, detail="Patient not assigned to you")
    if data.doctor_id:
        doc = db.query(User).filter_by(id=data.doctor_id, role="doctor").first()
        if not doc:
            raise HTTPException(status_code=404, detail="Doctor not found")
    category = (data.category or "other").strip().lower()
    if category not in BILL_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid bill type — pick one of: {', '.join(BILL_CATEGORIES)}")
    items = [i.model_dump() for i in data.items] if data.items else None
    amount = data.amount
    if amount is None:
        amount = round(sum((i.get("qty", 1) or 1) * float(i.get("rate", 0) or 0)
                           for i in (items or [])), 2)
    if amount is None:
        amount = 0.0
    inv = Invoice(
        patient_id=data.patient_id, doctor_id=data.doctor_id,
        appointment_id=data.appointment_id, created_by=user.id,
        receipt_no=_receipt_no(db), category=category,
        amount=float(amount), currency=data.currency or "INR",
        items=items, status=data.status if data.status in VALID_STATUS else "issued",
        payment_mode=data.payment_mode, paid_amount=float(data.paid_amount or 0.0),
        insurance_provider=data.insurance_provider,
        insurance_policy_no=data.insurance_policy_no,
        insurance_claim_amount=data.insurance_claim_amount,
        referred_by=(data.referred_by.strip() or None) if data.referred_by else None,
        notes=data.notes, issued_at=datetime.utcnow(),
        paid_at=datetime.utcnow() if data.status == "paid" else None,
    )
    if inv.paid_amount >= inv.amount and inv.amount > 0:
        inv.status = "paid"
        inv.paid_at = inv.paid_at or datetime.utcnow()
    db.add(inv)
    db.commit()
    db.refresh(inv)
    try:
        from app.models.tables import AuditLog
        from app.services.notify import notify
        db.add(AuditLog(actor_id=user.id, action="invoice_create", patient_id=data.patient_id,
                        detail=f"{inv.receipt_no} Rs.{inv.amount}"))
        db.commit()
        notify(db, data.patient_id, "invoice", f"New bill {inv.receipt_no}: Rs.{inv.amount}",
               f"{(data.notes or '')[:200]}", link="/patient")
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return _out(db, inv)


@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(patient_id: str | None = None, status: str | None = None,
                  q: str | None = None, category: str | None = None,
                  limit: int = 100, offset: int = 0,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        limit = max(1, min(int(limit), settings.MAX_PAGE_SIZE))
    except Exception:
        limit = 100
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    # Staff name search (so the desk never needs a raw UUID): match patient
    # name / email / health ID, then filter to those patients.
    name_pids: list[str] | None = None
    if q and user.role != "patient":
        from app.models.tables import DoctorPatientAssignment
        needle = (q or "").strip()
        like = f"%{needle}%"
        pquery = db.query(User).filter(
            User.role == "patient",
            or_(User.full_name.ilike(like), User.email.ilike(like),
                User.health_id == needle.upper().replace(" ", "")))
        if user.role == "doctor":
            allowed = {l.patient_id for l in
                       db.query(DoctorPatientAssignment).filter_by(doctor_id=user.id).all()}
            if not allowed:
                return []
            pquery = pquery.filter(User.id.in_(list(allowed)))
        name_pids = [u.id for u in pquery.limit(50).all()]
        if not name_pids:
            return []
    q = db.query(Invoice)
    if user.role == "patient":
        q = q.filter_by(patient_id=user.id)
    elif user.role == "doctor":
        if patient_id:
            if not is_assigned(db, user.id, patient_id):
                raise HTTPException(status_code=403, detail="Patient not assigned to you")
            q = q.filter_by(patient_id=patient_id)
        else:
            q = q.filter_by(doctor_id=user.id)
    else:  # receptionist / nurse / admin
        if patient_id:
            q = q.filter_by(patient_id=patient_id)
    if name_pids is not None:
        q = q.filter(Invoice.patient_id.in_(name_pids))
    if category:
        if category not in BILL_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid bill type")
        q = q.filter(Invoice.category == category)
    if status:
        if status not in VALID_STATUS:
            raise HTTPException(status_code=400, detail="Invalid status")
        q = q.filter_by(status=status)
    rows = q.order_by(Invoice.created_at.desc()).limit(limit).offset(offset).all()
    return [_out(db, r) for r in rows]


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_invoice_access(db, user, inv)
    return _out(db, inv)


@router.post("/invoices/{invoice_id}/pay", response_model=InvoiceOut)
def pay_invoice(invoice_id: str, data: InvoicePayIn, db: Session = Depends(get_db),
                user: User = Depends(require_staff)):
    inv = db.query(Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    if inv.status in ("cancelled", "refunded"):
        raise HTTPException(status_code=400, detail=f"Cannot pay a {inv.status} invoice")
    inv.paid_amount = float(inv.paid_amount or 0.0) + float(data.paid_amount or 0.0)
    inv.payment_mode = data.payment_mode
    if data.payment_mode == "upi" and getattr(data, "upi_ref", None):
        try:
            inv.upi_ref = data.upi_ref.strip() or None
        except Exception:
            pass
    if inv.paid_amount >= float(inv.amount or 0.0) and float(inv.amount or 0.0) > 0:
        inv.status = "paid"
        inv.paid_at = datetime.utcnow()
    elif inv.paid_amount > 0:
        inv.status = "partially_paid"
    db.commit()
    db.refresh(inv)
    try:
        from app.models.tables import AuditLog
        from app.services.notify import notify
        db.add(AuditLog(actor_id=user.id, action="invoice_pay", patient_id=inv.patient_id,
                        detail=f"{inv.receipt_no} +Rs.{data.paid_amount} via {data.payment_mode}"))
        db.commit()
        notify(db, inv.patient_id, "payment",
               f"Payment received: Rs.{data.paid_amount} for {inv.receipt_no}",
               f"Balance Rs.{max(0.0, float(inv.amount or 0) - float(inv.paid_amount or 0)):.2f}",
               link="/patient")
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return _out(db, inv)


@router.post("/invoices/{invoice_id}/cancel", response_model=InvoiceOut)
def cancel_invoice(invoice_id: str, db: Session = Depends(get_db),
                   user: User = Depends(require_staff)):
    inv = db.query(Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    inv.status = "cancelled"
    db.commit()
    db.refresh(inv)
    return _out(db, inv)


@router.get("/upi", response_model=dict)
def upi_info(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Clinic UPI ID for the pay-by-UPI flow (set CLINIC_UPI_ID in backend/.env)."""
    vpa = (settings.CLINIC_UPI_ID or "").strip()
    return {"configured": bool(vpa), "vpa": vpa or None,
            "note": "Pay to this UPI ID, then submit the UTR/ref on the invoice." if vpa
                    else "UPI payments are not configured by the clinic yet — pay at the desk."}


@router.post("/invoices/{invoice_id}/upi-ref", response_model=InvoiceOut)
def submit_upi_ref(invoice_id: str, upi_ref: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Patient submits their UPI payment reference (UTR) after paying to the
    clinic VPA. Staff verifies the credit and marks the invoice paid."""
    inv = db.query(Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_invoice_access(db, user, inv)
    if inv.status in ("cancelled", "refunded", "paid"):
        raise HTTPException(status_code=400, detail=f"Invoice is {inv.status}")
    ref = (upi_ref or "").strip()
    if len(ref) < 4:
        raise HTTPException(status_code=400, detail="Enter the UPI reference / UTR number")
    try:
        inv.upi_ref = ref[:100]
        inv.payment_mode = "upi"
    except Exception:
        pass
    db.commit()
    db.refresh(inv)
    try:
        from app.services.notify import notify as _notify
        staff_note = f"UPI ref {ref} submitted for {inv.receipt_no} (Rs.{inv.amount}) — please verify and mark paid."
        for role in ("receptionist", "admin"):
            for u in db.query(User).filter_by(role=role).limit(10).all():
                _notify(db, u.id, "upi_verify", "UPI payment needs verification", staff_note, link="/billing")
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return _out(db, inv)


_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
         "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
         "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
        "Eighty", "Ninety"]


def _two_digits(n: int) -> str:
    if n < 20:
        return _ONES[n]
    t, o = divmod(n, 10)
    return _TENS[t] + ((" " + _ONES[o]) if o else "")


def _three_digits(n: int) -> str:
    h, r = divmod(n, 100)
    s = (_ONES[h] + " Hundred") if h else ""
    if r:
        s += ((" " if s else "") + _two_digits(r))
    return s


def _in_words_num(n: int) -> str:
    """Integer → words using the Indian grouping (crore / lakh / thousand)."""
    if n == 0:
        return "Zero"
    parts = []
    crore, n = divmod(n, 10_000_000)
    if crore:
        parts.append(_in_words_num(crore) + " Crore")
    lakh, n = divmod(n, 100_000)
    if lakh:
        parts.append(_two_digits(lakh) + " Lakh")
    thou, n = divmod(n, 1000)
    if thou:
        parts.append(_two_digits(thou) + " Thousand")
    if n:
        parts.append(_three_digits(n))
    return " ".join(parts)


def _in_words_rupees(amount) -> str:
    try:
        total = round(float(amount or 0), 2)
    except Exception:
        total = 0.0
    rupees = int(total)
    paise = int(round((total - rupees) * 100))
    if paise == 100:
        rupees += 1
        paise = 0
    s = f"Rupees {_in_words_num(rupees)}"
    if paise:
        s += f" and Paise {_in_words_num(paise)}"
    return s + " Only"


@router.get("/invoices/{invoice_id}/receipt")
def invoice_receipt(invoice_id: str, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Detailed printable receipt PDF: letterhead, billed-to / receipt-details
    blocks, itemised table, totals + amount in words, insurance, notes."""
    from io import BytesIO
    from xml.sax.saxutils import escape as _xe
    inv = db.query(Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_invoice_access(db, user, inv)
    pat = db.query(User).filter_by(id=inv.patient_id).first()
    doc = db.query(User).filter_by(id=inv.doctor_id).first() if inv.doctor_id else None
    pprof = getattr(pat, "patient_profile", None) if pat else None
    dprof = getattr(doc, "doctor_profile", None) if doc else None
    appt = None
    if inv.appointment_id:
        try:
            from app.models.tables import Appointment
            appt = db.query(Appointment).filter_by(id=inv.appointment_id).first()
        except Exception:
            appt = None

    # ---- Billed-by (letterhead) ----
    doc_name = ("Dr. " + doc.full_name) if doc else "MedRec Clinic"
    d_credentials = " · ".join(x for x in [
        getattr(dprof, "qualification", None),
        getattr(dprof, "specialization", None)] if x)
    d_addr = " ".join(x for x in [
        getattr(dprof, "hospital", None),
        getattr(dprof, "clinic_address", None)] if x)
    d_phone = (getattr(dprof, "phone", None) or (doc.phone if doc else None))
    d_reg = (getattr(dprof, "license_no", None)
             or getattr(dprof, "registration_council", None))

    # ---- Billed-to (patient) ----
    p_phone = (getattr(pprof, "phone", None) or (pat.phone if pat else None))
    p_addr = getattr(pprof, "address", None)
    p_hid = pat.health_id if pat else None

    # ---- Amounts ----
    total = float(inv.amount or 0)
    paid = float(inv.paid_amount or 0)
    balance = max(0.0, total - paid)
    issued = inv.issued_at.date() if inv.issued_at else inv.created_at.date()
    paid_on = inv.paid_at.date() if inv.paid_at else None
    cat_title = ((getattr(inv, "category", None) or "other")
                 .replace("_", " ").title())

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    small = styles["Normal"].__class__("rcpt-small", parent=styles["Normal"])
    small.fontSize = 9
    small.leading = 12
    right_small = styles["Normal"].__class__("rcpt-right", parent=small)
    right_small.alignment = 2  # right

    TEAL = colors.HexColor("#0e9384")
    story = [
        Paragraph(f"<b>{_xe(doc_name)}</b>"
                  f"{(' — ' + _xe(d_addr)) if d_addr else ''}", styles["Title"]),
    ]
    doc_sub = " · ".join(x for x in [
        d_credentials or "", f"Reg: {d_reg}" if d_reg else "",
        f"Ph: {d_phone}" if d_phone else ""] if x)
    if doc_sub:
        story.append(Paragraph(f"<font color=\"#475569\">{_xe(doc_sub)}</font>", small))
    story += [Spacer(1, 4),
              Paragraph(f"<b><font color=\"#0e9384\" size=\"13\">PAYMENT RECEIPT</font></b>", styles["Normal"]),
              HRFlowable(width="100%", thickness=1), Spacer(1, 6)]

    # ---- Billed-to vs receipt-details ----
    billed_to = [f"<b>BILLED TO</b>",
                 f"<b>{_xe(pat.full_name) if pat else '—'}</b>"]
    if p_hid:
        billed_to.append(f"Health ID: {_xe(p_hid)}")
    if pat and pat.email:
        billed_to.append(f"Email: {_xe(pat.email)}")
    if p_phone:
        billed_to.append(f"Phone: {_xe(p_phone)}")
    if p_addr:
        billed_to.append(f"Address: {_xe(p_addr)}")
    details = [f"<b>RECEIPT DETAILS</b>",
               f"Receipt No: <b>{_xe(inv.receipt_no or inv.id[:8])}</b>",
               f"Issued: {issued}",
               f"Bill type: <b>{_xe(cat_title)}</b>",
               f"Status: {_xe(inv.status or 'issued')}"]
    if appt is not None:
        try:
            details.append(f"Visit: {appt.date} · {appt.start_time.strftime('%H:%M')}"
                           + (f" (Token {appt.token_no})" if appt.token_no else ""))
        except Exception:
            pass
    details.append(f"Mode: {_xe((inv.payment_mode or '—').upper())}")
    if inv.upi_ref:
        details.append(f"UPI Ref / UTR: <b>{_xe(inv.upi_ref)}</b>")
    if getattr(inv, "referred_by", None):
        details.append(f"Referred by: {_xe(inv.referred_by)}")
    if paid_on:
        details.append(f"Paid on: {paid_on}")
    info_tbl = Table([[Paragraph("<br/>".join(billed_to), small),
                       Paragraph("<br/>".join(details), small)]],
                     colWidths=[100 * mm, 80 * mm])
    info_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story += [info_tbl, Spacer(1, 8)]

    # ---- Items ----
    rows = [["Item", "Qty", "Rate", "Amount"]]
    items = list(inv.items or [])
    if not items:
        # No line items stored — show the billed head so the table is meaningful.
        items = [{"label": cat_title, "qty": 1, "rate": total}]
    for it in items:
        qty = it.get("qty", 1) or 1
        rate = float(it.get("rate", 0) or 0)
        rows.append([_xe(str(it.get("label", ""))), str(qty),
                     f"Rs.{rate:.2f}", f"Rs.{float(qty) * rate:.2f}"])
    tbl = Table(rows, colWidths=[80 * mm, 20 * mm, 30 * mm, 30 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f8fafc")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 6))

    # ---- Totals + amount in words ----
    totals = Table([[f"Total: Rs.{total:.2f}"],
                    [f"Paid: Rs.{paid:.2f}"],
                    [f"<b>Balance: Rs.{balance:.2f}</b>"]],
                   colWidths=[60 * mm])
    totals.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    totals.hAlign = "RIGHT"
    story.append(totals)
    story.append(Paragraph(
        f"<i>Amount in words: {_xe(_in_words_rupees(total))}</i>", small))
    story.append(Spacer(1, 6))

    if inv.insurance_provider:
        story.append(Paragraph(
            f"Insurance: {_xe(inv.insurance_provider)} · "
            f"Policy {_xe(inv.insurance_policy_no or '—')} · "
            f"Claim Rs.{float(inv.insurance_claim_amount or 0):.2f}",
            styles["Normal"]))
    if inv.notes:
        story.append(Paragraph(f"<b>Notes:</b> {_xe(inv.notes)}", small))
        story.append(Spacer(1, 4))
    generated = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    story += [Spacer(1, 18),
              Table([[Paragraph(
                  f"<i>Computer-generated receipt via MedRec · {generated}</i>",
                  small),
                  Paragraph("_________________________"
                            "<br/>Authorised Signatory", right_small)]],
                  colWidths=[110 * mm, 50 * mm])]
    pdf.build(story)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{inv.receipt_no or inv.id[:8]}.pdf"'})


@router.get("/revenue/summary")
def revenue_summary(db: Session = Depends(get_db), user: User = Depends(require_staff)):
    """Revenue + collection stats for dashboards (admin sees all, doctors see own)."""
    q = db.query(Invoice)
    if user.role == "doctor":
        q = q.filter_by(doctor_id=user.id)
    rows = q.all()
    collected = sum(float(r.paid_amount or 0) for r in rows
                    if r.status in ("paid", "partially_paid"))
    pending = sum(max(0.0, float(r.amount or 0) - float(r.paid_amount or 0)) for r in rows
                  if r.status in ("issued", "partially_paid"))
    from collections import Counter
    by_mode = Counter((r.payment_mode or "unknown") for r in rows if (r.paid_amount or 0) > 0)
    by_status = Counter(r.status for r in rows)
    return {"invoices": len(rows), "revenue_collected": round(collected, 2),
            "fees_pending": round(pending, 2),
            "by_mode": dict(by_mode), "by_status": dict(by_status)}
