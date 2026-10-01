"""What-changed-since-last-report: lab diff + vitals diff + AI narrative.

Kind-aware: only lab-comparable kinds (CBC, LFT, …) are trended.
Prescriptions / imaging (MRI, X-Ray, ECG…) carry no numeric lab values,
so they are excluded from auto-compare instead of showing a confusing
"no overlapping values" against a lab report.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, resolve_patient_id
from app.db.session import get_db
from app.models.tables import LabResult, Document, Vital, User

router = APIRouter()


def _doc_info(d: Document) -> dict:
    return {"id": d.id, "title": d.title, "visit_date": d.visit_date,
            "doc_type": d.doc_type, "category": getattr(d, "category", None),
            "report_kind": getattr(d, "report_kind", None)}


@router.get("/compare", response_model=dict)
def compare_reports(doc_id: str, against_id: str | None = None, patient_id: str | None = None,
                    same_kind_only: bool = True,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.services.report_kinds import is_comparable_kind, is_prescription_kind
    pid = resolve_patient_id(db, user, patient_id)
    doc = db.query(Document).filter_by(id=doc_id, owner_id=pid).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # Prescriptions / clinical paperwork have no lab values — say so plainly
    # instead of pretending they are reports.
    if is_prescription_kind(getattr(doc, "report_kind", None)) or doc.doc_type == "prescription":
        return {"doc": _doc_info(doc), "previous": None, "changes": [],
                "comparable": False,
                "summary": (f"'{doc.title}' is a prescription/clinical document — "
                            "it has no lab values to trend. Pick two lab reports "
                            "(CBC, LFT, …) to see what changed.")}
    if not is_comparable_kind(getattr(doc, "report_kind", None)):
        # Still allow compare for unlabelled/legacy docs that DO have labs,
        # but warn when the kind is clearly non-numeric (MRI, ECG…).
        has_labs = db.query(LabResult).filter_by(document_id=doc.id).first() is not None
        if not has_labs:
            return {"doc": _doc_info(doc), "previous": None, "changes": [],
                    "comparable": False,
                    "summary": (f"'{doc.title}' ({getattr(doc, 'report_kind', None) or doc.doc_type}) "
                                "is not a lab report — there are no numeric values to compare. "
                                "Pick two lab reports for trends.")}
    # default: previous COMPARABLE document by visit date, preferring the
    # same kind/category so CBC compares against CBC, not against an MRI.
    if against_id:
        prev = db.query(Document).filter_by(id=against_id, owner_id=pid).first()
        if not prev:
            raise HTTPException(status_code=404, detail="Comparison document not found")
    else:
        base = db.query(Document).filter(Document.owner_id == pid, Document.id != doc.id)
        # Prefer same report_kind, then same category, then any comparable kind.
        candidates: list[Document] = []
        if same_kind_only and getattr(doc, "report_kind", None):
            same = (base.filter(Document.report_kind == doc.report_kind)
                    .order_by(Document.visit_date.desc().nullslast()).all())
            candidates.extend(same)
        if getattr(doc, "category", None):
            same_cat = (base.filter(Document.category == doc.category,
                                    Document.report_kind != doc.report_kind)
                        .order_by(Document.visit_date.desc().nullslast()).all())
            candidates.extend([d for d in same_cat if d not in candidates])
        if doc.visit_date:
            older = (base.filter(Document.visit_date < doc.visit_date)
                     .order_by(Document.visit_date.desc().nullslast()).all())
        else:
            older = base.order_by(Document.visit_date.desc().nullslast()).all()
        for d in older:
            if d not in candidates:
                candidates.append(d)
        # First candidate that is actually comparable (has labs or comparable kind)
        prev = None
        for d in candidates:
            if is_comparable_kind(getattr(d, "report_kind", None)):
                prev = d
                break
            if db.query(LabResult).filter_by(document_id=d.id).first():
                prev = d
                break
        if prev is None and candidates:
            prev = candidates[0]
    if not prev:
        return {"doc": _doc_info(doc), "previous": None,
                "changes": [], "comparable": True,
                "summary": "No earlier report to compare with yet."}
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
        summary = (f"No overlapping lab values between '{prev.title}' "
                   f"({getattr(prev, 'report_kind', None) or prev.doc_type}) and '{doc.title}' "
                   f"({getattr(doc, 'report_kind', None) or doc.doc_type}). "
                   "Trends work best between two reports of the same kind (e.g. two CBCs).")
    else:
        summary = (f"Compared '{prev.title}' ({prev.visit_date}) → '{doc.title}' ({doc.visit_date}): "
                   f"{len(changes)} test(s), {improved} improved to normal, {worsened} newly abnormal.")
    return {"doc": _doc_info(doc), "previous": _doc_info(prev),
            "changes": changes, "improved": improved, "worsened": worsened,
            "comparable": True,
            "summary": summary, "vitals_note": vitals_note}


# Tests where an abnormal latest value needs prompt attention. Used only for
# the rule-based urgency fallback + to nudge the AI prompt — never a diagnosis.
URGENT_TESTS = frozenset({
    "glucose_fasting", "glucose_pp", "glucose_random", "hba1c",
    "creatinine", "urea", "potassium", "sodium",
    "systolic", "diastolic", "spo2", "pulse",
    "tsh", "ft4", "hemoglobin", "wbc", "platelets",
})


def _trend_verdict(points: list[dict]) -> dict:
    """Rule-based verdict for one test's date-wise points (oldest → newest)."""
    vals = [p for p in points if p.get("value") is not None]
    if len(vals) < 2:
        flag = vals[-1].get("flag") if vals else None
        return {"trend": "single", "label": "Only one reading",
                "delta": None, "pct": None, "first": vals[0] if vals else None,
                "last": vals[-1] if vals else None, "abnormal_now": flag in ("low", "high")}
    first, last = vals[0], vals[-1]
    delta = round(last["value"] - first["value"], 3)
    pct = round(delta / first["value"] * 100, 1) if first["value"] else None
    fb, fl = first.get("flag"), last.get("flag")
    if fb in ("low", "high") and fl == "normal":
        trend, label = "improved", "Improved to normal ✅"
    elif fb == "normal" and fl in ("low", "high"):
        trend, label = "worsened", f"Newly {fl} ⚠️"
    elif fl in ("low", "high") and fb in ("low", "high"):
        trend, label = ("worsened" if abs(delta) > 0 else "same"), f"Still {fl} ⚠️"
    elif delta == 0:
        trend, label = "same", "Unchanged"
    else:
        # Both normal: movement without leaving range = stable.
        trend, label = "stable", "Stable in range"
    return {"trend": trend, "label": label, "delta": delta, "pct": pct,
            "first": first, "last": last,
            "abnormal_now": fl in ("low", "high")}


