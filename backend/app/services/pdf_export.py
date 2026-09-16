"""Build a full-record PDF (patient info, documents + AI summaries, visits, appointments, alerts)."""
from __future__ import annotations
from datetime import datetime
from io import BytesIO


def build_record_pdf(patient_name: str, patient_email: str, profile: dict,
                     documents: list[dict], visits: list[dict],
                     appointments: list[dict], alerts: list[dict]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    story = [Paragraph(f"MedRec Health Record — {patient_name}", styles["Title"]),
             Paragraph(f"{patient_email} · Exported {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles["Normal"]),
             Spacer(1, 6)]

    info_rows = [[k, str(v or "—")] for k, v in profile.items()]
    if info_rows:
        story += [Paragraph("Patient Information", styles["Heading2"]),
                  _table(info_rows), Spacer(1, 6)]

    story.append(Paragraph(f"Documents ({len(documents)})", styles["Heading2"]))
    for d in documents:
        story.append(Paragraph(f"<b>{d.get('title')}</b> [{d.get('doc_type')}] "
                               f"{d.get('visit_date') or ''} — Dr. {d.get('doctor_name') or '—'}", styles["Normal"]))
        if d.get("summary"):
            story.append(Paragraph(f"<i>AI summary:</i> {d['summary'][:1500]}", styles["Normal"]))
        story.append(Spacer(1, 4))

    story.append(Paragraph(f"Doctor Notes & Prescriptions ({len(visits)})", styles["Heading2"]))
    for v in visits:
        story.append(Paragraph(f"<b>[{v.get('note_type')}] {v.get('title') or ''}</b> — "
                               f"{v.get('doctor_name') or ''} ({v.get('visit_date') or ''})", styles["Normal"]))
        story.append(Paragraph((v.get("content") or "")[:1500], styles["Normal"]))
        for m in v.get("medicines") or []:
            story.append(Paragraph(f"• {m.get('name')} — {m.get('dosage') or ''} "
                                   f"{m.get('frequency') or ''} x {m.get('duration') or ''}", styles["Normal"]))
        story.append(Spacer(1, 4))

    story.append(Paragraph(f"Appointments ({len(appointments)})", styles["Heading2"]))
    for a in appointments:
        story.append(Paragraph(f"{a.get('date')} {a.get('start_time')} — Dr. {a.get('doctor_name') or ''} "
                               f"[{a.get('status')}]", styles["Normal"]))

    story.append(Paragraph(f"Health Alerts ({len(alerts)})", styles["Heading2"]))
    for al in alerts:
        story.append(Paragraph(f"<b>{al.get('test_name')}</b>: {al.get('value')} {al.get('unit') or ''} "
                               f"({al.get('flag')}) — {al.get('message')}", styles["Normal"]))

    story += [Spacer(1, 8), Paragraph(
        "AI summaries are informational only and not a diagnosis. Discuss with your doctor.", styles["Italic"])]
    doc.build(story)
    return buf.getvalue()


def _table(rows: list[list[str]]):
    from reportlab.platypus import Table, TableStyle
    from reportlab.lib import colors

    t = Table(rows, colWidths=[55, 400])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#ffedd5")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t
