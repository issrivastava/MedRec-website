"""Ollama local-LLM engine with multi-model fallback + vision support.

Model chain for text tasks: active model -> fallback model -> Gemini (if key) -> offline.
Vision tasks (scan photos): vision model reads the image directly, no OCR needed.

Recommended pulls for best document understanding:
  ollama pull qwen2.5:7b    (~4.7GB, sharper extraction/classification)
  ollama pull moondream     (~1.7GB, tiny vision model for scan photos)
"""
from __future__ import annotations
import base64
import json
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


def _fallback_summary(title: str, doc_type: str, ocr_text: str, language: str = "en",
                      reason: str = "unreachable") -> tuple[str, list[str], str]:
    snippet = (ocr_text or "").strip().replace("\n", " ")[:600]
    if snippet:
        findings = [snippet[:280]]
    elif reason == "no-text":
        findings = ["The upload contains no machine-readable text (empty file, photo/scan without OCR, or video)."]
    else:
        findings = ["No machine-readable text was found in the upload (scan may be image-only)."]
    lang_note = "" if (language or "en").lower() == "en" else (
        f" (Requested language '{language}' needs Ollama running — showing English offline summary.)")
    if reason == "no-text":
        why = ("Ollama was not asked because there is no text to summarize. "
               "Re-upload a clear photo/PDF (or install Tesseract for image OCR — see ai-status).")
    else:
        why = "Ollama is not reachable, so this is an offline extractive summary."
    text = (
        f"Overview: '{title}' ({doc_type}) has been stored. {why}{lang_note}\n\n"
        f"Key findings:\n- " + "\n- ".join(findings) + "\n\n"
        "Medications / advice: see original document.\n"
        "Follow-up: please review this document with your doctor."
    )
    return text, findings, "offline-extractive-fallback"


def ping(timeout_sec: float = 3.0) -> tuple[bool, str]:
    """Quick Ollama reachability check. Returns (ok, detail)."""
    try:
        with httpx.Client(timeout=timeout_sec) as client:
            r = client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
            r.raise_for_status()
            models = [m.get("name", "") for m in (r.json().get("models") or [])]
            has_model = any(settings.OLLAMA_MODEL in m for m in models)
            detail = f"model {settings.OLLAMA_MODEL} ready" if has_model else (
                f"reachable but model {settings.OLLAMA_MODEL} not pulled "
                f"(run: ollama pull {settings.OLLAMA_MODEL}); available: {', '.join(models) or 'none'}")
            return True, detail
    except Exception as exc:
        return False, f"not reachable at {settings.OLLAMA_BASE_URL} ({type(exc).__name__})"


def tesseract_available() -> bool:
    # ocr.tesseract_exe() also checks the default Windows install folders,
    # since the UB-Mannheim installer doesn't add itself to PATH.
    try:
        from app.services.ocr import tesseract_exe
        return tesseract_exe() is not None
    except Exception:
        import shutil
        return shutil.which("tesseract") is not None


# ---------------------------------------------------------------------------
# Multi-model engine
# ---------------------------------------------------------------------------

_MODEL_OVERRIDE: str | None = None  # runtime switch via POST /api/documents/ai-model


def active_model() -> str:
    return _MODEL_OVERRIDE or settings.OLLAMA_MODEL


def set_active_model(name: str) -> str:
    global _MODEL_OVERRIDE
    available = list_local_models()
    short = {m.split(":")[0]: m for m in available}
    if name not in available and name not in short:
        raise ValueError(f"Model '{name}' is not pulled. Available: {', '.join(available) or 'none'}. "
                         f"Pull it first: ollama pull {name}")
    _MODEL_OVERRIDE = short.get(name, name)
    return _MODEL_OVERRIDE


def list_local_models() -> list[str]:
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
            r.raise_for_status()
            return [m.get("name", "") for m in (r.json().get("models") or []) if m.get("name")]
    except Exception:
        return []