def _fallback_explanation(verdicts: list[dict], n_docs: int) -> tuple[str, str, list[str]]:
    """Offline explanation when Ollama/Gemini is unreachable.

    Returns (overall_status, urgency, guidelines)."""
    improved = sum(1 for v in verdicts if v["verdict"]["trend"] == "improved")
    worsened = sum(1 for v in verdicts if v["verdict"]["trend"] == "worsened")
    abnormal = [v for v in verdicts if v["verdict"].get("abnormal_now")]
    urgent_hits = [v for v in abnormal if v["key"] in URGENT_TESTS]
    if urgent_hits and worsened:
        status, urgency = "worsening", "urgent"
    elif abnormal and worsened:
        status, urgency = "worsening", "watch"
    elif abnormal:
        status, urgency = "needs attention", "watch"
    elif improved and not worsened:
        status, urgency = "improved", "stable"
    elif worsened:
        status, urgency = "mixed", "watch"
    else:
        status, urgency = "stable", "stable"
    lines = [
        f"Compared {n_docs} report(s) across {len(verdicts)} test(s): "
        f"{improved} improved to normal, {worsened} newly/still abnormal.",
    ]
    for v in verdicts[:12]:
        vd = v["verdict"]
        pts = " → ".join(f"{p['value']}" for p in v["points"][-4:])
        lines.append(f"- {v['display']} ({v.get('unit') or ''}): {pts} — {vd['label']}.")
    if urgency == "urgent":
        lines.append("Some worsened values are on tests that can need prompt care. "
                     "Please contact your doctor soon — same-day if you have symptoms.")
    elif urgency == "watch":
        lines.append("Some values are outside the healthy range. Book a doctor review this week "
                     "and bring all selected reports.")
    else:
        lines.append("Latest values look stable. Keep your routine follow-ups and repeat tests as advised.")
    guidelines = [
        "Bring all selected reports (date-wise) to your next visit — the graphs above show the trend.",
        "Do not start/stop medicines based on this summary — confirm with your doctor.",
        "Repeat the abnormal tests as advised; fasting/sleep/medicines before the test affect results.",
        "Seek urgent care for red-flag symptoms: chest pain, breathlessness, fainting, very high fever, "
        " confusion, severe abdominal pain, or bleeding.",
    ]
    if urgency == "stable":
        guidelines.insert(0, "Maintain diet, activity, sleep and prescribed medicines; re-test on schedule.")
    return status, urgency, guidelines + [""] and guidelines


