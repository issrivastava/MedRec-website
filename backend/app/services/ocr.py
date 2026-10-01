"""Extract text from uploaded PDFs, images and documents. Never crashes — returns '' on failure."""
from __future__ import annotations
import io


def tesseract_exe() -> str | None:
    """Locate the Tesseract binary.

    The Windows installer (UB-Mannheim) does NOT add itself to PATH, so
    shutil.which() alone misses it — check the default install folders too.
    """
    import os
    import shutil
    found = shutil.which("tesseract")
    if found:
        return found
    for cand in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ):
        if os.path.exists(cand):
            return cand
    return None


def _ensure_tesseract_cmd() -> None:
    """Point pytesseract at the binary when it isn't on PATH (Windows default)."""
    try:
        import pytesseract
        exe = tesseract_exe()
        if exe:
            pytesseract.pytesseract.tesseract_cmd = exe
    except Exception:
        pass


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
        if name.endswith(".docx") or mt.endswith(".wordprocessingml.document"):
            return _from_docx(file_bytes)
        if name.endswith((".csv", ".txt", ".tsv", ".log", ".md")) or mt.startswith("text/"):
            return _from_text(file_bytes)
        if name.endswith(".doc") or mt == "application/msword":
            # Legacy binary Word format — best-effort printable-text scrape.
            return _from_text(file_bytes)
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
    return "\n".join(p["text"] for p in extract_pages(data, "application/pdf", "doc.pdf")).strip()[:20000]


def extract_pages(file_bytes: bytes, mimetype: str | None, filename: str,
                  max_pages: int = 50, max_chars_per_page: int = 8000) -> list[dict]:
    """Vectorless-RAG page index: split a file into per-page text chunks.

    Returns [{page: 1-based int, text: str}] — never raises, [] on failure.
    PDFs keep real page numbers (embedded text first, OCR fallback per page);
    images/DOCX/TXT collapse to a single page 1; videos yield [].
    Caps pages/chars so a 500-page scan can't blow up the index.
    """
    name = (filename or "").lower()
    mt = (mimetype or "").lower()
    if mt.startswith("video/") or name.endswith((".mp4", ".webm", ".mov", ".m4v", ".3gp", ".3g2", ".mkv")):
        return []
    try:
        if "pdf" in mt or name.endswith(".pdf"):
            return _pdf_pages(file_bytes, max_pages, max_chars_per_page)
        text = extract_text(file_bytes, mimetype, filename)
        text = (text or "").strip()
        if not text:
            return []
        return [{"page": 1, "text": text[:max_chars_per_page]}]
    except Exception:
        return []


def _pdf_pages(data: bytes, max_pages: int, max_chars: int) -> list[dict]:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        out: list[dict] = []
        ocr_done = 0
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            try:
                text = (page.get_text() or "").strip()
            except Exception:
                text = ""
            if len(text) < 50 and tesseract_exe() and ocr_done < 5:
                # Scanned page: OCR just this page (embedded-text pages skip this).
                # Capped at 5 OCR'd pages so a 50-page scan stays fast.
                try:
                    _ensure_tesseract_cmd()
                    pix = page.get_pixmap(dpi=200)
                    text = (_ocr_image_bytes(pix.tobytes("png")) or "").strip()
                    ocr_done += 1
                except Exception:
                    pass
            if text:
                out.append({"page": i + 1, "text": text[:max_chars]})
        return out
    except Exception:
        return []


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
    _ensure_tesseract_cmd()
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


def _from_text(data: bytes) -> str:
    """Plain text / CSV / TSV / legacy .doc scrape — decode best-effort."""
    try:
        txt = data.decode("utf-8", errors="ignore")
    except Exception:
        return ""
    # Legacy .doc binaries contain lots of control chars — keep printables.
    cleaned = "".join(c if c == "\n" or c == "\t" or 32 <= ord(c) < 127 or ord(c) > 159 else " " for c in txt)
    cleaned = " ".join(cleaned.split())
    if len(cleaned.strip()) > 10:
        return cleaned[:20000]
    return ""


def _from_docx(data: bytes) -> str:
    """Modern Word (.docx is a zip of XML) — stdlib only, no new dependency."""
    try:
        import zipfile
        import xml.etree.ElementTree as ET
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            try:
                xml_bytes = z.read("word/document.xml")
            except KeyError:
                return ""
        # WordprocessingML namespace: pull all <w:t> text nodes in order.
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        root = ET.fromstring(xml_bytes)
        texts = [el.text for el in root.iterfind(".//w:t", ns) if el.text]
        joined = " ".join(texts)
        joined = " ".join(joined.split())
        if len(joined.strip()) > 10:
            return joined[:20000]
    except Exception:
        pass
    # Fallback: treat as raw text scrape.
    return _from_text(data)