_VISION_HINTS = ("vision", "llava", "moondream", "minicpm-v", ":vl", "vl-", "qwen2.5vl", "qwen3-vl", "bakllava")


def vision_model_name() -> str | None:
    """Configured vision model if pulled, else any pulled vision-capable model."""
    pulled = list_local_models()
    want = settings.OLLAMA_VISION_MODEL
    for m in pulled:
        if want in m:
            return m
    for m in pulled:
        if any(h in m.lower() for h in _VISION_HINTS):
            return m
    return None


def _raw_generate(prompt: str, model: str, images: list[str] | None = None,
                  timeout: int | None = None, json_mode: bool = False,
                  num_predict: int | None = None) -> str:
    payload: dict = {"model": model, "prompt": prompt, "stream": False}
    if images:
        payload["images"] = images
    options: dict = {}
    if json_mode:
        # Ollama constrained decoding: forces valid JSON, temperature 0 for
        # deterministic classification. Ignored by Gemini path (not used here).
        payload["format"] = "json"
        options["temperature"] = 0
    if num_predict:
        # Bound output length: small models can otherwise ramble/loop for
        # minutes (e.g. repeating one lab value), hanging the UI.
        options["num_predict"] = num_predict
    if options:
        payload["options"] = options
    with httpx.Client(timeout=timeout or settings.OLLAMA_TIMEOUT_SEC) as client:
        r = client.post(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate", json=payload)
        r.raise_for_status()
        text = (r.json().get("response") or "").strip()
    if not text:
        raise ValueError(f"empty response from {model}")
    return text


def _gemini_text(prompt: str) -> str:
    """Optional cloud fallback — needs free GEMINI_API_KEY."""
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("no Gemini key")
    import httpx as _hx
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{settings.GEMINI_MODEL}:generateContent")
    with _hx.Client(timeout=settings.GEMINI_TIMEOUT_SEC) as client:
        r = client.post(url, params={"key": settings.GEMINI_API_KEY}, json={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 1500, "temperature": 0.2},
        })
        r.raise_for_status()
        cands = r.json().get("candidates") or []
        parts = ((cands[0].get("content") or {}).get("parts") or []) if cands else []
        text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise ValueError("empty Gemini response")
    return text


def generate_text(prompt: str, images: list[str] | None = None, json_mode: bool = False,
                  num_predict: int | None = None) -> tuple[str, str]:
    """Run prompt through the model chain. Returns (text, model_used) or raises."""
    tried: list[str] = []
    for model in [active_model(), settings.OLLAMA_FALLBACK_MODEL]:
        if not model or model in tried:
            continue
        tried.append(model)
        try:
            return _raw_generate(prompt, model, images,
                                 timeout=settings.OLLAMA_UNDERSTAND_TIMEOUT_SEC if images else None,
                                 json_mode=json_mode, num_predict=num_predict), model
        except Exception:
            continue
    try:
        return _gemini_text(prompt), f"gemini:{settings.GEMINI_MODEL}"
    except Exception:
        pass
    raise RuntimeError(f"All models failed ({', '.join(tried)}); "
                       "start Ollama, pull a model, or set GEMINI_API_KEY.")