@router.post("/trends", response_model=dict)
def multi_trends(body: dict, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """Multi-report trends (2+ docs): date-wise graphs + AI explanation.

    Body: {"doc_ids": [...], "patient_id"?: ..., "language"?: "en"}.
    Returns per-test date-wise series, rule-based verdicts, overall
    status/urgency and an AI narrative (Ollama → Gemini → offline fallback).
    Informational only — always advises a doctor review, never a diagnosis.
    """
    from app.services.report_kinds import is_prescription_kind
    doc_ids = body.get("doc_ids") or []
    if not isinstance(doc_ids, list) or len(doc_ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 reports to trend.")
    if len(doc_ids) > 12:
        raise HTTPException(status_code=400, detail="Select up to 12 reports at a time.")
    language = (body.get("language") or "en")[:10]
    pid = resolve_patient_id(db, user, body.get("patient_id"))
    docs = db.query(Document).filter(Document.id.in_(doc_ids), Document.owner_id == pid).all()
    if len(docs) < 2:
        raise HTTPException(status_code=404, detail="Could not find 2 selected reports for this patient.")
    by_id = {d.id: d for d in docs}

    def _when(d: Document) -> str:
        try:
            return d.visit_date.isoformat() if d.visit_date else d.created_at.date().isoformat()
        except Exception:
            return str(d.visit_date or "")

    ordered = sorted(docs, key=lambda d: (_when(d), str(d.created_at)))
    # Prescriptions with no labs add noise — exclude with a visible warning.
    excluded = [{"id": d.id, "title": d.title, "reason": "prescription — no lab values"}
                for d in ordered
                if is_prescription_kind(getattr(d, "report_kind", None)) or d.doc_type == "prescription"]
    lab_docs = [d for d in ordered if d.id not in {e["id"] for e in excluded}]
    if len(lab_docs) < 2:
        return {"docs": [_doc_info(d) for d in ordered], "excluded": excluded,
                "series": [], "verdicts": [], "overall_status": "not comparable",
                "urgency": "stable",
                "ai_text": ("Selected files are prescriptions/clinical documents with no numeric "
                            "lab values. Pick 2+ lab reports (CBC, LFT, thyroid…) for graphs + AI trends."),
                "model_used": "rules", "language": language}
    rows = db.query(LabResult).filter(LabResult.document_id.in_([d.id for d in lab_docs])).all()
    grouped: dict[str, dict] = {}
    for r in rows:
        g = grouped.setdefault(r.test_key, {"key": r.test_key, "display": r.display_name,
                                            "unit": r.unit, "points": []})
        d = by_id.get(r.document_id)
        g["points"].append({"date": (r.measured_at.isoformat() if r.measured_at
                                     else (_when(d) if d else "")),
                            "value": r.value, "flag": r.flag,
                            "doc_id": r.document_id,
                            "doc_title": d.title if d else ""})
    series = []
    for g in grouped.values():
        g["points"].sort(key=lambda p: p["date"] or "")
        verdict = _trend_verdict(g["points"])
        series.append({**g, "verdict": verdict})
    # Most-moving / most-abnormal first so charts open on what matters.
    order = {"worsened": 0, "improved": 1, "same": 2, "stable": 3, "single": 4}
    series.sort(key=lambda s: (order.get(s["verdict"]["trend"], 5),
                               0 if s["verdict"].get("abnormal_now") else 1,
                               s["display"]))
    verdicts = series  # same objects power the verdict badges
    improved = sum(1 for s in series if s["verdict"]["trend"] == "improved")
    worsened = sum(1 for s in series if s["verdict"]["trend"] == "worsened")
    abnormal_now = sum(1 for s in series if s["verdict"].get("abnormal_now"))
    # Rule-based overall status/urgency (AI may refine the wording, not the facts).
    fb_status, fb_urgency, fb_guidelines = _fallback_explanation(series, len(lab_docs))
    # AI narrative over the facts.
    fact_lines = []
    for s in series[:14]:
        vd = s["verdict"]
        pts = ", ".join(f"{p['date']}: {p['value']}{(' '+s['unit']) if s.get('unit') else ''} ({p.get('flag') or '?'})"
                        for p in s["points"][-5:])
        fact_lines.append(f"- {s['display']}: {pts} => {vd['label']}"
                          + (f" (delta {vd['delta']}, {vd['pct']}%)" if vd.get("delta") is not None else ""))
    titles = "; ".join(f"{d.title} ({_when(d)})" for d in lab_docs)
    prompt = (
        "You are MedRec, a careful medical-document assistant. You are NOT diagnosing — "
        "only explaining lab trends across dated reports in plain language.\n"
        f"Reports date-wise: {titles}\n"
        f"Rule-based facts: {improved} improved to normal, {worsened} worsened/newly abnormal, "
        f"{abnormal_now} still abnormal. Overall rule status: {fb_status} / urgency: {fb_urgency}.\n"
        "Per-test date-wise values (oldest to newest):\n" + "\n".join(fact_lines) + "\n\n"
        "Reply in 5 short sections, plain language, no invented values:\n"
        "1) What changed (2-4 sentences, name the moving tests with dates)\n"
        "2) Improved / same / worsened (bullets per test)\n"
        "3) Danger check: say Stable / Watch / Urgent and why; list which abnormal values matter most\n"
        "4) Needs medical attention now? (yes/no + what to do: routine follow-up vs see doctor this week "
        "vs urgent care for red-flag symptoms)\n"
        "5) Guidelines to help (4-6 practical bullets: what to carry, re-test prep, lifestyle, medicines caution)\n"
        "End with: 'Informational only — please review with your doctor.'"
    )
    ai_text, model_used = None, "rules"
    try:
        from app.services.ollama import generate_text, _lang_instruction
        lang_note = _lang_instruction(language)
        ai_text, model_used = generate_text(prompt + lang_note, num_predict=900)
    except Exception:
        ai_text, model_used = None, "rules"
    if not ai_text:
        head = (f"Across {len(lab_docs)} report(s): {improved} test(s) improved to normal, "
                f"{worsened} worsened/newly abnormal, {abnormal_now} still abnormal.\n")
        ai_text = head + "\n".join(
            f"- {s['display']}: " + " → ".join(str(p["value"]) for p in s["points"][-5:])
            + f" — {s['verdict']['label']}." for s in series[:14]
        ) + ("\n\nInformational only — please review with your doctor." if series else
             "\nNo overlapping numeric values across the selected reports.")
        model_used = "offline-rules-fallback"
    return {"docs": [_doc_info(d) for d in ordered], "lab_docs": [_doc_info(d) for d in lab_docs],
            "excluded": excluded, "series": series, "verdicts": verdicts,
            "improved": improved, "worsened": worsened, "abnormal_now": abnormal_now,
            "overall_status": fb_status, "urgency": fb_urgency,
            "guidelines": fb_guidelines, "ai_text": ai_text, "model_used": model_used,
            "language": language}
