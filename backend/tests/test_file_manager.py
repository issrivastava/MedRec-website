"""File-manager sidebar counts: GET /documents/stats aggregates per kind.

Uses an isolated sqlite DB (never the dev database).
Run from backend/:  .venv\\Scripts\\python -m pytest tests/ -q
"""
import app.models.tables as _tables  # noqa: F401 — register all models on Base
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes import documents as documents_routes
from app.core.deps import get_current_user
from app.db.session import Base, get_db
from app.models.tables import Document, User

app = FastAPI()
app.include_router(documents_routes.router, prefix="/documents")


def _client(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path}/fm.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    factory = sessionmaker(bind=eng)
    db = factory()
    u = User(email="fm@test.com", hashed_password="x", full_name="Fm", role="patient")
    db.add(u)
    db.commit()
    db.refresh(u)
    uid = u.id
    db.add_all([
        Document(owner_id=uid, title="CBC Jan", doc_type="lab", category="lab",
                 report_kind="cbc", file_path="a.pdf", file_mimetype="application/pdf", file_size=10),
        Document(owner_id=uid, title="CBC Feb", doc_type="lab", category="lab",
                 report_kind="cbc", file_path="b.pdf", file_mimetype="application/pdf", file_size=10),
        Document(owner_id=uid, title="Knee MRI", doc_type="scan", category="imaging",
                 report_kind="mri", file_path="c.pdf", file_mimetype="application/pdf", file_size=10),
        Document(owner_id=uid, title="Old scan", doc_type="scan",
                 file_path="d.pdf", file_mimetype="application/pdf", file_size=10),
    ])
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

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    return TestClient(app, raise_server_exceptions=False)


def test_doc_stats_counts_per_kind(tmp_path):
    r = _client(tmp_path).get("/documents/stats")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 4
    assert body["by_kind"] == {"cbc": 2, "mri": 1}
    assert body["by_type"] == {"lab": 2, "scan": 2}


def test_overall_summary_pdf_renders(tmp_path):
    client = _client(tmp_path)
    r = client.post("/documents/patient/overall-summary/pdf",
                    json={"text": "Overview line one.\n\nKey finding: all well.", "language": "en"})
    assert r.status_code == 200, r.text[:200]
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
    # Too short → rejected, not a blank PDF.
    r = client.post("/documents/patient/overall-summary/pdf",
                    json={"text": "tiny", "language": "en"})
    assert r.status_code == 422