def summarize_document(title: str, doc_type: str, ocr_text: str, language: str = "en",
                       meta: dict | None = None) -> tuple[str, list[str], str]:
    """Returns (summary_text, key_findings, model_used).

    meta (doctor_name, hospital, visit_date, notes, category, report_kind) is
    always included so the model can say something useful even when OCR
    extracted no text (photo/scan/video) instead of refusing."""
    meta = meta or {}
    meta_lines = "\n".join(
        f"{k}: {v}" for k, v in [
            ("Doctor", meta.get("doctor_name")), ("Hospital", meta.get("hospital")),
            ("Visit date", meta.get("visit_date")), ("Category", meta.get("category")),
            ("Report kind", meta.get("report_kind")), ("Patient notes", meta.get("notes")),
        ] if v
    )
    extracted = (ocr_text or "").strip()
    if extracted:
        body = f"Extracted text:\n{extracted[:6000]}"
    else:
        body = ("No machine-readable text could be extracted from the file "
                "(it may be an empty file, a photo/scan without OCR software, or a video). "
                "Do NOT say you cannot help. Instead: 1) state what the document appears to be "
                "from its title/metadata, 2) list what is known from the metadata, "
                "3) clearly advise uploading a clear photo/PDF or typed text so a full summary is possible, "
                "4) suggest what to discuss with the doctor.")
    prompt = (
        f"{SYSTEM_PROMPT}{_lang_instruction(language)}\n\nDocument title: {title}\nType: {doc_type}\n"
        f"{meta_lines}\n\n{body}"
    )
    try:
        text, model = generate_text(prompt, num_predict=900)
        # naive key-findings: first bullet-ish lines
        findings = [ln.strip("-•* ").strip() for ln in text.splitlines() if ln.strip()][:6]
        return text, findings, model
    except Exception:
        reason = "no-text" if not (ocr_text or "").strip() else "unreachable"
        return _fallback_summary(title, doc_type, ocr_text, language, reason)


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
        text, model = generate_text(prompt, num_predict=1200)
        return text, min(len(docs), 8), model
    except Exception:
        fb, _, _ = _fallback_summary(f"{len(docs)} documents", "overall", joined[:2000], language,
                                     "no-text" if not joined.strip() else "unreachable")
        return fb, len(docs), "offline-extractive-fallback"


# ---------------------------------------------------------------------------
# Document understanding: classify type + extract key facts as strict JSON.
# ---------------------------------------------------------------------------

UNDERSTAND_PROMPT = """You are a medical-document classifier. Read the document text (or image) and reply with ONLY valid JSON, no markdown, no extra text, exactly these keys:
{
  "doc_type": "report|prescription|lab|scan|other",
  "category": "lab|imaging|cardiology|prescription|other",
  "report_kind": "one of: cbc,tsh,lft,kft,lipid,hba1c,blood_sugar,urine,vitamin_d,esr_crp,other_lab,xray,mri,ct,ultrasound,mammography,pet,dexa,other_imaging,ecg,echo,stress_test,holter,prescription,discharge_summary,consultation,vaccination,operative_note,biopsy,general_report,scan_copy,other",
  "confidence": "high|medium|low",
  "one_line": "one plain-language sentence saying what this document is",
  "doctor_name": "doctor name or null",
  "hospital": "hospital/lab name or null",
  "visit_date": "YYYY-MM-DD or null",
  "key_values": [{"test": "name", "value": "as written", "unit": "or null", "flag": "low|high|normal|null"}],
  "medicines": [{"name": "name", "dosage": "or null", "frequency": "or null", "duration": "or null"}]
}
Rules: lab numbers go in key_values (max 12). Prescribed drugs go in medicines (max 12). Use null when unsure. Never invent values not present. You are NOT diagnosing."""


