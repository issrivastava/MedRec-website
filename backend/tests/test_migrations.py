"""Migration smoke test: baseline revision upgrades a stale SQLite copy.

Uses a tmp database (never the dev DB). Run from backend/:  pytest
"""

from sqlalchemy import create_engine, inspect, text

from app.db.migrations import run_migrations


def test_baseline_upgrades_stale_sqlite(tmp_path):
    db = tmp_path / "stale.db"
    # Simulate a pre-migration database: users table without newer columns.
    eng = create_engine(f"sqlite:///{db}")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, email VARCHAR(255))"))

    run_migrations(eng)

    with eng.connect() as c:
        version = c.execute(text("select version_num from alembic_version")).scalar()
    assert version == "0007_invoice_referred_by"
    cols = [c["name"] for c in inspect(eng).get_columns("users")]
    for expected in ("avatar_path", "firebase_uid", "phone", "token_version", "health_id",
                     "is_archived", "archived_at"):
        assert expected in cols


def test_baseline_on_fresh_sqlite(tmp_path):
    db = tmp_path / "fresh.db"
    eng = create_engine(f"sqlite:///{db}")

    run_migrations(eng)

    tables = set(inspect(eng).get_table_names())
    assert {"users", "documents", "appointments", "messages",
            "invoices", "pharmacy_items", "pharmacy_dispenses",
            "document_pages", "medication_reminders"} <= tables
    # Removed duplicate features stay dropped.
    assert not ({"site_reviews", "second_opinions",
                 "doctor_broadcasts", "pre_visits"} & tables)
    cols = [c["name"] for c in inspect(eng).get_columns("invoices")]
    assert "upi_ref" in cols
    assert "category" in cols
    assert "referred_by" in cols
    vcols = [c["name"] for c in inspect(eng).get_columns("visit_notes")]
    assert "vitals" in vcols
