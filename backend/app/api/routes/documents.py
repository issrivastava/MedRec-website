from datetime import date
from pathlib import Path
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.tables import Document, AiSummary, AiSummaryHistory, DocumentVersion, DoctorPatientAssignment, User
from app.schemas.schemas import DocumentOut, AiSummaryOut, OverallSummaryOut, OverallSummaryPdfIn, DocumentUpdateIn, DocumentVersionOut
from app.services.ocr import extract_text
from app.services.ollama import summarize_document, summarize_overall

router = APIRouter()


def _clamp_limit(limit: int | None, default: int = 100) -> int:
    """Clamp ?limit= to settings.MAX_PAGE_SIZE so lists stay fast."""
    try:
        v = int(limit) if limit is not None else default
    except Exception:
        v = default
    return max(1, min(v, settings.MAX_PAGE_SIZE))


def _clamp_offset(offset: int | None) -> int:
    try:
        v = int(offset) if offset is not None else 0
    except Exception:
        v = 0
    return max(0, v)

ALLOWED = {
    "application/pdf", "image/png", "image/jpeg", "image/webp",
    "image/tiff", "image/bmp", "text/plain", "text/csv", "application/csv",
    "text/tab-separated-values",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    # test-result videos (stored for viewing; no text extraction)
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
    "video/3gpp", "video/3gpp2", "video/x-matroska",
}

DOC_EXTS = (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp",
            ".txt", ".csv", ".tsv", ".doc", ".docx")

VIDEO_EXTS = (".mp4", ".webm", ".mov", ".m4v", ".3gp", ".3g2", ".mkv")


def _is_video(content_type: str | None, filename: str) -> bool:
    return (content_type or "").lower().startswith("video/") or (filename or "").lower().endswith(VIDEO_EXTS)


def _doc_out(d: Document) -> dict:
    ocr_len = len(d.ocr_text or "")
    return {
        "id": d.id, "owner_id": d.owner_id, "title": d.title, "doc_type": d.doc_type,
        "category": getattr(d, "category", None), "report_kind": getattr(d, "report_kind", None),
        "doctor_name": d.doctor_name, "hospital": d.hospital, "visit_date": d.visit_date,
        "notes": d.notes, "family_member_id": d.family_member_id,
        "file_mimetype": d.file_mimetype, "file_size": d.file_size,
        "has_summary": d.ai_summary is not None, "created_at": d.created_at,
        "ocr_chars": ocr_len, "has_text": ocr_len > 20,
    }


@router.get("/ai-status", response_model=dict)
def ai_status():
    """What the AI summary pipeline needs: Ollama reachability + model + image-OCR binary."""
    from app.services.ollama import (ping, tesseract_available, list_local_models,
                                     active_model, vision_model_name)
    ok, detail = ping()
    vmodel = vision_model_name()
    return {"ollama_ok": ok, "ollama_detail": detail,
            "model": settings.OLLAMA_MODEL, "base_url": settings.OLLAMA_BASE_URL,
            "active_model": active_model(),
            "local_models": list_local_models(),
            "vision_model": vmodel,
            "vision_ready": bool(vmodel),
            "tesseract_ok": tesseract_available(),
            "tesseract_detail": ("installed — photo/scan text extraction works"
                                 if tesseract_available() else
                                 "NOT installed — photo/scan uploads will have no text and AI summaries will be limited "
                                 "(Windows: winget install UB-Mannheim.TesseractOCR, then restart backend)")}


