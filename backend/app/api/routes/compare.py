"""What-changed-since-last-report: lab diff + vitals diff + AI narrative."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import LabResult, Document, Vital, User

router = APIRouter()


@router.get("/compare", response_model=dict)
def compare_reports(doc_id: str, against_id: str | None = None, patient_id: str | None = None,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pid = resolve_patient_id(db, user, patient_id)
    doc = db.query(Document).filter_by(id=doc_id, owner_id=pid).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # default: previous document by visit date
    if against_id:
        prev = db.query(Document).filter_by(id=against_id, owner_id=pid).first()
        if not prev:
            raise HTTPException(status_code=404, detail="Comparison document not found")
    else:
        q = db.query(Document).filter_by(owner_id=pid)
        if doc.visit_date:
            q = q.filter(Document.visit_date < doc.visit_date)
        prev = q.order_by(Document.visit_date.desc().nullslast()).first()
        if not prev:
            # fallback: any other doc
            prev = db.query(Document).filter(Document.owner_id == pid, Document.id != doc.id).order_by(
                Document.visit_date.desc().nullslast()).first()
    if not prev:
        return {"doc": {"id": doc.id, "title": doc.title}, "previous": None,
                "changes": [], "summary": "No earlier report to compare with yet."}
    cur_labs = {r.test_key: r for r in db.query(LabResult).filter_by(document_id=doc.id).all()}
    prev_labs = {r.test_key: r for r in db.query(LabResult).filter_by(document_id=prev.id).all()}
    changes = []
    for key in sorted(set(cur_labs) | set(prev_labs)):
        c, p = cur_labs.get(key), prev_labs.get(key)
        if c and p and c.value is not None and p.value is not None:
            delta = round(c.value - p.value, 3)
            pct = round((delta / p.value * 100), 1) if p.value else None
            direction = "up" if delta > 0 else ("down" if delta < 0 else "same")
            changes.append({"test": c.display_name, "key": key, "unit": c.unit,
                            "before": p.value, "after": c.value, "delta": delta,
                            "pct": pct, "direction": direction,
                            "flag_before": p.flag, "flag_after": c.flag})
        elif c and not p:
            changes.append({"test": c.display_name, "key": key, "unit": c.unit,
                            "before": None, "after": c.value, "delta": None,
                            "direction": "new", "flag_after": c.flag})
        elif p and not c:
            changes.append({"test": p.display_name, "key": key, "unit": p.unit,
                            "before": p.value, "after": None, "delta": None,
                            "direction": "missing", "flag_before": p.flag})
    # vitals movement between the two visit dates
    vitals_note = None
    try:
        vrows = db.query(Vital).filter_by(owner_id=pid).order_by(Vital.measured_at.asc()).all()
        if len(vrows) >= 2:
            first, last = vrows[0], vrows[-1]
            vitals_note = f"Vitals tracked: {len(vrows)} entries from {first.measured_at} to {last.measured_at}."
    except Exception:
        pass
    improved = sum(1 for ch in changes if ch.get("flag_before") in ("low", "high") and ch.get("flag_after") == "normal")
    worsened = sum(1 for ch in changes if ch.get("flag_after") in ("low", "high") and ch.get("flag_before") == "normal")
    if not changes:
        summary = f"No overlapping lab values between '{prev.title}' and '{doc.title}'. Upload structured lab reports for auto-compare."
    else:
        summary = (f"Compared '{prev.title}' ({prev.visit_date}) → '{doc.title}' ({doc.visit_date}): "
                   f"{len(changes)} test(s), {improved} improved to normal, {worsened} newly abnormal.")
    return {"doc": {"id": doc.id, "title": doc.title, "visit_date": doc.visit_date},
            "previous": {"id": prev.id, "title": prev.title, "visit_date": prev.visit_date},
            "changes": changes, "improved": improved, "worsened": worsened,
            "summary": summary, "vitals_note": vitals_note}