def _parse_understand_json(text: str) -> dict:
    import re as _re
    t = (text or "").strip()
    # Strip markdown code fences: ```json ... ``` or ``` ... ```
    # (old code used t.strip("`") which also mangled edge cases)
    fence = _re.search(r"```(?:json)?\s*(.*?)```", t, _re.DOTALL | _re.IGNORECASE)
    if fence:
        t = fence.group(1).strip()
    elif t.startswith("```"):
        t = _re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = _re.sub(r"\s*```$", "", t)
    # Find the JSON object span
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no JSON object in model reply")
    candidate = t[start:end + 1]
    # Repair common LLM mistakes: trailing commas before } or ]
    candidate = _re.sub(r",\s*([}\]])", r"\1", candidate)
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        # Second chance: try the largest {...} block greedily re-scanned
        # (handles preamble/epilogue text around the JSON).
        inner_start = candidate.find("{")
        inner_end = candidate.rfind("}")
        if inner_start > 0 or inner_end < len(candidate) - 1:
            trimmed = candidate[inner_start:inner_end + 1]
            trimmed = _re.sub(r",\s*([}\]])", r"\1", trimmed)
            data = json.loads(trimmed)  # raises with real syntax error if still bad
        else:
            raise
    # validate enums against the app taxonomy; kind is authoritative and
    # ALWAYS re-derives category + doc_type so AI can never store
    # kind=prescription with doc_type=report.
    from app.services.report_kinds import CATEGORIES, KIND_TO_CATEGORY, KIND_TO_DOC_TYPE
    if data.get("doc_type") not in ("report", "prescription", "lab", "scan", "other"):
        data["doc_type"] = "report"
    if data.get("category") not in CATEGORIES:
        data["category"] = None
    kind = data.get("report_kind")
    if kind not in KIND_TO_CATEGORY:
        data["report_kind"] = None
    else:
        data["category"] = KIND_TO_CATEGORY[kind]
        data["doc_type"] = KIND_TO_DOC_TYPE[kind]
    if data.get("confidence") not in ("high", "medium", "low"):
        data["confidence"] = "low"
    for key in ("key_values", "medicines"):
        if not isinstance(data.get(key), list):
            data[key] = []
        # Dedupe looping-model repeats: same test+value (or medicine name)
        # emitted over and over counts once.
        uniq: list = []
        seen_kv: set = set()
        for item in data[key]:
            if not isinstance(item, dict):
                continue
            if key == "key_values":
                ident = (str(item.get("test") or "").strip().lower(),
                         str(item.get("value") or "").strip().lower())
            else:
                ident = (str(item.get("name") or "").strip().lower(),)
            if not any(ident) or ident in seen_kv:
                continue
            seen_kv.add(ident)
            uniq.append(item)
            if len(uniq) >= 12:
                break
        data[key] = uniq
    for key in ("one_line", "doctor_name", "hospital", "visit_date"):
        if data.get(key) is not None:
            data[key] = str(data[key])[:300]
    return data


def _norm_line(s: str) -> str:
    """Normalize a transcription line for loop detection: strip numbering,
    bullets, case and extra whitespace ("12. MCV 28.0" -> "mcv 28.0")."""
    import re as _re3
    norm = _re3.sub(r"^[\(\[]?\d+[.\)\]:\-]+", "", s.strip()).strip()
    norm = _re3.sub(r"^[-*•>]+\s*", "", norm).strip().lower()
    return _re3.sub(r"\s+", " ", norm)


def _collapse_transcription(transcription: str, max_lines: int = 120) -> str:
    """Collapse looping-model repetitions in a vision transcription.

    Handles numbered repeats ("4. MCV 28.0" x160) that raw string comparison
    misses, caps length, and flags a dominant repeated line as unreliable.
    """
    seen: list[str] = []
    seen_norm: set[str] = set()
    norm_counts: dict[str, int] = {}
    for ln in transcription.splitlines():
        s = ln.strip()
        if not s:
            continue
        norm = _norm_line(s)
        if not norm:
            continue
        norm_counts[norm] = norm_counts.get(norm, 0) + 1
        # skip consecutive duplicates AND any line already seen 3+ times
        if seen and _norm_line(seen[-1]) == norm:
            continue
        if norm in seen_norm and norm_counts[norm] > 3:
            continue
        seen.append(s)
        seen_norm.add(norm)
        if len(seen) >= max_lines:  # cap: looping models can emit thousands of lines
            break
    # If one line dominates (>25% of lines or >10 repeats), the model
    # looped — keep first 3 occurrences and drop the rest.
    if norm_counts:
        top_norm, top_n = max(norm_counts.items(), key=lambda kv: kv[1])
        total = sum(norm_counts.values())
        if top_n > 10 or top_n / max(total, 1) > 0.25:
            kept = 0
            filtered: list[str] = []
            for s in seen:
                if _norm_line(s) == top_norm:
                    kept += 1
                    if kept > 3:
                        continue
                filtered.append(s)
            seen = filtered
            seen.append(f"[note: model repeated '{top_norm}' {top_n}x — truncated as unreliable]")
    return "\n".join(seen)[:4000]


