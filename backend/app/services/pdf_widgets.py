"""Designed building blocks for generated PDFs (e-prescription, receipts).

No new dependencies — pure reportlab platypus + graphics shapes.
"""
from __future__ import annotations


TEAL = "#0e9384"
TEAL_DARK = "#0b6e63"
TEAL_TINT = "#f0fdfa"
INK = "#0f172a"
MUTED = "#64748b"
LINE = "#cbd5e1"
GREEN = "#15803d"
GREEN_TINT = "#bbf7d0"
AMBER = "#b45309"
RED = "#b91c1c"
TRACK = "#e2e8f0"


def _colors():
    from reportlab.lib import colors
    return colors


def title_band(left: str, right: str = ""):
    """Full-width teal band: white bold title + right-aligned meta."""
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    colors = _colors()
    styles = getSampleStyleSheet()
    title_style = styles["Normal"].__class__("band-title", parent=styles["Normal"])
    title_style.fontName = "Helvetica-Bold"
    title_style.fontSize = 13
    title_style.leading = 15
    title_style.textColor = colors.white
    meta_style = styles["Normal"].__class__("band-meta", parent=styles["Normal"])
    meta_style.fontSize = 9
    meta_style.leading = 12
    meta_style.textColor = colors.white
    meta_style.alignment = 2  # right
    tbl = Table([[Paragraph(left, title_style),
                  Paragraph(right, meta_style)]],
                colWidths=[110 * mm, 70 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(TEAL)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("INNERPADDING", (0, 0), (-1, -1), 7),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))
    return tbl


def section_head(text: str):
    """Section heading with a teal accent bar."""
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    colors = _colors()
    styles = getSampleStyleSheet()
    st = styles["Normal"].__class__("sec-head", parent=styles["Normal"])
    st.fontName = "Helvetica-Bold"
    st.fontSize = 11
    st.leading = 14
    st.textColor = colors.HexColor(INK)
    tbl = Table([["", Paragraph(text, st)]], colWidths=[2.5 * mm, 177.5 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(TEAL)),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor(TEAL_TINT)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("INNERPADDING", (0, 0), (-1, -1), 4),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    return tbl


def info_pill(text: str, bg: str = "#eff6ff", border: str = "#bfdbfe"):
    """Single-cell tinted pill for one-line highlights (diagnosis, follow-up)."""
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    colors = _colors()
    styles = getSampleStyleSheet()
    st = styles["Normal"].__class__("pill", parent=styles["Normal"])
    st.fontSize = 9.5
    st.leading = 13
    st.textColor = colors.HexColor(INK)
    tbl = Table([[Paragraph(text, st)]], colWidths=[180 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(border)),
        ("INNERPADDING", (0, 0), (-1, -1), 6),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))
    return tbl


def avatar_drawing(initial: str):
    """Teal circle with the patient's initial (left cell of the patient card)."""
    from reportlab.graphics.shapes import Drawing, Circle, String
    colors = _colors()
    d = Drawing(34, 34)
    d.add(Circle(17, 17, 16, fillColor=colors.HexColor(TEAL),
                 strokeColor=colors.HexColor(TEAL_DARK), strokeWidth=1))
    d.add(String(17, 11.5, (initial or "?")[:1].upper(),
                 fontName="Helvetica-Bold", fontSize=16,
                 fillColor=colors.white, textAnchor="middle"))
    return d


