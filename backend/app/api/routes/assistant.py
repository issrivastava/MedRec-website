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

from app.core.config import settings
from app.core.deps import get_current_user
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
                for d in docs:
                    s = db.query(AiSummary).filter_by(document_id=d.id).first()
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
