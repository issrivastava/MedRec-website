"""Vectorless-RAG page index: one row per extracted document page.

Revision ID: 0003_page_index
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "0003_page_index"
down_revision = "0002_hospital_ops"
branch_labels = None
depends_on = None

INDEXES: list[tuple[str, str, str]] = [
    ("ix_docpages_owner_doc_page", "document_pages", "(owner_id, document_id, page_no)"),
]


def upgrade() -> None:
    from app.db.base import Base

    # New table (checkfirst-safe on fresh + pre-existing databases).
    Base.metadata.create_all(bind=op.get_bind())
    existing = set(inspect(op.get_bind()).get_table_names())
    for name, table, cols in INDEXES:
        if table not in existing:
            continue
        op.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {cols}"))
    # Backfill: every document that already has ocr_text gets a single
    # page-1 row so record search works on old uploads too. Batched and
    # idempotent (skips docs that already have pages).
    if "documents" in existing and "document_pages" in existing:
        bind = op.get_bind()
        doc_rows = bind.execute(
            text("SELECT id, owner_id, ocr_text FROM documents "
                 "WHERE ocr_text IS NOT NULL AND TRIM(ocr_text) != ''")
        ).fetchall()
        import uuid as _uuid
        from datetime import datetime as _dt
        done = 0
        for doc_id, owner_id, ocr_text in doc_rows:
            already = bind.execute(
                text("SELECT COUNT(*) FROM document_pages WHERE document_id = :d"),
                {"d": doc_id},
            ).scalar()
            if already:
                continue
            snippet = (ocr_text or "")[:8000]
            bind.execute(
                text("INSERT INTO document_pages (id, document_id, owner_id, page_no, text, chars, created_at) "
                     "VALUES (:id, :doc, :owner, 1, :text, :chars, :now)"),
                {"id": str(_uuid.uuid4()), "doc": doc_id, "owner": owner_id,
                 "text": snippet, "chars": len(snippet), "now": _dt.utcnow()},
            )
            done += 1
            if done % 200 == 0:
                print(f"[MedRec] 0003 backfilled {done} document page indexes…", flush=True)
        if done:
            print(f"[MedRec] 0003 backfilled {done} document page indexes.", flush=True)


def downgrade() -> None:
    for name, _table, _cols in INDEXES:
        op.execute(text(f"DROP INDEX IF EXISTS {name}"))
    # document_pages rows/table left in place (re-derivable, never drop data).
