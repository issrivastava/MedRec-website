"""Ollama local-LLM summarizer with a safe offline fallback."""
from __future__ import annotations
import httpx
from app.core.config import settings

SYSTEM_PROMPT = (
    "You are MedRec, a careful medical-document assistant. Summarize the clinical document "
    "for a patient in plain language. You are NOT giving a diagnosis — only summarizing what "
    "the document says. Structure: 1) One-line overview 2) Key findings (bullets) "
    "3) Medications / advice mentioned 4) Suggested follow-ups to discuss with a doctor. "
    "If values look abnormal, say 'discuss with your doctor' instead of diagnosing."
)

LANG_NAMES = {
    "en": "English", "hi": "Hindi (Devanagari script)", "hinglish": "Hinglish (Hindi in Latin script)",
    "mr": "Marathi", "ta": "Tamil", "te": "Telugu", "bn": "Bengali",
    "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam",
}


def _lang_instruction(language: str) -> str:
    name = LANG_NAMES.get((language or "en").lower(), "English")
    if name == "English":
        return ""
    return f" IMPORTANT: Write the ENTIRE summary in {name}."


def _fallback_summary(title: str, doc_type: str, ocr_text: str, language: str = "en") -> tuple[str, list[str], str]:
    snippet = (ocr_text or "").strip().replace("\n", " ")[:600]
    findings = []
    if snippet:
        findings = [snippet[:280]]
    else:
        findings = ["No machine-readable text was found in the upload (scan may be image-only)."]
    lang_note = "" if (language or "en").lower() == "en" else (
        f" (Requested language '{language}' needs Ollama running — showing English offline summary.)")
    text = (
        f"Overview: '{title}' ({doc_type}) has been stored. "
        f"Ollama is not reachable, so this is an offline extractive summary.{lang_note}\n\n"
        f"Key findings:\n- " + "\n- ".join(findings) + "\n\n"
        "Medications / advice: see original document.\n"
        "Follow-up: please review this document with your doctor."
    )
    return text, findings, "offline-extractive-fallback"


def summarize_document(title: str, doc_type: str, ocr_text: str, language: str = "en") -> tuple[str, list[str], str]:
    """Returns (summary_text, key_findings, model_used)."""
    prompt = (
        f"{SYSTEM_PROMPT}{_lang_instruction(language)}\n\nDocument title: {title}\nType: {doc_type}\n\n"
        f"Extracted text:\n{(ocr_text or '[no text extracted]')[:6000]}"
    )
    try:
        with httpx.Client(timeout=settings.OLLAMA_TIMEOUT_SEC) as client:
            r = client.post(
                f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate",
                json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
            )
            r.raise_for_status()
            data = r.json()
            text = (data.get("response") or "").strip()
            if not text:
                raise ValueError("empty Ollama response")
            # naive key-findings: first bullet-ish lines
            findings = [ln.strip("-•* ").strip() for ln in text.splitlines() if ln.strip()][:6]
            return text, findings, settings.OLLAMA_MODEL
    except Exception:
        return _fallback_summary(title, doc_type, ocr_text, language)


def summarize_overall(patient_name: str, docs: list[dict], language: str = "en") -> tuple[str, int, str]:
    """Summarize up to N recent documents into one health overview."""
    if not docs:
        return "No documents uploaded yet.", 0, settings.OLLAMA_MODEL
    joined = "\n\n---\n\n".join(
        f"Title: {d.get('title')} | Type: {d.get('doc_type')} | Date: {d.get('visit_date')}\n{(d.get('ocr_text') or '')[:1500]}"
        for d in docs[:8]
    )
    prompt = (
        f"{SYSTEM_PROMPT}{_lang_instruction(language)}\n\nPatient: {patient_name}\nSummarize these {min(len(docs), 8)} documents "
        f"into an overall health timeline + what to discuss with a doctor:\n\n{joined}"
    )
    try:
        with httpx.Client(timeout=settings.OLLAMA_TIMEOUT_SEC) as client:
            r = client.post(
                f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate",
                json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
            )
            r.raise_for_status()
            text = (r.json().get("response") or "").strip()
            if not text:
                raise ValueError("empty Ollama response")
            return text, min(len(docs), 8), settings.OLLAMA_MODEL
    except Exception:
        fb, _, _ = _fallback_summary(f"{len(docs)} documents", "overall", joined[:2000], language)
        return fb, len(docs), "offline-extractive-fallback"
