"""Vectorless RAG over the document page index — no embeddings, no vector DB.

How it works:
  1. Every uploaded document is split into pages at extraction time
     (see ocr.extract_pages) and stored in `document_pages`.
  2. A question is tokenized and each page is scored with BM25
     (k1=1.2, b=0.75 — the classic lexical ranking behind search engines).
  3. Top-k pages become the LLM context, each tagged `[Title p.N]` so the
     answer cites exact pages, and the frontend can display the source
     page + snippet under the answer.

Why vectorless: zero new dependencies, runs fully offline, deterministic,
tiny memory footprint, and page numbers survive as stable citations
(embeddings would need a sidecar vector store + re-embedding on edits).
"""
from __future__ import annotations
import math
import re

K1 = 1.2
B = 0.75

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[./-][a-z0-9]+)*")

# Small English stoplist. Medical tokens (drug names, values, short codes
# like "bp", "tsh", "hba1c", numbers) are deliberately KEPT — they are the
# most discriminative terms in lab reports.
_STOPWORDS = frozenset("""
a an and are as at be but by for from had has have he her his how i in is it its
of on or that the to was were will with you your this these those they them
what when where which who whom whose why how can could should would do does
did done my me we our us our ours report patient name date age sex male female
year years old day days
""".split())


def tokenize(text: str) -> list[str]:
    """Lowercase alphanumeric tokens, stopwords removed, numbers kept."""
    toks = _TOKEN_RE.findall((text or "").lower())
    return [t for t in toks if t not in _STOPWORDS and len(t) > 1 or t.isdigit()]


def _idf(n_docs: int, doc_freq: int) -> float:
    return math.log((n_docs - doc_freq + 0.5) / (doc_freq + 0.5) + 1.0)


def bm25_scores(query_terms: list[str], pages: list[dict]) -> list[float]:
    """Score pre-tokenized pages against query terms. pages[i] needs 'tokens'.

    Returns a parallel list of floats (0.0 = no overlap).
    """
    n = len(pages)
    if n == 0 or not query_terms:
        return [0.0] * n
    qt = set(query_terms)
    df: dict[str, int] = {}
    for p in pages:
        for t in set(p["tokens"]):
            if t in qt:
                df[t] = df.get(t, 0) + 1
    avgdl = sum(len(p["tokens"]) for p in pages) / max(n, 1) or 1.0
    out: list[float] = []
    for p in pages:
        tf: dict[str, int] = {}
        for t in p["tokens"]:
            if t in qt:
                tf[t] = tf.get(t, 0) + 1
        dl = len(p["tokens"]) or 1
        s = 0.0
        for t, f in tf.items():
            idf = _idf(n, df.get(t, 0))
            denom = f + K1 * (1 - B + B * dl / avgdl)
            s += idf * (f * (K1 + 1)) / denom
        out.append(s)
    return out


def retrieve(pages: list[dict], question: str, top_k: int = 5) -> list[dict]:
    """Rank raw pages [{page_id?, document_id?, title?, page_no, text, ...}].

    Returns top-k hits with score > 0, each extended with
    {score, snippet}. Pure function — easy to unit-test.
    """
    q_terms = tokenize(question)
    if not q_terms or not pages:
        return []
    tokenized = [{**p, "tokens": tokenize(p.get("text", ""))} for p in pages]
    scores = bm25_scores(q_terms, tokenized)
    ranked = sorted(zip(scores, tokenized), key=lambda pair: pair[0], reverse=True)
    hits: list[dict] = []
    for score, p in ranked:
        if score <= 0:
            break
        hit = {k: v for k, v in p.items() if k != "tokens"}
        hit["score"] = round(score, 3)
        hit["snippet"] = make_snippet(p.get("text", ""), q_terms)
        hits.append(hit)
        if len(hits) >= max(1, top_k):
            break
    return hits


def make_snippet(text: str, query_terms: list[str], window: int = 320) -> str:
    """Best window around the densest query-term cluster (~2-3 lines for cards)."""
    clean = " ".join((text or "").split())
    if not clean:
        return ""
    low = clean.lower()
    positions: list[int] = []
    for t in set(query_terms):
        start = 0
        while True:
            i = low.find(t, start)
            if i == -1:
                break
            positions.append(i)
            start = i + len(t)
            if len(positions) > 200:
                break
    if not positions:
        return clean[:window] + ("…" if len(clean) > window else "")
    positions.sort()
    # Densest cluster: slide a window over sorted hit positions.
    best_start, best_count = positions[0], 0
    for i, pos in enumerate(positions):
        count = sum(1 for q in positions[i:] if q - pos <= window)
        if count > best_count:
            best_count, best_start = count, pos
    start = max(0, best_start - 60)
    # Snap to word boundaries.
    while start > 0 and clean[start] != " ":
        start -= 1
    end = min(len(clean), start + window)
    while end < len(clean) and clean[end] != " ":
        end += 1
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(clean) else ""
    return prefix + clean[start:end].strip() + suffix


# ---------------------------------------------------------------------------
# DB helpers: (re)build the page index + load a patient's pages for retrieval.
# ---------------------------------------------------------------------------

def build_page_index(db, doc, file_bytes: bytes | None = None) -> int:
    """(Re)build page rows for one Document. Returns page count. Never raises."""
    from app.models.tables import DocumentPage
    from app.services.ocr import extract_pages
    from pathlib import Path
    try:
        db.query(DocumentPage).filter_by(document_id=doc.id).delete(synchronize_session=False)
        db.commit()
        raw = file_bytes
        if raw is None:
            try:
                raw = Path(doc.file_path).read_bytes()
            except Exception:
                return 0
        pages = extract_pages(raw, doc.file_mimetype, Path(doc.file_path or "doc").name)
        if not pages and (doc.ocr_text or "").strip():
            # Old upload / unparseable file: keep it searchable as page 1.
            pages = [{"page": 1, "text": doc.ocr_text.strip()[:8000]}]
        for p in pages:
            db.add(DocumentPage(document_id=doc.id, owner_id=doc.owner_id,
                                page_no=p["page"], text=p["text"], chars=len(p["text"])))
        db.commit()
        return len(pages)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return 0


def load_patient_pages(db, owner_id: str, limit: int = 2000) -> list[dict]:
    """All indexed pages for retrieval, newest documents first."""
    from app.models.tables import DocumentPage, Document
    rows = (
        db.query(DocumentPage, Document)
        .join(Document, Document.id == DocumentPage.document_id)
        .filter(DocumentPage.owner_id == owner_id)
        .order_by(Document.visit_date.desc().nullslast(),
                  Document.created_at.desc(),
                  DocumentPage.page_no.asc())
        .limit(limit)
        .all()
    )
    return [{
        "page_id": pg.id,
        "document_id": doc.id,
        "title": doc.title,
        "doc_type": doc.doc_type,
        "report_kind": getattr(doc, "report_kind", None),
        "visit_date": doc.visit_date.isoformat() if doc.visit_date else None,
        "page_no": pg.page_no,
        "text": pg.text,
    } for pg, doc in rows]


def citation_tag(title: str, page_no: int) -> str:
    short = (title or "Document")[:60]
    return f"[{short} p.{page_no}]"
