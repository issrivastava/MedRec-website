"""Extract text from uploaded PDFs and images. Never crashes — returns '' on failure."""
from __future__ import annotations
import io


def extract_text(file_bytes: bytes, mimetype: str | None, filename: str) -> str:
    name = (filename or "").lower()
    mt = (mimetype or "").lower()
    # Videos are stored for viewing only — never try to decode the bytes as text.
    if mt.startswith("video/") or name.endswith((".mp4", ".webm", ".mov", ".m4v", ".3gp", ".3g2", ".mkv")):
        return ""
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
        # Scanned PDF (image pages, no embedded text): render pages and OCR them
        ocr_bits = []
        try:
            import shutil
            if shutil.which("tesseract"):
                for page in doc[:3]:  # first 3 pages keep it fast
                    pix = page.get_pixmap(dpi=200)
                    ocr_bits.append(_ocr_image_bytes(pix.tobytes("png")))
        except Exception:
            pass
        return "\n".join(b for b in ocr_bits if b).strip()[:20000]
    except Exception:
        pass
    return ""


def _prep_image(img):
    """Preprocess for OCR: grayscale, upscale small images, boost contrast."""
    try:
        from PIL import ImageOps
        if img.mode != "L":
            img = img.convert("L")
        w, h = img.size
        if max(w, h) < 1500:  # upscale small phone photos 2x for Tesseract
            img = img.resize((w * 2, h * 2))
        return ImageOps.autocontrast(img, cutoff=1)
    except Exception:
        return img


def _ocr_image_bytes(png_bytes: bytes) -> str:
    from PIL import Image
    import pytesseract
    img = Image.open(io.BytesIO(png_bytes))
    return (pytesseract.image_to_string(_prep_image(img)) or "").strip()


def _from_image(data: bytes) -> str:
    try:
        return _ocr_image_bytes(data)[:20000]
    except Exception:
        # tesseract binary often missing — not fatal
        return ""
