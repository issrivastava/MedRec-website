from datetime import date
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.tables import Document, AiSummary, AiSummaryHistory, DocumentVersion, DoctorPatientAssignment, User
from app.schemas.schemas import DocumentOut, AiSummaryOut, OverallSummaryOut, DocumentUpdateIn, DocumentVersionOut
from app.services.ocr import extract_text
from app.services.ollama import summarize_document, summarize_overall

router = APIRouter()

ALLOWED = {
    "application/pdf", "image/png", "image/jpeg", "image/webp",
    "image/tiff", "image/bmp", "text/plain",
}


def _doc_out(d: Document) -> dict:
    return {
        "id": d.id, "owner_id": d.owner_id, "title": d.title, "doc_type": d.doc_type,
        "category": getattr(d, "category", None), "report_kind": getattr(d, "report_kind", None),
        "doctor_name": d.doctor_name, "hospital": d.hospital, "visit_date": d.visit_date,
        "notes": d.notes, "family_member_id": d.family_member_id,
        "file_mimetype": d.file_mimetype, "file_size": d.file_size,
        "has_summary": d.ai_summary is not None, "created_at": d.created_at,
    }


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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Patients list their own docs. Doctors must use /doctors/patients/{id}/documents."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Use doctor patient view")
    query = db.query(Document).filter(Document.owner_id == user.id)
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
        query = query.filter(
            Document.title.ilike(like) | Document.hospital.ilike(like) | Document.notes.ilike(like)
            | Document.report_kind.ilike(like) | Document.category.ilike(like)
        )
    if group_by == "doctor":
        query = query.order_by(Document.doctor_name.asc().nullslast(), Document.visit_date.desc())
    elif group_by == "kind":
        query = query.order_by(Document.report_kind.asc().nullslast(), Document.visit_date.desc())
    else:  # date-wise default
        query = query.order_by(Document.visit_date.desc().nullslast(), Document.created_at.desc())
    return [_doc_out(d) for d in query.all()]


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_doc(
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
    if doc_type not in ("report", "prescription", "lab", "scan", "other"):
        raise HTTPException(status_code=400, detail="Invalid doc_type")
    from app.services.report_kinds import (
        valid_category, valid_kind, category_of, infer_kind, KIND_TO_DOC_TYPE,
    )
    # Auto-suggest kind from title when the patient doesn't pick one
    if not report_kind:
        report_kind = infer_kind(title)
    if not valid_kind(report_kind):
        raise HTTPException(status_code=400, detail="Invalid report_kind")
    if not valid_category(category):
        raise HTTPException(status_code=400, detail="Invalid category")
    # Fill category from kind, and keep legacy doc_type consistent
    if report_kind and not category:
        category = category_of(report_kind)
    if report_kind and doc_type == "report" and KIND_TO_DOC_TYPE.get(report_kind) not in (None, "report"):
        doc_type = KIND_TO_DOC_TYPE[report_kind]
    if family_member_id:
        from app.models.tables import FamilyMember
        if not db.query(FamilyMember).filter_by(id=family_member_id, owner_id=user.id).first():
            raise HTTPException(status_code=400, detail="Unknown family member")
    data = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large (max {settings.MAX_UPLOAD_MB} MB)")
    if file.content_type not in ALLOWED and not (file.filename or "").lower().endswith(
        (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp", ".txt")
    ):
        raise HTTPException(status_code=400, detail="Unsupported file type")

    upload_dir = Path(settings.UPLOAD_DIR) / user.id
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = (file.filename or "upload").replace("/", "_").replace("\\", "_")
    # prefix to avoid collisions
    import uuid as _uuid
    stored = f"{_uuid.uuid4().hex[:8]}_{safe_name}"
    dest = upload_dir / stored
    dest.write_bytes(data)

    ocr_text = extract_text(data, file.content_type, file.filename or "")
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
    # auto lab-value analysis -> health alerts + notification
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
    from app.services.report_kinds import valid_category as _valid_cat, valid_kind as _valid_kind
    if data.category is not None and not _valid_cat(data.category):
        raise HTTPException(status_code=400, detail="Invalid category")
    if data.report_kind is not None and not _valid_kind(data.report_kind):
        raise HTTPException(status_code=400, detail="Invalid report_kind")
    last = db.query(DocumentVersion).filter_by(document_id=doc.id).order_by(DocumentVersion.version_no.desc()).first()
    next_no = (last.version_no + 1) if last else 1
    db.add(DocumentVersion(
        document_id=doc.id, version_no=next_no, title=doc.title, notes=doc.notes,
        visit_date=doc.visit_date, doctor_name=doc.doctor_name, hospital=doc.hospital,
        ocr_text=doc.ocr_text,
    ))
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
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


@router.delete("/{doc_id}", status_code=204)
def delete_doc(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(Document).filter_by(id=doc_id).first()
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        Path(doc.file_path).unlink(missing_ok=True)
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
    text, findings, model = summarize_document(doc.title, doc.doc_type, doc.ocr_text or "", language)
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
