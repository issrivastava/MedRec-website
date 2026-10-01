"""Vectorless page-index RAG: BM25 ranking, snippets, page extraction, index round-trip.

No embeddings, no network — all pure functions + local sqlite.
Run from backend/:  .venv\\Scripts\\python -m pytest tests/ -q
"""
import app.models.tables as _tables  # noqa: F401 — register all models on Base
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes import assistant as assistant_routes
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import Base, get_db
from app.models.tables import Document, DocumentPage, User
from app.services.ocr import extract_pages
from app.services.page_rag import (
    bm25_scores, build_page_index, load_patient_pages, make_snippet,
    retrieve, tokenize,
)

PAGES = [
    {"document_id": "d1", "title": "CBC Report", "page_no": 1,
     "text": "Hemoglobin 13.5 g/dL. White blood cells 6500. Platelets normal."},
    {"document_id": "d2", "title": "Lipid Profile", "page_no": 1,
     "text": "Total cholesterol 210 mg/dL. HDL 45. Triglycerides 160."},
    {"document_id": "d2", "title": "Lipid Profile", "page_no": 2,
     "text": "LDL cholesterol 130 mg/dL. Doctor advises diet control and retest."},
]


def test_tokenize_keeps_medical_terms_and_numbers():
    toks = tokenize("HbA1c 7.2% TSH report")
    assert "hba1c" in toks and "7.2" in toks and "tsh" in toks
    assert "the" not in tokenize("the report")  # stopwords dropped


def test_bm25_ranks_rare_term_page_first():
    tokenized = [{**p, "tokens": tokenize(p["text"])} for p in PAGES]
    scores = bm25_scores(tokenize("hemoglobin"), tokenized)
    assert scores[0] > scores[1] and scores[0] > scores[2]


def test_retrieve_returns_cited_hits():
    hits = retrieve(PAGES, "What is my LDL cholesterol?", top_k=5)
    assert hits
    assert hits[0]["document_id"] == "d2" and hits[0]["page_no"] == 2
    assert all(h["score"] > 0 for h in hits)
    assert all(h["snippet"] for h in hits)


def test_retrieve_empty_on_no_overlap():
    assert retrieve(PAGES, "appointment booking timing", top_k=5) == []
    assert retrieve([], "hba1c") == []


def test_snippet_centers_on_query_terms():
    text = ("General health checkup. All vitals stable. " * 10 +
            "HbA1c is 7.2 percent indicating diabetes control needs review. " +
            "Patient advised followup. " * 5)
    snip = make_snippet(text, ["hba1c"])
    assert "hba1c" in snip.lower() and len(snip) <= 400


def test_extract_pages_from_pdf_keeps_page_numbers():
    import fitz
    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text((72, 72), "Hemoglobin 13.5 g/dL page one")
    p2 = doc.new_page()
    p2.insert_text((72, 72), "Cholesterol 210 mg/dL page two")
    raw = doc.tobytes()
    pages = extract_pages(raw, "application/pdf", "labs.pdf")
    assert [p["page"] for p in pages] == [1, 2]
    assert "Hemoglobin" in pages[0]["text"] and "Cholesterol" in pages[1]["text"]


def test_page_index_roundtrip_sqlite(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path}/rag.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    factory = sessionmaker(bind=eng)
    db = factory()
    u = User(email="rag@test.com", hashed_password="x", full_name="Rag", role="patient")
    db.add(u)
    db.commit()
    db.refresh(u)
    doc = Document(owner_id=u.id, title="CBC Report", doc_type="lab",
                   file_path="dummy.txt", file_mimetype="text/plain", file_size=10,
                   ocr_text="Hemoglobin 13.5 g/dL")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    n = build_page_index(db, doc, b"Hemoglobin 13.5 g/dL plain text body")
    assert n == 1
    assert db.query(DocumentPage).filter_by(document_id=doc.id).count() == 1
    loaded = load_patient_pages(db, u.id)
    assert len(loaded) == 1 and loaded[0]["title"] == "CBC Report"
    hits = retrieve(loaded, "hemoglobin value?", top_k=5)
    assert hits and hits[0]["page_no"] == 1
    db.close()


_rag_app = FastAPI()
_rag_app.include_router(assistant_routes.router)


def _rag_client(tmp_path, monkeypatch):
    """Isolated app for POST /ask-records: seeded user + indexed pages."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")  # force offline path, no network
    db_file = tmp_path / "ask_records.db"
    eng = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    factory = sessionmaker(bind=eng)
    db = factory()
    user = User(email="ask@test.com", hashed_password="x", full_name="Ask", role="patient")
    db.add(user)
    db.commit()
    db.refresh(user)
    uid = user.id
    doc = Document(owner_id=uid, title="CBC Report", doc_type="lab",
                   file_path="dummy.txt", file_mimetype="text/plain", file_size=10,
                   ocr_text="Hemoglobin 13.5 g/dL")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    db.add(DocumentPage(document_id=doc.id, owner_id=uid, page_no=1,
                        text="Hemoglobin 13.5 g/dL. WBC 6500.", chars=30))
    db.add(DocumentPage(document_id=doc.id, owner_id=uid, page_no=2,
                        text="Platelets 250000. Doctor advises retest.", chars=40))
    db.commit()
    db.close()

    def override_db():
        d = factory()
        try:
            yield d
        finally:
            d.close()

    def override_user():
        d = factory()
        try:
            return d.query(User).filter_by(id=uid).first()
        finally:
            d.close()

    _rag_app.dependency_overrides[get_db] = override_db
    _rag_app.dependency_overrides[get_current_user] = override_user
    return TestClient(_rag_app, raise_server_exceptions=False)


def test_ask_records_returns_cited_answer_offline(tmp_path, monkeypatch):
    client = _rag_client(tmp_path, monkeypatch)
    r = client.post("/ask-records", json={"question": "What is my hemoglobin?", "top_k": 5})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["used_records"] is True
    assert body["citations"], "expected page citations for display"
    assert body["citations"][0]["title"] == "CBC Report"
    assert body["citations"][0]["page"] == 1
    assert "hemoglobin" in body["answer"].lower()


def test_ask_records_no_match_is_clean_200(tmp_path, monkeypatch):
    client = _rag_client(tmp_path, monkeypatch)
    r = client.post("/ask-records", json={"question": "appointment booking timing xyzzy", "top_k": 5})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["citations"] == [] and body["used_records"] is False
