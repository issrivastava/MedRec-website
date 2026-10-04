"""Custom PDF header/footer branding (admin-managed).

Header: clinic logo + name (+ address line). Footer: support email +
working hours + optional custom note + copyright + page number.
Values saved here override backend/.env and apply to EVERY generated PDF
(e-prescriptions, bulk compilation, bill receipts, certificates,
record exports, document PDFs, AI summaries).
"""
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.core.deps import get_current_user, require_admin
from app.models.tables import User
from app.schemas.schemas import BrandingIn, BrandingOut
from app.services import clinic_branding as branding

router = APIRouter()


def _out() -> dict:
    b = branding.brand()
    return {
        "clinic_name": b["name"],
        "clinic_address": b["address"],
        "support_email": b["support_email"],
        "timings": b["timings"],
        "footer_note": b["footer_note"],
        "copyright": b["copyright"],
        "custom": b["custom"],
        "has_custom_logo": bool(branding.logo_data_url()),
        "logo_data_url": branding.logo_data_url(),
    }


@router.get("", response_model=BrandingOut)
def read_branding(user: User = Depends(get_current_user)):
    """Current header/footer branding (custom values + effective rendering)."""
    return _out()


@router.put("", response_model=BrandingOut)
def update_branding(data: BrandingIn, user: User = Depends(require_admin)):
    """Set custom header/footer text. Empty string resets that field to default."""
    branding.save_custom_branding(data.model_dump())
    return _out()


@router.post("/logo", response_model=BrandingOut)
async def upload_logo(file: UploadFile = File(...),
                      user: User = Depends(require_admin)):
    """Upload the header logo (PNG/JPEG/WebP, max 2 MB). Shown on every PDF."""
    try:
        contents = await file.read()
    except Exception:
        contents = b""
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(contents) > branding.MAX_LOGO_BYTES:
        raise HTTPException(status_code=400,
                            detail="Logo must be under 2 MB")
    try:
        from PIL import Image
        from io import BytesIO
        img = Image.open(BytesIO(contents)).convert("RGBA")
    except Exception:
        raise HTTPException(status_code=400,
                            detail="Not a readable image (use PNG/JPEG/WebP)")
    if min(img.size) < 16:
        raise HTTPException(status_code=400, detail="Logo image is too small")
    # Normalise to PNG on a white background (JPEG-style transparency safe).
    try:
        from PIL import Image as _Image
        bg = _Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    except Exception:
        img = img.convert("RGB")
    try:
        img.save(branding.custom_logo_path(), format="PNG")
    except OSError:
        raise HTTPException(status_code=500, detail="Could not store the logo")
    return _out()


@router.delete("/logo", response_model=BrandingOut)
def delete_logo(user: User = Depends(require_admin)):
    """Remove the custom logo (PDFs fall back to the drawn mark)."""
    try:
        if os.path.isfile(branding.custom_logo_path()):
            os.remove(branding.custom_logo_path())
    except OSError:
        pass
    return _out()