def understand_document(ocr_text: str, meta: dict | None = None,
                        image_b64: str | None = None) -> tuple[dict, str, bool]:
    """Classify + extract facts. Returns (data, model_used, vision_used).

    If a vision model is available and image bytes are given, the image is read
    directly (best for scan photos). Otherwise OCR text is used."""
    meta = meta or {}
    vision_used = False
    images = None
    vmodel = vision_model_name() if image_b64 else None
    if vmodel and image_b64:
        # Two-step: small vision models transcribe well but can't do strict JSON,
        # so vision transcribes -> text model classifies.
        try:
            transcription = _raw_generate(
                "Transcribe ALL text you can read in this document image, line by line. "
                "Reply with the transcription only, no commentary. "
                "Stop when the document ends — never repeat a line, maximum 120 lines.",
                vmodel, images=[image_b64], num_predict=1500,
                timeout=settings.OLLAMA_UNDERSTAND_TIMEOUT_SEC).strip()
            if len(transcription) > 30:
                # Collapse looped repetitions small vision models sometimes emit
                # (e.g. "MCV 28.0" x160, often numbered "4. MCV 28.0" so a raw
                # string compare never matches — normalization handles it).
                transcription = _collapse_transcription(transcription)
                ocr_text = ((ocr_text or "") + "\n" + transcription).strip()
                vision_used = True
        except Exception:
            pass  # fall through to text path
    content = (ocr_text or "").strip()
    if not content:
        return {"doc_type": "other", "category": None, "report_kind": None,
                "confidence": "low",
                "one_line": "No readable text — upload a clearer photo/PDF for AI understanding.",
                "doctor_name": None, "hospital": None, "visit_date": None,
                "key_values": [], "medicines": []}, active_model(), vision_used
    prompt = (UNDERSTAND_PROMPT +
              f"\n\nTitle hint: {meta.get('title') or ''}\n\nDocument text:\n{content[:6000]}")
    text: str | None = None
    model: str = active_model()
    try:
        text, model = generate_text(prompt, json_mode=True, num_predict=800)
        return _parse_understand_json(text), model, vision_used
    except (ValueError, json.JSONDecodeError) as parse_exc:
        # Small models sometimes reply with prose ("I cannot...") or malformed
        # JSON despite json_mode. Retry once with an explicit repair prompt.
        if text:
            try:
                repair_prompt = (
                    "Reply with ONLY valid JSON, no markdown, no commentary, using exactly these keys: "
                    "doc_type, category, report_kind, confidence, one_line, doctor_name, hospital, "
                    "visit_date, key_values, medicines.\n\n"
                    f"Previous reply to fix:\n{text[:2000]}"
                )
                text2, model2 = generate_text(repair_prompt, json_mode=True, num_predict=800)
                return _parse_understand_json(text2), model2, vision_used
            except Exception:
                pass
        # Non-blocking fallback: never fail the upload flow with
        # "no JSON object in model reply". Return a low-confidence guess so
        # the frontend can still upload (filename-based kind inference
        # happens separately in report_kinds.infer_kind).
        title_hint = (meta.get("title") or "document").strip()[:80] or "document"
        return {"doc_type": "report", "category": None, "report_kind": None,
                "confidence": "low",
                "one_line": f"{title_hint} — stored (AI classification unclear, please pick type manually)",
                "doctor_name": None, "hospital": None, "visit_date": None,
                "key_values": [], "medicines": [],
                "parse_note": f"model reply was not JSON ({parse_exc})"}, model, vision_used