@router.get("/ai-models", response_model=dict)
def ai_models(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Pulled Ollama models — pick a different brain for summaries/understanding."""
    from app.services.ollama import list_local_models, active_model, vision_model_name
    models = list_local_models()
    return {"active": active_model(), "models": models,
            "vision_model": vision_model_name(),
            "suggested": [m for m in ["qwen2.5:7b", "moondream", "llama3.1:8b"] if m not in models]}


@router.post("/ai-model", response_model=dict)
def ai_set_model(body: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Switch the model used for summaries + understanding (must already be pulled)."""
    from app.services.ollama import set_active_model
    name = (body.get("model") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="model required")
    try:
        active = set_active_model(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"active": active}


@router.get("/taxonomy", response_model=dict)
def get_taxonomy():
    """Single source of truth for the file manager: Type/Category/Kind
    tree + which kinds are lab-comparable. Public (no PHI)."""
    from app.services.report_kinds import (
        CATEGORIES, KIND_TO_CATEGORY, KIND_TO_DOC_TYPE, DOC_TYPES,
        COMPARABLE_KINDS, PRESCRIPTION_KINDS,
    )
    return {"doc_types": DOC_TYPES, "categories": CATEGORIES,
            "kind_to_category": KIND_TO_CATEGORY,
            "kind_to_doc_type": KIND_TO_DOC_TYPE,
            "comparable_kinds": sorted(COMPARABLE_KINDS),
            "prescription_kinds": sorted(PRESCRIPTION_KINDS)}


@router.get("/stats", response_model=dict)
def doc_stats(patient_id: str | None = None, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    """File-manager counts: total + per type/category/kind for one patient.

    Powers the sidebar list (All files, CBC (3), MRI (1)…). Patients are
    auto-scoped to self; doctors pass an assigned patient_id.
    NOTE: registered above /{doc_id} so "stats" isn't parsed as an ID.
    """
    from sqlalchemy import func
    from app.core.deps import resolve_patient_id
    pid = resolve_patient_id(db, user, patient_id)
    base = db.query(Document).filter_by(owner_id=pid)
    total = base.count()
    by_type = dict(base.with_entities(Document.doc_type, func.count(Document.id))
                   .group_by(Document.doc_type).all())
    by_category = dict(base.filter(Document.category.isnot(None))
                       .with_entities(Document.category, func.count(Document.id))
                       .group_by(Document.category).all())
    by_kind = dict(base.filter(Document.report_kind.isnot(None))
                   .with_entities(Document.report_kind, func.count(Document.id))
                   .group_by(Document.report_kind).all())
    return {"patient_id": pid, "total": total, "by_type": by_type,
            "by_category": by_category, "by_kind": by_kind}


@router.post("/fix-labels", response_model=dict)
def fix_labels(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """One-click repair for mislabelled uploads (e.g. prescription stored
    as report). Re-runs the canonical resolver over the caller's own docs
    using title + stored filename + notes; only mismatched rows are updated.
    Returns {fixed, total, details}. Doctors fix nothing (patient-owned)."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    from pathlib import Path as _Path
    from app.services.report_kinds import resolve_classification as _resolve
    docs = db.query(Document).filter_by(owner_id=user.id).all()
    fixed = 0
    details: list[dict] = []
    for d in docs:
        try:
            fname = _Path(d.file_path or "").name
        except Exception:
            fname = ""
        new_dt, new_cat, new_kind, _ = _resolve(
            doc_type=d.doc_type, category=getattr(d, "category", None),
            report_kind=getattr(d, "report_kind", None),
            title=d.title, filename=fname, notes=d.notes,
        )
        # Only touch rows where the kind was missing/wrong or the type
        # contradicts the kind — never wipe a good explicit label to None.
        if new_kind and (new_kind != getattr(d, "report_kind", None)
                         or new_dt != d.doc_type
                         or new_cat != getattr(d, "category", None)):
            details.append({"id": d.id, "title": d.title,
                            "before": {"doc_type": d.doc_type,
                                       "category": getattr(d, "category", None),
                                       "report_kind": getattr(d, "report_kind", None)},
                            "after": {"doc_type": new_dt, "category": new_cat,
                                      "report_kind": new_kind}})
            d.doc_type, d.category, d.report_kind = new_dt, new_cat, new_kind
            fixed += 1
    db.commit()
    return {"fixed": fixed, "total": len(docs), "details": details[:50]}


def _vision_b64(data: bytes, filename: str, mimetype: str | None) -> str | None:
    """Downscaled base64 image for vision models (photo or PDF first page)."""
    try:
        import base64
        import io
        from PIL import Image
        name = (filename or "").lower()
        mt = (mimetype or "").lower()
        img = None
        if mt.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff")):
            img = Image.open(io.BytesIO(data)).convert("RGB")
        elif "pdf" in mt or name.endswith(".pdf"):
            import fitz
            doc = fitz.open(stream=data, filetype="pdf")
            if len(doc):
                pix = doc[0].get_pixmap(dpi=150)
                img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        if img is None:
            return None
        img.thumbnail((1568, 1568))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


@router.post("/understand", response_model=dict)
async def understand_upload(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Pre-upload AI detection: OCR + vision + classify. No save — used to
    prefill the upload form so the AI 'understands' before storing."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    ocr_text = extract_text(data, file.content_type, file.filename or "")
    from app.services.ollama import understand_document, vision_model_name
    b64 = _vision_b64(data, file.filename or "", file.content_type)
    try:
        result, model, vision_used = understand_document(
            ocr_text, {"title": title or file.filename}, b64)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI understanding failed: {exc}")
    return {"ocr_chars": len(ocr_text), "ocr_preview": ocr_text[:800],
            "understanding": result, "model_used": model, "vision_used": vision_used,
            "vision_available": bool(vision_model_name())}


def _can_access(db: Session, user: User, doc: Document) -> bool:
    if doc.owner_id == user.id:
        return True
    if user.role == "doctor":
        return (
            db.query(DoctorPatientAssignment)
            .filter_by(doctor_id=user.id, patient_id=doc.owner_id)
            .first()
            is not None
        )
    return False


@router.get("", response_model=list[DocumentOut])
def list_docs(
    doctor_name: str | None = None,
    doc_type: str | None = None,
    category: str | None = None,
    report_kind: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = None,
    group_by: str | None = None,  # accepted for client convenience; sorting applied
    family_member_id: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Patients list their own docs. Doctors must use /doctors/patients/{id}/documents."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Use doctor patient view")
    query = db.query(Document).options(selectinload(Document.ai_summary)).filter(Document.owner_id == user.id)
    if family_member_id:
        query = query.filter(Document.family_member_id == family_member_id)
    if doctor_name:
        query = query.filter(Document.doctor_name.ilike(f"%{doctor_name}%"))
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    if category:
        query = query.filter(Document.category == category)
    if report_kind:
        query = query.filter(Document.report_kind == report_kind)
    if from_date:
        query = query.filter(Document.visit_date >= from_date)
    if to_date:
        query = query.filter(Document.visit_date <= to_date)
    if q:
        like = f"%{q}%"
        # full-text-ish search across metadata + OCR text (works on SQLite + Postgres)
        query = query.filter(
            Document.title.ilike(like) | Document.hospital.ilike(like) | Document.notes.ilike(like)
            | Document.report_kind.ilike(like) | Document.category.ilike(like)
            | Document.doctor_name.ilike(like) | Document.ocr_text.ilike(like)
        )
    if group_by == "doctor":
        query = query.order_by(Document.doctor_name.asc().nullslast(), Document.visit_date.desc())
    elif group_by == "kind":
        query = query.order_by(Document.report_kind.asc().nullslast(), Document.visit_date.desc())
    else:  # date-wise default
        query = query.order_by(Document.visit_date.desc().nullslast(), Document.created_at.desc())
    query = query.limit(_clamp_limit(limit)).offset(_clamp_offset(offset))
    return [_doc_out(d) for d in query.all()]


def _process_upload_ocr(doc_id: str) -> None:
    """Background OCR + lab analysis so uploads return instantly.

    Runs after the 201 response with its own DB session (the request
    session is closed by then). Never raises — failures just leave
    ocr_text empty for retry via re-upload/OCR preview.
    """
    try:
        from app.db.session import SessionLocal
        db = SessionLocal()
        try:
            doc = db.query(Document).filter_by(id=doc_id).first()
            if not doc:
                return
            # Skip videos + docs that already have text (retry-safe).
            if doc.ocr_text:
                return
            try:
                raw = Path(doc.file_path).read_bytes()
            except Exception:
                return
            try:
                doc.ocr_text = extract_text(raw, doc.file_mimetype, Path(doc.file_path).name)
            except Exception:
                doc.ocr_text = ""
            db.commit()
            # Vectorless-RAG page index (per-page rows for cited Q&A).
            try:
                from app.services.page_rag import build_page_index
                build_page_index(db, doc, raw)
            except Exception:
                pass
            try:
                from app.api.routes.alerts import analyze_document
                analyze_document(db, doc)
            except Exception:
                pass
        finally:
            db.close()
    except Exception:
        pass


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_doc(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    doc_type: str = Form("report"),
    category: str | None = Form(None),
    report_kind: str | None = Form(None),
    doctor_name: str | None = Form(None),
    hospital: str | None = Form(None),
    visit_date: date | None = Form(None),
    notes: str | None = Form(None),
    family_member_id: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients upload documents")
    from app.services.report_kinds import (
        valid_category, valid_kind, valid_doc_type, resolve_classification,
    )
    if not valid_doc_type(doc_type):
        raise HTTPException(status_code=400, detail="Invalid doc_type")
    if not valid_kind(report_kind):
        raise HTTPException(status_code=400, detail="Invalid report_kind")
    if not valid_category(category):
        raise HTTPException(status_code=400, detail="Invalid category")
    # Single source of truth: kind is authoritative. Infer from
    # title + filename + notes combined so "prescription.pdf" titled
    # "My doc" is still stored as prescription — never as generic report.
    # An explicitly picked kind always wins over inference; an explicitly
    # picked doc_type with no kind reverse-maps to a matching kind.
    doc_type, category, report_kind, _ = resolve_classification(
        doc_type=doc_type, category=category, report_kind=report_kind,
        title=title, filename=file.filename or "", notes=notes,
    )
    if family_member_id:
        from app.models.tables import FamilyMember
        if not db.query(FamilyMember).filter_by(id=family_member_id, owner_id=user.id).first():
            raise HTTPException(status_code=400, detail="Unknown family member")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes) — please choose a valid PDF, Word, CSV, text, photo or video.")
    # Videos run under a larger limit (phone clips); everything else uses MAX_UPLOAD_MB.
    is_video = _is_video(file.content_type, file.filename or "")
    max_mb = settings.VIDEO_MAX_UPLOAD_MB if is_video else settings.MAX_UPLOAD_MB
    if len(data) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large (max {max_mb} MB{' for video' if is_video else ''})")
    if file.content_type not in ALLOWED and not (file.filename or "").lower().endswith(
        (*DOC_EXTS, *VIDEO_EXTS)
    ):
        raise HTTPException(status_code=400, detail="Unsupported file type (PDF, Word .doc/.docx, CSV, text, photo or video)")

    upload_dir = Path(settings.UPLOAD_DIR) / user.id
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = (file.filename or "upload").replace("/", "_").replace("\\", "_")
    # prefix to avoid collisions
    import uuid as _uuid
    stored = f"{_uuid.uuid4().hex[:8]}_{safe_name}"
    dest = upload_dir / stored
    dest.write_bytes(data)

    # Save immediately with empty OCR so the response is instant;
    # text extraction + lab alerts run in the background (see _process_upload_ocr).
    # Fast path: tiny plain-text files extract in microseconds — do inline.
    is_texty = (file.content_type or "").lower().startswith("text/") or (file.filename or "").lower().endswith(
        (".txt", ".csv", ".tsv", ".log", ".md"))
    ocr_text = ""
    if is_texty and len(data) < 512 * 1024:
        try:
            ocr_text = extract_text(data, file.content_type, file.filename or "")
        except Exception:
            ocr_text = ""
    doc = Document(
        owner_id=user.id, title=title, doc_type=doc_type,
        category=category or None, report_kind=report_kind or None,
        doctor_name=doctor_name or None, hospital=hospital or None,
        visit_date=visit_date, notes=notes or None,
        family_member_id=family_member_id or None,
        file_path=str(dest), file_mimetype=file.content_type, file_size=len(data),
        ocr_text=ocr_text,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    if not ocr_text:
        background_tasks.add_task(_process_upload_ocr, doc.id)
    else:
        # Text was already extracted inline — index its pages now (fast,
        # in-request: plain text is a single page) and run labs off-request.
        try:
            from app.services.page_rag import build_page_index
            build_page_index(db, doc, data)
        except Exception:
            pass
        try:
            background_tasks.add_task(_process_upload_ocr, doc.id)
        except Exception:
            try:
                from app.api.routes.alerts import analyze_document
                analyze_document(db, doc)
            except Exception:
                pass
    return _doc_out(doc)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_doc(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_out(doc)


@router.put("/{doc_id}", response_model=DocumentOut)
def update_doc(doc_id: str, data: DocumentUpdateIn, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    """Edit report metadata — every edit snapshots the previous state into version history."""
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.services.report_kinds import (
        valid_category as _valid_cat, valid_kind as _valid_kind,
        valid_doc_type as _valid_dt, resolve_classification as _resolve,
    )
    if data.category is not None and not _valid_cat(data.category):
        raise HTTPException(status_code=400, detail="Invalid category")
    if data.report_kind is not None and not _valid_kind(data.report_kind):
        raise HTTPException(status_code=400, detail="Invalid report_kind")
    if getattr(data, "doc_type", None) is not None and not _valid_dt(data.doc_type):
        raise HTTPException(status_code=400, detail="Invalid doc_type")
    last = db.query(DocumentVersion).filter_by(document_id=doc.id).order_by(DocumentVersion.version_no.desc()).first()
    next_no = (last.version_no + 1) if last else 1
    db.add(DocumentVersion(
        document_id=doc.id, version_no=next_no, title=doc.title, notes=doc.notes,
        visit_date=doc.visit_date, doctor_name=doc.doctor_name, hospital=doc.hospital,
        ocr_text=doc.ocr_text,
    ))
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    # Keep Type/Category/Kind consistent: a kind edit re-derives the other
    # two so "kind=prescription" can never stay "doc_type=report".
    if "report_kind" in data.model_dump(exclude_unset=True) or "category" in data.model_dump(exclude_unset=True) or "doc_type" in data.model_dump(exclude_unset=True):
        new_dt, new_cat, new_kind, _ = _resolve(
            doc_type=getattr(doc, "doc_type", "report"), category=getattr(doc, "category", None),
            report_kind=getattr(doc, "report_kind", None),
            title=doc.title, filename="", notes=doc.notes,
        )
        # Only overwrite when the resolver produced a kind (or the user
        # explicitly cleared it) — never wipe a good kind to None.
        if new_kind:
            doc.doc_type, doc.category, doc.report_kind = new_dt, new_cat, new_kind
        elif getattr(doc, "report_kind", None) is None:
            doc.doc_type = new_dt
            if getattr(doc, "category", None) is None:
                doc.category = new_cat
    db.commit()
    db.refresh(doc)
    # Re-run lab analysis if visit date changed (keeps trends dated correctly)
    try:
        from app.api.routes.alerts import analyze_document
        analyze_document(db, doc)
    except Exception:
        pass
    return _doc_out(doc)


@router.get("/{doc_id}/download")
def download_doc(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(doc.file_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="File missing from storage")
    return FileResponse(path, media_type=doc.file_mimetype or "application/octet-stream",
                        filename=path.name)


def _pdf_filename(title: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9 _-]+", "", title or "document").strip().replace(" ", "-") or "document"
    return f"{safe[:80]}.pdf"


@router.get("/{doc_id}/pdf")
def download_doc_pdf(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Download ANY document strictly as PDF (photos embedded, text typeset,
    PDFs passed through, videos become an info cover sheet)."""
    from fastapi.responses import Response
    from app.services.pdf_export import build_document_pdf

    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(doc.file_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="File missing from storage")
    meta = {
        "Title": doc.title,
        "Type": f"{doc.doc_type}" + (f" / {doc.report_kind}" if doc.report_kind else ""),
        "Visit date": doc.visit_date.isoformat() if doc.visit_date else None,
        "Doctor": doc.doctor_name,
        "Hospital": doc.hospital,
        "Original file": path.name,
    }
    pdf = build_document_pdf(doc.title, meta, path.read_bytes(), doc.file_mimetype, path.name)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{_pdf_filename(doc.title)}"'})


@router.delete("/{doc_id}", status_code=204)
def delete_doc(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        Path(doc.file_path).unlink(missing_ok=True)
    except Exception:
        pass
    try:
        from app.models.tables import DocumentPage
        db.query(DocumentPage).filter_by(document_id=doc.id).delete(synchronize_session=False)
    except Exception:
        pass
    db.delete(doc)
    db.commit()
    return None


@router.post("/{doc_id}/summarize", response_model=AiSummaryOut)
def summarize(doc_id: str, language: str = "en", db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    if (doc.file_size or 0) == 0:
        raise HTTPException(status_code=422, detail="This file is empty (0 bytes) — delete it and re-upload a valid photo or PDF.")
    meta = {"doctor_name": doc.doctor_name, "hospital": doc.hospital,
            "visit_date": str(doc.visit_date) if doc.visit_date else None,
            "category": getattr(doc, "category", None),
            "report_kind": getattr(doc, "report_kind", None), "notes": doc.notes}
    text, findings, model = summarize_document(doc.title, doc.doc_type, doc.ocr_text or "", language, meta)
    # Always keep an immutable history row per generation
    db.add(AiSummaryHistory(document_id=doc.id, patient_id=doc.owner_id,
                            summary_text=text, key_findings=findings, model_used=model, language=language))
    existing = db.query(AiSummary).filter_by(document_id=doc.id).first()
    if existing:
        existing.summary_text = text
        existing.key_findings = findings
        existing.model_used = model
        existing.language = language
        db.commit()
        db.refresh(existing)
        return existing
    s = AiSummary(document_id=doc.id, patient_id=doc.owner_id,
                  summary_text=text, key_findings=findings, model_used=model, language=language)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/{doc_id}/summary", response_model=AiSummaryOut)
def get_summary(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    s = db.query(AiSummary).filter_by(document_id=doc.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="No summary yet — POST /summarize first")
    return s


@router.get("/{doc_id}/ocr-text", response_model=dict)
def ocr_preview(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Show what the AI can 'see' — first 3000 chars of extracted text."""
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    text = doc.ocr_text or ""
    return {"doc_id": doc.id, "chars": len(text), "preview": text[:3000],
            "has_text": len(text) > 20}


@router.get("/{doc_id}/pages", response_model=dict)
def doc_page_index(doc_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Vectorless-RAG page index for one document: per-page text + char counts.

    Powers cited Q&A ("page 2 of your CBC report"). Rebuilt automatically on
    upload; pass rebuild=true (owner only) to force re-extraction.
    """
    from app.models.tables import DocumentPage
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    rows = (db.query(DocumentPage).filter_by(document_id=doc.id)
            .order_by(DocumentPage.page_no.asc()).all())
    return {"doc_id": doc.id, "title": doc.title, "pages": len(rows),
            "results": [{"page": r.page_no, "chars": r.chars,
                         "preview": (r.text or "")[:600]} for r in rows]}


@router.post("/{doc_id}/reindex", response_model=dict)
def doc_reindex(doc_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    """Force-rebuild the page index from the stored file (owner only)."""
    from app.services.page_rag import build_page_index
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    n = build_page_index(db, doc)
    return {"doc_id": doc.id, "pages": n}


@router.post("/{doc_id}/understand", response_model=dict)
def understand_stored(doc_id: str, apply: bool = False, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    """AI reads a stored document: classify type + extract facts.

    Pass apply=true (patient owner only) to write kind/category/doctor/
    hospital/visit-date back to the document and re-run lab analysis."""
    from datetime import date as _date
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or not _can_access(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    from app.services.ollama import understand_document
    b64 = None
    try:
        b64 = _vision_b64(Path(doc.file_path).read_bytes(), doc.title, doc.file_mimetype)
    except Exception:
        pass
    try:
        result, model, vision_used = understand_document(
            doc.ocr_text or "", {"title": doc.title}, b64)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI understanding failed: {exc}")
    applied: list[str] = []
    if apply:
        if doc.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Only the owner can apply AI detection")
        from app.services.report_kinds import resolve_classification as _resolve2
        # Resolve kind/category/doc_type TOGETHER so they can never disagree
        # (kind authoritative — same resolver as upload).
        ai_kind = result.get("report_kind")
        ai_cat = result.get("category")
        ai_dt = result.get("doc_type")
        if ai_kind or ai_cat or ai_dt:
            new_dt, new_cat, new_kind, _ = _resolve2(
                doc_type=ai_dt or doc.doc_type, category=ai_cat or getattr(doc, "category", None),
                report_kind=ai_kind or getattr(doc, "report_kind", None),
                title=doc.title, filename="", notes=doc.notes,
            )
            if new_kind and new_kind != getattr(doc, "report_kind", None):
                doc.report_kind = new_kind
                applied.append("report_kind")
            if new_cat and new_cat != getattr(doc, "category", None):
                doc.category = new_cat
                applied.append("category")
            if new_dt and new_dt != doc.doc_type:
                doc.doc_type = new_dt
                applied.append("doc_type")
        for key in ("doctor_name", "hospital"):
            if result.get(key) and not getattr(doc, key):
                setattr(doc, key, result[key][:255])
                applied.append(key)
        vd = result.get("visit_date")
        if vd and not doc.visit_date:
            try:
                doc.visit_date = _date.fromisoformat(str(vd)[:10])
                applied.append("visit_date")
            except Exception:
                pass
        # snapshot version + re-run lab analysis so key_values flow into trends
        try:
            last = db.query(DocumentVersion).filter_by(document_id=doc.id).order_by(DocumentVersion.version_no.desc()).first()
            db.add(DocumentVersion(document_id=doc.id, version_no=(last.version_no + 1) if last else 1,
                                   title=doc.title, notes=doc.notes, visit_date=doc.visit_date,
                                   doctor_name=doc.doctor_name, hospital=doc.hospital, ocr_text=doc.ocr_text))
            from app.api.routes.alerts import analyze_document
            analyze_document(db, doc)
        except Exception:
            pass
        db.commit()
        db.refresh(doc)
    return {"understanding": result, "model_used": model, "vision_used": vision_used,
            "applied": applied, "document": _doc_out(doc) if applied else None}


@router.get("/patient/overall-summary", response_model=OverallSummaryOut)
def overall_summary(language: str = "en", db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    docs = (
        db.query(Document).filter_by(owner_id=user.id)
        .order_by(Document.visit_date.desc().nullslast()).limit(8).all()
    )
    payload = [
        {"title": d.title, "doc_type": d.doc_type, "category": getattr(d, "category", None),
         "report_kind": getattr(d, "report_kind", None), "visit_date": str(d.visit_date),
         "ocr_text": d.ocr_text or ""} for d in docs
    ]
    text, used, model = summarize_overall(user.full_name, payload, language)
    return OverallSummaryOut(patient_id=user.id, summary_text=text, model_used=model, documents_used=used)


@router.post("/patient/overall-summary/pdf")
def overall_summary_pdf(data: OverallSummaryPdfIn, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """Download an already-generated overall summary as PDF (no regeneration,
    so this is instant — the AI runs only when Generate is clicked)."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patients only")
    from io import BytesIO
    from xml.sax.saxutils import escape
    text = (data.text or "").strip()[:15000]
    if len(text) < 10:
        raise HTTPException(status_code=422, detail="Summary text too short for a PDF")
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.units import mm
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"<b>AI Health Overview — {escape(user.full_name)}</b>", styles["Title"]),
        Paragraph(f"{date.today().isoformat()} · {escape(user.health_id or '')}", styles["Normal"]),
        HRFlowable(width="100%", thickness=1), Spacer(1, 6),
    ]
    for para in text.split("\n"):
        para = para.strip()
        if not para:
            story.append(Spacer(1, 4))
        else:
            story.append(Paragraph(escape(para).replace("\n", "<br/>"), styles["Normal"]))
            story.append(Spacer(1, 4))
    story += [
        HRFlowable(width="100%", thickness=1), Spacer(1, 6),
        Paragraph("<i>Informational summary only — not medical advice. Always consult your doctor.</i>",
                  styles["Italic"]),
    ]
    pdf.build(story)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="overall-summary.pdf"'})


@router.post("/auto-classify", response_model=dict)
def auto_classify(title: str = Form(""), filename: str = Form(""),
                  notes: str | None = Form(None),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Smart upload: guess category/report_kind/doc_type/title from filename + title.

    Rule-based (instant, offline) via report_kinds.resolve_classification —
    the SAME resolver upload uses, so the suggestion preview always matches
    what will actually be stored. Frontend calls this on file-select to
    prefill the upload form."""
    from app.services.report_kinds import resolve_classification
    doc_type, category, kind, inferred = resolve_classification(
        doc_type="report", category=None, report_kind=None,
        title=title, filename=filename, notes=notes,
    )
    suggested_title = (title or filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ")).strip()[:120]
    # duplicate detection: same title + similar size bucket already exists
    dupes = []
    if suggested_title and user.role == "patient":
        like = f"%{suggested_title[:30]}%"
        dupes = [{"id": d.id, "title": d.title, "visit_date": d.visit_date}
                 for d in db.query(Document).filter_by(owner_id=user.id)
                 .filter(Document.title.ilike(like)).limit(3).all()]
    return {"suggested_title": suggested_title or "Untitled report",
            "suggested_kind": kind, "suggested_category": category,
            "suggested_doc_type": doc_type,
            "possible_duplicates": dupes,
            "confidence": "high" if kind and not inferred else ("medium" if kind else "low")}
