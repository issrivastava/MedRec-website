"""AI doubt-solver chat ("Ask AI").

Primary: Google Gemini free tier (https://aistudio.google.com/apikey —
free, no card). Set GEMINI_API_KEY to enable.
Fallback: local Ollama (already used for summaries) — free and offline.
If neither is available, the endpoint returns 503 with setup instructions.

Login is required (any role) so anonymous visitors can't burn the quota.

Endpoints:
  GET  /api/assistant/status   (public — which engine is available)
  POST /api/assistant/ask      (auth — {question, history?} -> {answer, engine})
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.tables import User

router = APIRouter()

SYSTEM = (
    "You are MedRec's friendly health-information assistant. Explain things in "
    "simple, plain language and keep answers concise (under ~200 words unless "
    "the user asks for detail). You are NOT a doctor: never give a diagnosis, "
    "never prescribe medicines or change dosages, and always advise consulting "
    "a qualified doctor for personal medical decisions. If the user describes "
    "an emergency (chest pain, breathlessness, severe bleeding, etc.), tell "
    "them to call their local emergency number immediately. Reply in the same "
    "language the user writes in."
)


class ChatMsg(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=4000)


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    history: list[ChatMsg] = Field(default_factory=list, max_length=12)
    use_records: bool = False
    patient_id: str | None = None  # doctors: which assigned patient to ground on


class AskRecordsIn(BaseModel):
    """Vectorless page-index RAG: question answered ONLY from the patient's
    own document pages (BM25 retrieval, no embeddings)."""
    question: str = Field(min_length=2, max_length=1000)
    patient_id: str | None = None  # doctors/staff: which patient to read
    top_k: int = Field(default=5, ge=1, le=10)


def _history_text(history: list[ChatMsg]) -> str:
    lines = []
    for m in history[-6:]:  # last 3 exchanges keep prompts small
        who = "User" if m.role == "user" else "Assistant"
        lines.append(f"{who}: {m.text[:1000]}")
    return "\n".join(lines)


async def _ask_gemini(question: str, history: list[ChatMsg]) -> str:
    contents = []
    if history:
        contents.append({"role": "user", "parts": [{"text": _history_text(history)}]})
        contents.append({"role": "model", "parts": [{"text": "Understood, continuing."}]})
    contents.append({"role": "user", "parts": [{"text": question}]})
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{settings.GEMINI_MODEL}:generateContent")
    async with httpx.AsyncClient(timeout=settings.GEMINI_TIMEOUT_SEC) as client:
        r = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json={
            "systemInstruction": {"parts": [{"text": SYSTEM}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.4},
        })
        if r.status_code in (400, 403, 404):
            raise RuntimeError(f"Gemini rejected the request ({r.status_code}): "
                               f"{r.text[:200]}. Check GEMINI_API_KEY / GEMINI_MODEL.")
        r.raise_for_status()
        cands = r.json().get("candidates") or []
        parts = ((cands[0].get("content") or {}).get("parts") or []) if cands else []
        text = "".join(p.get("text", "") for p in parts).strip()
        if not text:
            raise RuntimeError("Gemini returned an empty answer.")
        return text


async def _ask_ollama(question: str, history: list[ChatMsg]) -> str:
    prompt = SYSTEM
    if history:
        prompt += "\n\nConversation so far:\n" + _history_text(history)
    prompt += f"\n\nUser: {question}\nAssistant:"
    async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT_SEC) as client:
        r = await client.post(f"{settings.OLLAMA_BASE_URL}/api/generate", json={
            "model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False,
        })
        r.raise_for_status()
        text = (r.json().get("response") or "").strip()
        if not text:
            raise RuntimeError("Ollama returned an empty answer.")
        return text


@router.get("/status")
def assistant_status():
    """Public: which AI engine will answer (no key material leaked)."""
    if settings.GEMINI_API_KEY:
        return {"available": True, "engine": "gemini", "model": settings.GEMINI_MODEL,
                "needs_login": True}
    return {"available": True, "engine": "ollama", "model": settings.OLLAMA_MODEL,
            "needs_login": True,
            "note": "Gemini key not set — local Ollama will answer if running."}


@router.post("/ask")
async def ask_assistant(data: AskIn, user: User = Depends(get_current_user)):
    """Ask a health/app doubt. Auth required. Returns {answer, engine}.

    Pass use_records=true to ground the answer in the patient's own MedRec
    data (recent summaries, vitals, prescriptions). Doctors pass patient_id
    for an assigned patient; patients are auto-scoped to self."""
    from app.db.session import SessionLocal
    records_ctx = ""
    if data.use_records:
        try:
            db = SessionLocal()
            try:
                from app.core.deps import resolve_patient_id
                from app.models.tables import Document, AiSummary, Vital, VisitNote
                pid = resolve_patient_id(db, user, data.patient_id)
                docs = db.query(Document).filter_by(owner_id=pid).order_by(
                    Document.visit_date.desc().nullslast()).limit(5).all()
                parts = []
                # One query for all summaries (was one per document).
                doc_ids = [d.id for d in docs]
                summaries = {s.document_id: s for s in db.query(AiSummary).filter(AiSummary.document_id.in_(doc_ids)).all()} if doc_ids else {}
                for d in docs:
                    s = summaries.get(d.id)
                    snippet = (s.summary_text[:600] if s else (d.ocr_text or "")[:600])
                    parts.append(f"- {d.title} ({d.visit_date}, {d.report_kind or d.doc_type}): {snippet}")
                vitals = db.query(Vital).filter_by(owner_id=pid).order_by(Vital.measured_at.desc()).limit(8).all()
                for v in vitals:
                    if v.vital_type == "bp":
                        parts.append(f"- BP {v.systolic}/{v.diastolic} mmHg on {v.measured_at}")
                    elif v.value is not None:
                        parts.append(f"- {v.vital_type} {v.value} {v.unit or ''} on {v.measured_at}")
                notes = db.query(VisitNote).filter_by(patient_id=pid).order_by(VisitNote.created_at.desc()).limit(3).all()
                for n in notes:
                    parts.append(f"- Dr note [{n.note_type}] {n.title or ''}: {(n.content or '')[:400]}")
                if parts:
                    records_ctx = ("\n\nPatient's own MedRec context (use for grounding, "
                                   "cite dates; never invent values):\n" + "\n".join(parts[:20]))
            finally:
                db.close()
        except Exception:
            records_ctx = ""
    question = data.question + records_ctx if records_ctx else data.question
    errors: list[str] = []
    if settings.GEMINI_API_KEY:
        try:
            return {"answer": await _ask_gemini(question, data.history),
                    "engine": f"gemini:{settings.GEMINI_MODEL}",
                    "used_records": bool(records_ctx),
                    "disclaimer": _DISCLAIMER}
        except Exception as exc:
            errors.append(f"Gemini: {exc}")
    try:
        return {"answer": await _ask_ollama(question, data.history),
                "engine": f"ollama:{settings.OLLAMA_MODEL}",
                "used_records": bool(records_ctx),
                "disclaimer": _DISCLAIMER}
    except Exception as exc:
        errors.append(f"Ollama: {exc}")
    raise HTTPException(
        status_code=503,
        detail=("AI is not available right now. " + " ".join(errors) +
                " To enable it: add a free Gemini key (https://aistudio.google.com/apikey) "
                "as GEMINI_API_KEY in backend/.env, or start Ollama (`ollama serve`)."),
    )


_DISCLAIMER = ("AI answers are informational only — not medical advice. "
               "Always consult your doctor.")


RAG_SYSTEM = (
    "You are MedRec's record-reading assistant. Answer the user's question "
    "USING ONLY the document excerpts below — never invent values, dates, or "
    "findings that are not in the excerpts. Cite every factual claim with its "
    "tag exactly as shown (e.g. [CBC Report p.2]). If the excerpts do not "
    "contain the answer, say so plainly and suggest what to ask the doctor. "
    "You are NOT a doctor: no diagnosis, no prescriptions. Keep it concise "
    "(under ~200 words). Reply in the same language the user writes in."
)


def _rag_prompt(question: str, hits: list[dict]) -> str:
    from app.services.page_rag import citation_tag
    blocks = []
    for h in hits:
        tag = citation_tag(h.get("title", ""), h.get("page_no", 1))
        date = h.get("visit_date") or "undated"
        blocks.append(f"{tag} ({h.get('report_kind') or h.get('doc_type') or 'document'}, {date}):\n"
                      f"{(h.get('text') or '')[:2500]}")
    return (f"{RAG_SYSTEM}\n\n--- Document excerpts ---\n\n" + "\n\n".join(blocks) +
            f"\n\n--- Question ---\n{question}\n\nAnswer with citations:")


def _extractive_answer(question: str, hits: list[dict]) -> str:
    """Offline fallback: show the retrieved pages directly (no LLM needed)."""
    from app.services.page_rag import citation_tag
    lines = [f"Top matching pages for: “{question}”"]
    for h in hits:
        lines.append(f"\n{citation_tag(h.get('title', ''), h.get('page_no', 1))}\n{h.get('snippet', '')}")
    lines.append("\n(Offline extractive answer — start Ollama or set GEMINI_API_KEY for a written summary.)")
    return "\n".join(lines)


@router.post("/ask-records")
async def ask_records(data: AskRecordsIn, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    """Ask a question over the patient's OWN documents via the page index.

    Vectorless RAG: BM25 retrieval over `document_pages` (no embeddings),
    answer grounded ONLY in the retrieved pages with [Title p.N] citations.
    Patients are auto-scoped to self; doctors/staff pass an assigned
    patient_id; admins may pass any. Returns
    {answer, engine, citations: [{document_id, title, page, snippet, score,
    visit_date}], used_records, disclaimer}.
    """
    from app.services.page_rag import retrieve, load_patient_pages
    from app.core.deps import resolve_patient_id
    pid = resolve_patient_id(db, user, data.patient_id)
    pages = load_patient_pages(db, pid)
    hits = retrieve(pages, data.question, top_k=data.top_k)
    if not hits:
        return {"answer": ("No matching pages found in the indexed records. "
                           "Try different words (e.g. a test name like “HbA1c” or “cholesterol”), "
                           "or upload the report first."),
                "engine": "page-index:bm25", "citations": [],
                "used_records": False, "disclaimer": _DISCLAIMER}
    citations = [{
        "document_id": h["document_id"], "title": h["title"],
        "page": h["page_no"], "snippet": h["snippet"], "score": h["score"],
        "visit_date": h.get("visit_date"),
        "report_kind": h.get("report_kind"),
    } for h in hits]
    prompt = _rag_prompt(data.question, hits)
    errors: list[str] = []
    if settings.GEMINI_API_KEY:
        try:
            return {"answer": await _ask_gemini(prompt, []),
                    "engine": f"gemini:{settings.GEMINI_MODEL}+page-index",
                    "citations": citations, "used_records": True,
                    "disclaimer": _DISCLAIMER}
        except Exception as exc:
            errors.append(f"Gemini: {exc}")
    try:
        from app.services.ollama import generate_text
        import asyncio as _asyncio
        answer, model = await _asyncio.to_thread(
            generate_text, prompt, None, False, 600)
        return {"answer": answer, "engine": f"{model}+page-index",
                "citations": citations, "used_records": True,
                "disclaimer": _DISCLAIMER}
    except Exception as exc:
        errors.append(f"Ollama: {exc}")
    # Offline: still display the retrieved pages (the "results" view).
    return {"answer": _extractive_answer(data.question, hits),
            "engine": "page-index:extractive-offline", "citations": citations,
            "used_records": True, "disclaimer": _DISCLAIMER}
