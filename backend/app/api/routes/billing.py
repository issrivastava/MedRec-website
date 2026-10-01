"""Billing + payments: invoices, receipts, insurance, revenue dashboards.

- Staff (doctor/receptionist/nurse/admin) create and manage invoices.
- Patients read/download their own invoices + receipts.
- Receipt numbers are unique (R-YYYYMMDD-XXXX); revenue aggregates feed admin dashboards.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, require_staff, is_assigned
from app.db.session import get_db
from app.models.tables import Invoice, User
from app.schemas.schemas import InvoiceIn, InvoiceOut, InvoicePayIn

router = APIRouter()

VALID_STATUS = ("draft", "issued", "paid", "partially_paid", "cancelled", "refunded")


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
        "amount": inv.amount, "currency": inv.currency or "INR", "items": inv.items,
        "status": inv.status, "payment_mode": inv.payment_mode,
        "paid_amount": inv.paid_amount or 0.0, "balance": round(balance, 2),
        "insurance_provider": inv.insurance_provider,
        "insurance_policy_no": inv.insurance_policy_no,
        "insurance_claim_amount": inv.insurance_claim_amount,
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
        receipt_no=_receipt_no(db), amount=float(amount), currency=data.currency or "INR",
        items=items, status=data.status if data.status in VALID_STATUS else "issued",
        payment_mode=data.payment_mode, paid_amount=float(data.paid_amount or 0.0),
        insurance_provider=data.insurance_provider,
        insurance_policy_no=data.insurance_policy_no,
        insurance_claim_amount=data.insurance_claim_amount,
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


@router.get("/invoices/{invoice_id}/receipt")
def invoice_receipt(invoice_id: str, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Printable receipt PDF with clinic letterhead block."""
    from io import BytesIO
    inv = db.query(Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    _check_invoice_access(db, user, inv)
    pat = db.query(User).filter_by(id=inv.patient_id).first()
    doc = db.query(User).filter_by(id=inv.doctor_id).first() if inv.doctor_id else None
    clinic = ""
    try:
        if doc and doc.doctor_profile:
            clinic = f"{doc.doctor_profile.hospital or ''} {doc.doctor_profile.clinic_address or ''}".strip()
    except Exception:
        pass
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    rows = [["Item", "Qty", "Rate", "Amount"]]
    for it in inv.items or []:
        rows.append([str(it.get("label", "")), str(it.get("qty", 1)),
                     f"Rs.{float(it.get('rate', 0) or 0):.2f}",
                     f"Rs.{float(it.get('qty', 1) or 1) * float(it.get('rate', 0) or 0):.2f}"])
    tbl = Table(rows, colWidths=[80 * mm, 20 * mm, 30 * mm, 30 * mm])
    tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
                             ("GRID", (0, 0), (-1, -1), 0.5, colors.grey)]))
    story = [
        Paragraph(f"<b>{('Dr. ' + doc.full_name) if doc else 'MedRec Clinic'}</b>"
                  f"{(' — ' + clinic) if clinic else ''}", styles["Title"]),
        Paragraph(f"Receipt <b>{inv.receipt_no}</b> · {inv.issued_at.date() if inv.issued_at else inv.created_at.date()}", styles["Normal"]),
        HRFlowable(width="100%", thickness=1), Spacer(1, 6),
        Paragraph(f"Patient: <b>{pat.full_name if pat else ''}</b> ({pat.email if pat else ''})", styles["Normal"]),
        Paragraph(f"Amount: <b>Rs.{float(inv.amount or 0):.2f}</b> · Paid: Rs.{float(inv.paid_amount or 0):.2f} "
                  f"· Balance: Rs.{max(0.0, float(inv.amount or 0) - float(inv.paid_amount or 0)):.2f} "
                  f"· Status: {inv.status} · Mode: {inv.payment_mode or '—'}", styles["Normal"]),
    ]
    if inv.insurance_provider:
        story.append(Paragraph(f"Insurance: {inv.insurance_provider} · Policy {inv.insurance_policy_no or '—'} "
                               f"· Claim Rs.{inv.insurance_claim_amount or 0}", styles["Normal"]))
    story += [Spacer(1, 6), tbl, Spacer(1, 12),
              Paragraph("<i>Computer-generated receipt via MedRec.</i>", styles["Italic"])]
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