def patient_card(name: str, sub_line: str = "", meta_line: str = ""):
    """Compact patient summary card: avatar + name + one-line demographics."""
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    colors = _colors()
    styles = getSampleStyleSheet()
    name_st = styles["Normal"].__class__("card-name", parent=styles["Normal"])
    name_st.fontName = "Helvetica-Bold"
    name_st.fontSize = 12.5
    name_st.leading = 15
    name_st.textColor = colors.HexColor(INK)
    sub_st = styles["Normal"].__class__("card-sub", parent=styles["Normal"])
    sub_st.fontSize = 9.5
    sub_st.leading = 12.5
    sub_st.textColor = colors.HexColor("#334155")
    lines = [f"<b>{name}</b>"]
    if sub_line:
        lines.append(sub_line)
    if meta_line:
        lines.append(f"<font color=\"#64748b\">{meta_line}</font>")
    tbl = Table([[avatar_drawing(name), Paragraph("<br/>".join(lines), name_st)]],
                colWidths=[16 * mm, 164 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("INNERPADDING", (0, 0), (-1, -1), 7),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    return tbl


def _num(value) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


DARK_RED = "#7f1d1d"


def vitals_chart(vit: dict):
    """Vitals-at-a-glance chart, written for a normal reader.

    - ONE parameter per row (blood-pressure upper/lower are separate rows).
    - Plain-language labels ("Blood pressure", "Blood oxygen", ...).
    - Each bar shows the reading against its healthy range; readings above
      the range get a drawn UP arrow, below the range a DOWN arrow
      (arrow glyphs are drawn as shapes so they print on every reader).
    - Above/below-range values are dark red; normal values are green.

    Returns (drawing, flags) where flags is a list of dicts with
    label / plain / display / status / lo / hi.
    """
    from reportlab.graphics.shapes import Drawing, Rect, Line, String, Polygon
    colors = _colors()

    specs = []
    sys_v = _num(vit.get("bp_sys"))
    dia_v = _num(vit.get("bp_dia"))
    if sys_v is not None:
        specs.append({"label": "Blood pressure", "sub": "upper number (systolic)",
                      "plain": "upper blood pressure", "value": sys_v,
                      "display": f"{int(sys_v)} mmHg",
                      "lo": 90.0, "hi": 120.0, "s_lo": 70.0, "s_hi": 190.0,
                      "unit": "mmHg"})
    if dia_v is not None:
        specs.append({"label": "Blood pressure", "sub": "lower number (diastolic)",
                      "plain": "lower blood pressure", "value": dia_v,
                      "display": f"{int(dia_v)} mmHg",
                      "lo": 60.0, "hi": 80.0, "s_lo": 40.0, "s_hi": 120.0,
                      "unit": "mmHg"})
    pulse = _num(vit.get("pulse"))
    if pulse is not None:
        specs.append({"label": "Pulse", "sub": "beats per minute",
                      "plain": "pulse", "value": pulse,
                      "display": f"{int(pulse)} beats/min",
                      "lo": 60.0, "hi": 100.0, "s_lo": 40.0, "s_hi": 140.0,
                      "unit": "beats/min"})
    spo2 = _num(vit.get("spo2"))
    if spo2 is not None:
        specs.append({"label": "Blood oxygen", "sub": "SpO2",
                      "plain": "blood oxygen", "value": spo2,
                      "display": f"{spo2:g}%",
                      "lo": 95.0, "hi": 100.0, "s_lo": 85.0, "s_hi": 100.0,
                      "unit": "%"})
    temp = _num(vit.get("temp_c"))
    if temp is not None:
        specs.append({"label": "Body temperature", "sub": "celsius",
                      "plain": "body temperature", "value": temp,
                      "display": f"{temp:g} C",
                      "lo": 36.1, "hi": 37.2, "s_lo": 35.0, "s_hi": 40.0,
                      "unit": "C"})

    flags: list[dict] = []
    for s in specs:
        if s["value"] < s["lo"]:
            status = "low"
        elif s["value"] > s["hi"]:
            status = "high"
        else:
            status = "normal"
        flags.append({"label": s["label"], "plain": s["plain"],
                      "display": s["display"], "status": status,
                      "lo": s["lo"], "hi": s["hi"], "unit": s["unit"]})
    weight = _num(vit.get("weight_kg"))
    if weight is not None:
        flags.append({"label": "Weight", "plain": "weight",
                      "display": f"{weight:g} kg", "status": "info",
                      "lo": None, "hi": None, "unit": "kg"})

    width = 500.0
    bar_x, bar_w, val_x = 112.0, 208.0, 326.0
    row_h, bar_h = 34.0, 9.0
    top_pad = 8.0
    n_rows = len(specs) + (1 if weight is not None else 0)
    height = top_pad + row_h * n_rows + 6.0
    d = Drawing(width, height)
    dark_red = colors.HexColor(DARK_RED)
    green = colors.HexColor(GREEN)

    for i, s in enumerate(specs):
        status = flags[i]["status"]
        abnormal = status in ("high", "low")
        marker_color = dark_red if abnormal else green
        yc = height - top_pad - i * row_h - row_h / 2.0

        d.add(String(0, yc + 2, s["label"], fontName="Helvetica-Bold",
                     fontSize=9, fillColor=colors.HexColor(INK)))
        d.add(String(0, yc - 10, s["sub"], fontName="Helvetica",
                     fontSize=7.5, fillColor=colors.HexColor(MUTED)))
        d.add(Rect(bar_x, yc - bar_h / 2.0, bar_w, bar_h,
                   fillColor=colors.HexColor(TRACK),
                   strokeColor=colors.HexColor(TRACK)))
        span = s["s_hi"] - s["s_lo"] or 1.0

        def _x(v: float) -> float:
            v = min(max(v, s["s_lo"]), s["s_hi"])
            return bar_x + (v - s["s_lo"]) / span * bar_w

        d.add(Rect(_x(s["lo"]), yc - bar_h / 2.0,
                   max(2.0, _x(s["hi"]) - _x(s["lo"])), bar_h,
                   fillColor=colors.HexColor(GREEN_TINT),
                   strokeColor=colors.HexColor(GREEN_TINT)))
        mx = _x(s["value"])
        d.add(Line(mx, yc - 8, mx, yc + 8, strokeColor=marker_color,
                   strokeWidth=3))
        if status == "high":
            # Drawn UP arrow (triangle) above the marker.
            d.add(Polygon([mx - 4.5, yc + 9.5, mx + 4.5, yc + 9.5, mx, yc + 16],
                          fillColor=dark_red, strokeColor=dark_red))
            word = "above normal"
        elif status == "low":
            # Drawn DOWN arrow (triangle) below the marker.
            d.add(Polygon([mx - 4.5, yc - 9.5, mx + 4.5, yc - 9.5, mx, yc - 16],
                          fillColor=dark_red, strokeColor=dark_red))
            word = "below normal"
        else:
            word = "normal"
        d.add(String(val_x, yc - 4,
                     f"{s['display']} - {word}",
                     fontName="Helvetica-Bold", fontSize=9,
                     fillColor=marker_color))
    if weight is not None:
        # Weight has no healthy-range bar — show it as a plain value row
        # so the reading is still on the printout.
        yc = height - top_pad - len(specs) * row_h - row_h / 2.0
        d.add(String(0, yc + 2, "Weight", fontName="Helvetica-Bold",
                     fontSize=9, fillColor=colors.HexColor(INK)))
        d.add(String(0, yc - 10, "kilograms", fontName="Helvetica",
                     fontSize=7.5, fillColor=colors.HexColor(MUTED)))
        d.add(String(bar_x, yc - 4, f"{weight:g} kg",
                     fontName="Helvetica-Bold", fontSize=9,
                     fillColor=colors.HexColor(INK)))
    return d, flags


def vitals_flags_line(flags: list[dict]) -> str:
    """Short plain-language summary of the readings (used under the chart)."""
    if not flags:
        return ""
    bad = [f for f in flags if f["status"] in ("high", "low")]
    if not bad:
        n = sum(1 for f in flags if f["status"] != "info")
        if n:
            return ("All readings look normal." if n > 1
                    else "This reading looks normal.")
        return "Weight recorded."
    parts = []
    for f in bad:
        direction = "above" if f["status"] == "high" else "below"
        parts.append(
            f"Your {f['plain']} is {direction} normal "
            f"({f['display']}; healthy {f['lo']:g}-{f['hi']:g} {f['unit']})")
    out = ". ".join(parts) + "."
    if any(f["status"] == "normal" for f in flags):
        out += " Everything else looks normal."
    return out


def strip_markdown(text: str) -> str:
    """Turn AI markdown into plain printable lines (no ** bullets leaking)."""
    import re
    out_lines = []
    for line in (text or "").split("\n"):
        line = line.strip()
        line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        line = re.sub(r"^[\*\-]\s+", "• ", line)
        line = line.replace("**", "").replace("__", "")
        out_lines.append(line)
    return "\n".join(out_lines).strip()


def _shorten(text: str, limit: int = 26) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "..."


def lab_flags_chart(items: list[dict]):
    """Blood-test summary chart: ONE test per row, no explanations.

    Each item: {name, value (float|None), unit, flag (low|high),
    lo (float|None), hi (float|None)}. Readings above range get a drawn
    UP arrow, below range a DOWN arrow; abnormal values are dark red.
    Tests without a known range render as a plain value row.
    Returns a Drawing (or None when items is empty).
    """
    from reportlab.graphics.shapes import Drawing, Rect, Line, String, Polygon
    colors = _colors()
    items = [it for it in (items or []) if it]
    if not items:
        return None

    width = 500.0
    bar_x, bar_w, val_x = 140.0, 160.0, 306.0
    spark_w = 48.0
    row_h, bar_h = 30.0, 9.0
    top_pad = 8.0
    height = top_pad + row_h * len(items) + 6.0
    d = Drawing(width, height)
    dark_red = colors.HexColor(DARK_RED)

    for i, it in enumerate(items):
        yc = height - top_pad - i * row_h - row_h / 2.0
        name = _shorten(it.get("name") or "Test")
        lo, hi = it.get("lo"), it.get("hi")
        try:
            value = float(it.get("value")) if it.get("value") is not None else None
        except (TypeError, ValueError):
            value = None
        unit = (it.get("unit") or "").strip()
        flag = (it.get("flag") or "").lower()
        abnormal = flag in ("low", "high") and value is not None
        color = dark_red if abnormal else colors.HexColor(GREEN)

        d.add(String(0, yc + 2, name, fontName="Helvetica-Bold",
                     fontSize=9, fillColor=colors.HexColor(INK)))
        ranged = (lo is not None and hi is not None and value is not None
                  and hi > lo)
        if ranged:
            d.add(String(0, yc - 10, f"healthy {lo:g}-{hi:g} {unit}".strip(),
                         fontName="Helvetica", fontSize=7.5,
                         fillColor=colors.HexColor(MUTED)))
            span = (hi - lo) * 2.2 or 1.0
            s_lo, s_hi = lo - (span - (hi - lo)) / 2.0, hi + (span - (hi - lo)) / 2.0
            span = s_hi - s_lo or 1.0

            def _x(v: float) -> float:
                v = min(max(v, s_lo), s_hi)
                return bar_x + (v - s_lo) / span * bar_w

            d.add(Rect(bar_x, yc - bar_h / 2.0, bar_w, bar_h,
                       fillColor=colors.HexColor(TRACK),
                       strokeColor=colors.HexColor(TRACK)))
            d.add(Rect(_x(lo), yc - bar_h / 2.0,
                       max(2.0, _x(hi) - _x(lo)), bar_h,
                       fillColor=colors.HexColor(GREEN_TINT),
                       strokeColor=colors.HexColor(GREEN_TINT)))
            mx = _x(value)
            d.add(Line(mx, yc - 8, mx, yc + 8, strokeColor=color,
                       strokeWidth=3))
            if flag == "high":
                d.add(Polygon([mx - 4.5, yc + 9.5, mx + 4.5, yc + 9.5, mx, yc + 16],
                              fillColor=color, strokeColor=color))
            elif flag == "low":
                d.add(Polygon([mx - 4.5, yc - 9.5, mx + 4.5, yc - 9.5, mx, yc - 16],
                              fillColor=color, strokeColor=color))
        if value is None:
            val_txt = (it.get("display") or flag or "—").strip()
        else:
            val_txt = f"{value:g} {unit}".strip() + f" - {flag}"
        tx = val_x
        trend = [t for t in (it.get("trend") or [])]
        if len(trend) >= 2:
            # Mini trend sparkline ahead of the value (improving vs
            # worsening at a glance).
            sp = sparkline(trend, width=spark_w, height=18.0,
                           x=val_x, y=yc - 13)
            if sp is not None:
                for shape in sp.contents:
                    d.add(shape)
                tx = val_x + spark_w + 6
        d.add(String(tx, yc - 4, val_txt,
                     fontName="Helvetica-Bold", fontSize=9,
                     fillColor=color))
    return d


def rx_heading(count: int):
    """Doctor-style medicines heading: teal 'Rx' badge + section title."""
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    colors = _colors()
    styles = getSampleStyleSheet()
    badge_st = styles["Normal"].__class__("rx-badge", parent=styles["Normal"])
    badge_st.fontName = "Helvetica-Bold"
    badge_st.fontSize = 15
    badge_st.leading = 15
    badge_st.textColor = colors.white
    badge_st.alignment = 1  # center
    head_st = styles["Normal"].__class__("rx-head", parent=styles["Normal"])
    head_st.fontName = "Helvetica-Bold"
    head_st.fontSize = 11
    head_st.leading = 14
    head_st.textColor = colors.HexColor(INK)
    tbl = Table([[Paragraph("Rx", badge_st),
                  Paragraph(f"Medicines ({count})", head_st)]],
                colWidths=[14 * mm, 166 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(TEAL)),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor(TEAL_TINT)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("INNERPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (0, 0), 2),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return tbl


def panel_head(text: str):
    """Small category sub-heading used inside sections (panels, groups)."""
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import getSampleStyleSheet
    colors = _colors()
    styles = getSampleStyleSheet()
    st = styles["Normal"].__class__("panel-head", parent=styles["Normal"])
    st.fontName = "Helvetica-Bold"
    st.fontSize = 10
    st.leading = 13
    st.textColor = colors.HexColor("#0b6e63")
    return Paragraph(text, st)


# Clinical panel for each known lab test (display-name match, lowercased).
TEST_PANELS: list[tuple[str, set[str]]] = [
    ("Complete Blood Count (CBC)", {
        "hemoglobin", "wbc", "platelets", "rbc count", "hematocrit (hct)",
        "mcv", "mch", "mchc", "rdw (red cell distribution width)",
        "mpv (mean platelet volume)"}),
    ("Diabetes", {
        "fasting glucose", "post-prandial glucose", "hba1c",
        "random blood sugar"}),
    ("Lipid Profile", {
        "total cholesterol", "ldl cholesterol", "hdl cholesterol",
        "triglycerides"}),
    ("Kidney & Electrolytes", {
        "creatinine", "blood urea", "uric acid", "sodium (na+)",
        "potassium (k+)"}),
    ("Liver Function (LFT)", {
        "total bilirubin", "sgot / ast", "sgpt / alt",
        "alkaline phosphatase (alp)", "serum albumin", "ggt",
        "total protein"}),
    ("Iron Studies", {"ferritin", "serum iron", "tibc"}),
    ("Thyroid", {
        "tsh", "t3 (triiodothyronine)", "t4 (thyroxine)",
        "free t3 (ft3)", "free t4 (ft4)"}),
    ("Blood Pressure & Vitals", {
        "bp systolic", "bp diastolic", "pulse",
        "spo2 (oxygen saturation)", "bmi"}),
    ("Vitamins & Inflammation", {
        "esr", "crp", "vitamin d (25-oh)", "vitamin b12",
        "serum calcium"}),
]


def test_panel(name: str) -> str:
    """Clinical panel for a lab test name ('Other Tests' when unknown)."""
    key = (name or "").strip().lower()
    for panel, members in TEST_PANELS:
        if key in members:
            return panel
    return "Other Tests"


def key_value_card(pairs: list[tuple[str, str]]):
    """Clean label/value card (profile blocks). Wraps safely, no overlap."""
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    colors = _colors()
    styles = getSampleStyleSheet()
    lab_st = styles["Normal"].__class__("kv-lab", parent=styles["Normal"])
    lab_st.fontName = "Helvetica-Bold"
    lab_st.fontSize = 9
    lab_st.leading = 12
    lab_st.textColor = colors.HexColor(INK)
    val_st = styles["Normal"].__class__("kv-val", parent=styles["Normal"])
    val_st.fontSize = 9
    val_st.leading = 12
    val_st.textColor = colors.HexColor("#1e293b")
    data = [[Paragraph(lab, lab_st), Paragraph(val, val_st)]
            for lab, val in pairs]
    tbl = Table(data, colWidths=[44 * mm, 136 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#fef3c7")),
        ("ROWBACKGROUNDS", (1, 0), (1, -1),
         [colors.white, colors.HexColor("#f8fafc")]),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("INNERPADDING", (0, 0), (-1, -1), 5),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))
    return tbl


def qr_drawing(payload: str, size_mm: float = 26.0):
    """Scannable QR code as a flowable (verification, UPI pay links)."""
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib.units import mm
    qr = QrCodeWidget(payload or "-")
    bounds = qr.getBounds()
    w = (bounds[2] - bounds[0]) or 1.0
    h = (bounds[3] - bounds[1]) or 1.0
    size = size_mm * mm
    d = Drawing(size, size,
                transform=[size / w, 0, 0, size / h, 0, 0])
    d.add(qr)
    return d


def sparkline(values: list[float], width: float = 56.0, height: float = 18.0,
              color: str = "#334155", dot: str | None = "#0e9384",
              x: float = 0.0, y: float = 0.0):
    """Tiny trend line for a series of readings (needs 2+ points).

    x/y place the sparkline's bottom-left corner in the parent drawing.
    """
    from reportlab.graphics.shapes import Drawing, Line, Circle
    colors = _colors()
    pts = []
    for v in values or []:
        try:
            pts.append(float(v))
        except (TypeError, ValueError):
            continue
    d = Drawing(width, height)
    if len(pts) < 2:
        return None
    lo, hi = min(pts), max(pts)
    span = (hi - lo) or 1.0
    n = len(pts)
    xy = [(x + i * width / max(n - 1, 1),
           y + 2 + (p - lo) / span * (height - 4)) for i, p in enumerate(pts)]
    line_color = colors.HexColor(color)
    for (x0, y0), (x1, y1) in zip(xy, xy[1:]):
        d.add(Line(x0, y0, x1, y1, strokeColor=line_color, strokeWidth=1.4))
    if dot:
        lx, ly = xy[-1]
        d.add(Circle(lx - 1, ly, 2.2, fillColor=colors.HexColor(dot),
                     strokeColor=colors.HexColor(dot)))
    return d


def digi_stamp_paragraph(signed_by: str, stamp: str):
    """Centered 'digitally signed' trust line for every PDF."""
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import getSampleStyleSheet
    from xml.sax.saxutils import escape
    colors = _colors()
    styles = getSampleStyleSheet()
    st = styles["Normal"].__class__("digi-stamp", parent=styles["Normal"])
    st.fontSize = 8
    st.leading = 10.5
    st.textColor = colors.HexColor("#475569")
    st.alignment = 1  # center
    return Paragraph(
        f"<i>Digitally signed by {escape(signed_by)} · {escape(stamp)} · "
        "MedRec</i>", st)


def styled_table(header: list[str], rows: list[list[str]], col_widths,
                 font_size: float = 9.5):
    """Teal-header table with alternating row tints."""
    from reportlab.platypus import Table, TableStyle
    colors = _colors()
    data = [header] + rows
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(TEAL)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(LINE)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f8fafc")]),
        ("INNERPADDING", (0, 0), (-1, -1), 5),
    ]
    tbl.setStyle(TableStyle(style))
    return tbl
