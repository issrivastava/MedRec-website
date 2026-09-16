"""Extract text from uploaded PDFs and images. Never crashes — returns '' on failure."""
from __future__ import annotations
import io


def extract_text(file_bytes: bytes, mimetype: str | None, filename: str) -> str:
    name = (filename or "").lower()
    mt = (mimetype or "").lower()
    try:
        if "pdf" in mt or name.endswith(".pdf"):
            return _from_pdf(file_bytes)
        if mt.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp")):
            return _from_image(file_bytes)
        # try plain text
        try:
            txt = file_bytes.decode("utf-8", errors="ignore")
            if len(txt.strip()) > 20:
                return txt[:20000]
        except Exception:
            pass
        return ""
    except Exception:
        return ""


def _from_pdf(data: bytes) -> str:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        parts = [page.get_text() for page in doc]
        text = "\n".join(parts).strip()
        if len(text) > 50:
            return text[:20000]
    except Exception:
        pass
    return ""


def _from_image(data: bytes) -> str:
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(io.BytesIO(data))
        return (pytesseract.image_to_string(img) or "")[:20000]
    except Exception:
        # tesseract binary often missing — not fatal
        return ""
