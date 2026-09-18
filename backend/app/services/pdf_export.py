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


def build_document_pdf(title: str, meta: dict, file_bytes: bytes,
                       mimetype: str | None, filename: str) -> bytes:
    """Render ANY stored document as a PDF (downloads are PDF-only).

    PDF originals pass through; photos are embedded; text is typeset;
    videos become a cover sheet (watch them with Play inside MedRec).
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                    Image as RLImage, Preformatted)
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from xml.sax.saxutils import escape

    mt = (mimetype or "").lower()
    name = (filename or "").lower()

    if mt == "application/pdf" or name.endswith(".pdf"):
        return file_bytes  # already PDF

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    W, H = A4
    story = [Paragraph(f"MedRec Document — {escape(title or 'Untitled')}", styles["Title"])]

    meta_rows = [[k, str(v or "—")] for k, v in meta.items() if v]
    if meta_rows:
        story += [_table(meta_rows), Spacer(1, 8)]

    try:
        if mt.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp")):
            from PIL import Image as PILImage
            img = PILImage.open(BytesIO(file_bytes)).convert("RGB")
            iw, ih = img.size
            max_w, max_h = W - 30 * mm, H - 80 * mm
            scale = min(max_w / iw, max_h / ih, 1.0)
            img = img.resize((max(1, int(iw * scale)), max(1, int(ih * scale))))
            jpg = BytesIO()
            img.save(jpg, format="JPEG", quality=88)
            jpg.seek(0)
            story.append(RLImage(ImageReader(jpg),
                                 width=img.size[0] * 72 / 150, height=img.size[1] * 72 / 150))
        elif mt.startswith("video/") or name.endswith((".mp4", ".webm", ".mov", ".m4v", ".3gp", ".3g2", ".mkv")):
            story += [Paragraph("🎥 Video attachment", styles["Heading2"]),
                      Paragraph("This document is a video. Videos can't play inside a PDF — "
                                "open it with the <b>Play</b> button in MedRec to watch it. "
                                "Details above identify the clip.", styles["Normal"])]
        else:  # plain text and anything else readable
            text = file_bytes.decode("utf-8", errors="ignore").strip()[:20000] or "(no readable text)"
            story += [Paragraph("Document text", styles["Heading2"]),
                      Preformatted(text, styles["Code"])]
    except Exception:
        story.append(Paragraph("Could not render this file's content — please view the original in MedRec.",
                               styles["Normal"]))

    story += [Spacer(1, 8), Paragraph(
        "Exported from MedRec. AI summaries are informational only — discuss with your doctor.",
        styles["Italic"])]
    doc.build(story)
    return buf.getvalue()
