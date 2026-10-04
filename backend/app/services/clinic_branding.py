"""Shared clinic branding for every generated PDF.

Header (every page): logo + clinic/doctor name (+ qualification/address line).
Footer (every page): support email + working hours + copyright + page number.

Priority: admin-customised values (PUT /api/branding, stored under
UPLOAD_DIR/branding/) > backend/.env
    (CLINIC_NAME, CLINIC_ADDRESS, CLINIC_SUPPORT_EMAIL,
    CLINIC_TIMINGS, CLINIC_LOGO_PATH) > built-in defaults.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

BRANDING_KEYS = ("clinic_name", "clinic_address", "support_email",
                 "timings", "footer_note")
BRANDING_JSON = "branding.json"
BRANDING_LOGO = "clinic-logo.png"
MAX_LOGO_BYTES = 2 * 1024 * 1024


def _branding_dir() -> str:
    """Directory holding branding.json + uploaded logo (created on demand)."""
    from app.core.config import settings
    d = os.path.join(settings.UPLOAD_DIR or "./uploads", "branding")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        pass
    return d


def _branding_json_path() -> str:
    return os.path.join(_branding_dir(), BRANDING_JSON)


def custom_logo_path() -> str:
    return os.path.join(_branding_dir(), BRANDING_LOGO)


def get_custom_branding() -> dict:
    """Admin-customised values ({} when never customised)."""
    try:
        with open(_branding_json_path(), "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return {k: str(data.get(k) or "").strip() for k in BRANDING_KEYS
                if str(data.get(k) or "").strip()} if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_custom_branding(values: dict) -> dict:
    """Persist whitelisted branding values; empty string resets that key."""
    current = get_custom_branding()
    for k in BRANDING_KEYS:
        if k in values:
            v = str(values.get(k) or "").strip()
            if v:
                current[k] = v[:500]
            else:
                current.pop(k, None)
    try:
        with open(_branding_json_path(), "w", encoding="utf-8") as fh:
            json.dump(current, fh, indent=2)
    except OSError:
        pass
    return current


def logo_data_url() -> str | None:
    """Custom logo as a data URL (for the admin preview), if one is set."""
    import base64
    path = custom_logo_path()
    try:
        if os.path.isfile(path) and os.path.getsize(path) > 0:
            with open(path, "rb") as fh:
                raw = fh.read()
            return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
    except (OSError, ValueError):
        pass
    return None


def brand() -> dict:
    """Current clinic brand values (settings + computed copyright)."""
    from app.core.config import settings

    custom = get_custom_branding()
    year = datetime.utcnow().year
    name = (custom.get("clinic_name") or settings.CLINIC_NAME
            or "MedRec Clinic").strip() or "MedRec Clinic"
    return {
        "name": name,
        "address": (custom.get("clinic_address") if "clinic_address" in custom
                    else (settings.CLINIC_ADDRESS or "")).strip(),
        "support_email": (custom.get("support_email") if "support_email" in custom
                          else (settings.CLINIC_SUPPORT_EMAIL or "")).strip(),
        "timings": (custom.get("timings") if "timings" in custom
                    else (settings.CLINIC_TIMINGS or "")).strip(),
        "footer_note": custom.get("footer_note", "").strip(),
        "logo_path": (settings.CLINIC_LOGO_PATH or "").strip(),
        "custom": custom,
        "copyright": f"© {year} {name}. All rights reserved.",
    }


def _logo_file(configured: str) -> str | None:
    """Resolve a usable logo image path, or None for the drawn fallback mark."""
    candidates: list[str] = []
    candidates.append(custom_logo_path())
    if configured:
        candidates.append(configured)
        candidates.append(os.path.join(os.getcwd(), configured))
    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(here, "..", ".."))
    for rel in ("app/static/logo.png", "app/static/logo.jpg",
                "static/logo.png", "assets/logo.png"):
        candidates.append(os.path.join(repo_root, rel))
    for c in candidates:
        try:
            if c and os.path.isfile(c) and os.path.getsize(c) > 0:
                return c
        except OSError:
            continue
    return None


def make_header_footer(header_title: str, header_sub: str = ""):
    """Return an onPage callback drawing the branded header + footer.

    header_title: bold name line (e.g. "Dr. X" or clinic name).
    header_sub: smaller grey line (qualifications / address / phone).
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors

    W, H = A4
    TEAL = colors.HexColor("#0e9384")
    INK = colors.HexColor("#0f172a")
    MUTED = colors.HexColor("#64748b")
    b = brand()
    logo = _logo_file(b["logo_path"])
    support_email = b["support_email"]
    timings = b["timings"]
    copyright_line = b["copyright"]
    footer_note = b["footer_note"]

    def _draw(canvas, doc):
        canvas.saveState()
        try:
            # ---- Header: light teal band + logo + name ----
            try:
                canvas.setFillColor(colors.HexColor("#f0fdfa"))
                canvas.roundRect(10 * mm, H - 28 * mm, W - 20 * mm,
                                 19.5 * mm, 3 * mm, fill=1, stroke=0)
            except Exception:
                pass
            top = H - 12 * mm
            logo_size = 11 * mm
            lx = 15 * mm
            ly = top - logo_size + 2 * mm
            if logo:
                try:
                    canvas.drawImage(logo, lx, ly, width=logo_size,
                                     height=logo_size, preserveAspectRatio=True,
                                     mask="auto")
                except Exception:
                    _draw_mark(canvas, lx, ly, logo_size, TEAL)
            else:
                _draw_mark(canvas, lx, ly, logo_size, TEAL)
            tx = lx + logo_size + 3 * mm
            canvas.setFillColor(INK)
            canvas.setFont("Helvetica-Bold", 13)
            canvas.drawString(tx, top - 2 * mm, header_title[:90])
            # Small clinic-name line under the title keeps the clinic brand
            # visible even on doctor-letterhead PDFs.
            cy = top - 6.5 * mm
            canvas.setFont("Helvetica", 7.5)
            canvas.setFillColor(MUTED)
            if b["name"] and b["name"].lower() not in header_title.lower():
                canvas.drawString(tx, cy, b["name"][:90])
                cy -= 3.5 * mm
            if header_sub:
                canvas.drawString(tx, cy, header_sub[:140])
            # Teal rule under the header.
            canvas.setStrokeColor(TEAL)
            canvas.setLineWidth(1)
            canvas.line(15 * mm, top - 13 * mm, W - 15 * mm, top - 13 * mm)

            # ---- Footer: light band + bold contact/copyright, well clear
            # of the page edge so printers never clip it ----
            fy = 15 * mm
            band_top = fy + (11.5 if footer_note else 8) * mm + 2.5 * mm
            try:
                canvas.setFillColor(colors.HexColor("#f8fafc"))
                canvas.roundRect(10 * mm, 10 * mm, W - 20 * mm,
                                 band_top - 10 * mm, 3 * mm, fill=1, stroke=0)
            except Exception:
                pass
            canvas.setStrokeColor(TEAL)
            canvas.setLineWidth(0.9)
            top_line = fy + (11.5 if footer_note else 8) * mm
            canvas.line(15 * mm, top_line, W - 15 * mm, top_line)
            canvas.setFillColor(colors.HexColor("#334155"))
            contact = " · ".join(
                x for x in [
                    f"Support: {support_email}" if support_email else "",
                    f"Timings: {timings}" if timings else "",
                ] if x
            )
            cy = fy + (7.5 if footer_note else 4) * mm
            if contact:
                canvas.setFont("Helvetica-Bold", 8.5)
                canvas.drawCentredString(W / 2, cy, contact[:160])
            if footer_note:
                canvas.setFont("Helvetica-Oblique", 8)
                canvas.drawCentredString(W / 2, fy + 3.8 * mm,
                                         footer_note[:160])
            canvas.setFont("Helvetica", 8)
            canvas.drawCentredString(W / 2, fy, copyright_line[:160])
            canvas.setFont("Helvetica-Bold", 8)
            canvas.drawRightString(W - 15 * mm, fy, f"Page {doc.page}")
        finally:
            canvas.restoreState()

    return _draw


def _draw_mark(canvas, x, y, size, color) -> None:
    """Fallback logo: teal rounded square with a white cross (matches app icon)."""
    from reportlab.lib import colors

    r = size * 0.22
    canvas.setFillColor(color)
    try:
        canvas.roundRect(x, y, size, size, r, fill=1, stroke=0)
    except Exception:
        canvas.rect(x, y, size, size, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    bar_w = size * 0.22
    bar_l = size * 0.56
    cx, cy = x + size / 2, y + size / 2
    canvas.rect(cx - bar_w / 2, cy - bar_l / 2, bar_w, bar_l, fill=1, stroke=0)
    canvas.rect(cx - bar_l / 2, cy - bar_w / 2, bar_l, bar_w, fill=1, stroke=0)


def build_branded_pdf(buf, story, header_title: str, header_sub: str = "") -> None:
    """Build a platypus story with branded header/footer on every page."""
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate
    from reportlab.lib.units import mm

    on_page = make_header_footer(header_title, header_sub)
    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=30 * mm, bottomMargin=24 * mm,
        leftMargin=15 * mm, rightMargin=15 * mm,
        title=header_title,
    )
    pdf.build(story, onFirstPage=on_page, onLaterPages=on_page)
