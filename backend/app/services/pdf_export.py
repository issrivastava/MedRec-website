"""Build a full-record PDF (patient info, documents + AI summaries, visits, appointments, alerts)."""
from __future__ import annotations
from datetime import datetime
from io import BytesIO


def build_record_pdf(patient_name: str, patient_email: str, profile: dict,
                     documents: list[dict], visits: list[dict],
                     appointments: list[dict], alerts: list[dict],
                     trends: dict | None = None) -> bytes:
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, Spacer
    from xml.sax.saxutils import escape
    from app.services.clinic_branding import build_branded_pdf, brand
    from app.services.pdf_widgets import (
        title_band, section_head, panel_head, key_value_card,
        lab_flags_chart, strip_markdown, test_panel, TEST_PANELS,
        info_pill, digi_stamp_paragraph,
    )

    buf = BytesIO()
    b = brand()
    styles = getSampleStyleSheet()
    story = [title_band(f"{b['name']} — Health Record".upper(),
                        escape(patient_email or "")),
             Spacer(1, 6),
              Paragraph(f"<b>{escape(patient_name or '—')}</b> · "
                        f"Exported {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                        styles["Normal"]),
              Spacer(1, 6)]

    # ---- Emergency card: what an ER doctor looks for first ----
    _em_stamp = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    em_bits = []
    for _lab, _key in (("Blood", "Blood group"), ("Allergies", "Allergies"),
                       ("Chronic", "Chronic conditions"),
                       ("Call", "Emergency contact")):
        _val = profile.get(_key)
        if _val not in (None, ""):
            em_bits.append(f"{_lab}: {_val}")
    if em_bits:
        story.append(info_pill(
            "<b>Emergency:</b> " + escape("  •  ".join(em_bits)),
            bg="#fef2f2", border="#fca5a5"))
        story.append(Spacer(1, 6))

    info_rows = [(str(k), str(v if v not in (None, "") else "—"))
                 for k, v in profile.items()]
    if info_rows:
        story += [section_head("Patient Information"), Spacer(1, 4),
                  key_value_card([(escape(k), escape(v))
                                  for k, v in info_rows]),
                  Spacer(1, 6)]

    DOC_GROUPS = [("lab", "Lab Reports"), ("imaging", "Imaging & Scans"),
                  ("cardiology", "Cardiac"),
                  ("prescription", "Prescriptions & Clinical"),
                  ("other", "Other Documents")]
    grouped_docs: dict[str, list[dict]] = {}
    for d in documents:
        cat = (d.get("category") or "other").strip().lower()
        grouped_docs.setdefault(cat if cat in dict(DOC_GROUPS) else "other",
                                []).append(d)
    story += [section_head(f"Documents ({len(documents)})"), Spacer(1, 4)]
    if not documents:
        story.append(Paragraph("No documents stored.", styles["Normal"]))
    for key, label in DOC_GROUPS:
        group = grouped_docs.get(key, [])
        if not group:
            continue
        story += [panel_head(f"{label} ({len(group)})"), Spacer(1, 3)]
        for d in group:
            doc_name = (d.get("doctor_name") or "").strip()
            kind = (d.get("report_kind") or d.get("doc_type") or "").strip()
            story.append(Paragraph(
                f"<b>{escape(d.get('title') or 'Untitled')}</b>"
                f"{f' [{escape(kind)}]' if kind else ''} "
                f"{escape(d.get('visit_date') or '')} — "
                f"{escape('Dr. ' + doc_name) if doc_name else '—'}",
                styles["Normal"]))
            if d.get("summary"):
                clean = strip_markdown(str(d["summary"])[:1500])
                story.append(Paragraph(
                    f"<i>AI summary:</i> {escape(clean)}".replace("\n", "<br/>"),
                    styles["Normal"]))
            story.append(Spacer(1, 4))

    rx_visits = [v for v in visits if (v.get("note_type") or "") == "prescription"]
    note_visits = [v for v in visits if (v.get("note_type") or "") != "prescription"]

    def _visit_block(v: dict) -> list:
        doc_name = (v.get("doctor_name") or "").strip()
        block = [Paragraph(
            f"<b>{escape(v.get('title') or 'Untitled')}</b> — "
            f"{escape('Dr. ' + doc_name) if doc_name else '—'} "
            f"({escape(v.get('visit_date') or '')})", styles["Normal"]),
            Paragraph(escape((v.get("content") or "")[:1500]),
                      styles["Normal"])]
        for m in v.get("medicines") or []:
            block.append(Paragraph(
                f"• {escape(m.get('name') or '')} — "
                f"{escape(m.get('dosage') or '')} "
                f"{escape(m.get('frequency') or '')} x "
                f"{escape(m.get('duration') or '')}", styles["Normal"]))
        block.append(Spacer(1, 4))
        return block

    story += [section_head(f"E-Prescriptions ({len(rx_visits)})"), Spacer(1, 4)]
    if not rx_visits:
        story.append(Paragraph("No e-prescriptions recorded.", styles["Normal"]))
    for v in rx_visits:
        story.extend(_visit_block(v))
    story += [section_head(f"Visit Notes ({len(note_visits)})"), Spacer(1, 4)]
    if not note_visits:
        story.append(Paragraph("No visit notes recorded.", styles["Normal"]))
    for v in note_visits:
        story.extend(_visit_block(v))

    story += [section_head(f"Appointments ({len(appointments)})"), Spacer(1, 4)]
    for a in appointments:
        doc_name = (a.get("doctor_name") or "").strip()
        story.append(Paragraph(
            f"{escape(a.get('date') or '')} {escape(a.get('start_time') or '')} — "
            f"{escape('Dr. ' + doc_name) if doc_name else '—'} "
            f"[{escape(a.get('status') or '')}]", styles["Normal"]))

    # ---- Blood tests grouped by clinical panel: compact one-row-per-test
    # charts, arrows for above/below — no repeated explanations ----
    lab_items = _latest_lab_items(alerts, trends)
    story += [section_head(f"Blood Tests Flagged ({len(lab_items)})"),
              Spacer(1, 4)]
    if not lab_items:
        story.append(Paragraph("No flagged blood tests.", styles["Normal"]))
    panel_order = [p for p, _ in TEST_PANELS] + ["Other Tests"]
    by_panel: dict[str, list[dict]] = {}
    for it in lab_items:
        by_panel.setdefault(test_panel(it["name"]), []).append(it)
    for panel in panel_order:
        group = by_panel.get(panel, [])
        if not group:
            continue
        story += [panel_head(f"{panel} ({len(group)})"), Spacer(1, 3)]
        chart = lab_flags_chart(group)
        if chart is not None:
            story.append(chart)
            story.append(Spacer(1, 4))
    story.append(Paragraph(
        "<i>Dark values need attention — arrow up means above the healthy "
        "range, arrow down means below. Discuss with your doctor.</i>",
        styles["Normal"]))

    story += [Spacer(1, 8), Paragraph(
        "AI summaries are informational only and not a diagnosis. Discuss with your doctor.", styles["Italic"]),
        Spacer(1, 4),
        digi_stamp_paragraph(b["name"], _em_stamp)]
    build_branded_pdf(buf, story, b["name"],
                      "Health record export"
                      + (f" · {patient_email}" if patient_email else ""))
    return buf.getvalue()


def _latest_lab_items(alerts: list[dict],
                      trends: dict | None = None) -> list[dict]:
    """Dedupe alerts to the latest reading per test + resolve healthy ranges.

    Range priority: the range printed in the alert message (the range in
    force when flagged) > the current lab reference table. `trends` maps
    lowercased display names to recent reading series for sparklines.
    """
    import re
    latest: dict[str, dict] = {}
    for al in alerts or []:
        name = str(al.get("test_name") or "").strip()
        if not name:
            continue
        key = name.lower()
        stamp = str(al.get("created_at") or "")
        prev = latest.get(key)
        if prev is None or stamp >= str(prev.get("created_at") or ""):
            latest[key] = al
    try:
        from app.services.labranges import DEFAULTS
    except Exception:
        DEFAULTS = []
    ref_by_name = {str(r.get("display_name") or "").strip().lower(): r
                   for r in DEFAULTS}
    items = []
    for al in latest.values():
        name = str(al.get("test_name") or "").strip()
        try:
            value = float(al.get("value")) if al.get("value") is not None else None
        except (TypeError, ValueError):
            value = None
        lo = hi = None
        m = re.search(r"healthy range\s*([\d.]+)\s*[–-]\s*([\d.]+)",
                      str(al.get("message") or ""))
        if m:
            try:
                lo, hi = float(m.group(1)), float(m.group(2))
            except ValueError:
                lo = hi = None
        if lo is None or hi is None:
            ref = ref_by_name.get(name.lower())
            if ref:
                try:
                    lo, hi = float(ref["min_value"]), float(ref["max_value"])
                except (TypeError, ValueError, KeyError):
                    lo = hi = None
        trend = (trends or {}).get(name.lower(), [])
        items.append({"name": name, "value": value,
                      "unit": str(al.get("unit") or ""),
                      "flag": str(al.get("flag") or "").lower(),
                      "lo": lo, "hi": hi, "trend": trend})
    items.sort(key=lambda it: it["name"].lower())
    return items


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
    from reportlab.platypus import (Paragraph, Spacer,
                                    Image as RLImage, Preformatted)
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from xml.sax.saxutils import escape

    mt = (mimetype or "").lower()
    name = (filename or "").lower()

    if mt == "application/pdf" or name.endswith(".pdf"):
        return file_bytes  # already PDF

    from datetime import datetime as _dt
    from app.services.clinic_branding import build_branded_pdf, brand
    from app.services.pdf_widgets import (
        title_band, section_head, digi_stamp_paragraph,
    )

    buf = BytesIO()
    styles = getSampleStyleSheet()
    b = brand()
    W, H = A4
    story = [title_band(f"{b['name']} — Document".upper(),
                        escape(title or "Untitled")),
             Spacer(1, 6)]

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
            story += [section_head("Video attachment"), Spacer(1, 4),
                      Paragraph("This document is a video. Videos can't play inside a PDF — "
                                 "open it with the <b>Play</b> button in MedRec to watch it. "
                                 "Details above identify the clip.", styles["Normal"])]
        else:  # plain text and anything else readable
            text = file_bytes.decode("utf-8", errors="ignore").strip()[:20000] or "(no readable text)"
            story += [section_head("Document text"), Spacer(1, 4),
                      Preformatted(text, styles["Code"])]
    except Exception:
        story.append(Paragraph("Could not render this file's content — please view the original in MedRec.",
                               styles["Normal"]))

    story += [Spacer(1, 8), Paragraph(
        "Exported from MedRec. AI summaries are informational only — discuss with your doctor.",
        styles["Italic"]),
        Spacer(1, 4),
        digi_stamp_paragraph(
            b["name"], _dt.now().strftime("%Y-%m-%d %H:%M UTC"))]
    build_branded_pdf(buf, story, b["name"], escape(title or "Untitled"))
    return buf.getvalue()
