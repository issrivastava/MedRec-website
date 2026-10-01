"""Baseline schema (replaces the old _ensure_columns/_ensure_indexes startup hacks).

Covers every table/column/index the app expects, idempotently, on both
SQLite and Postgres:
  1. create_all for any missing tables (fresh databases),
  2. ADD COLUMN for columns added after a table was first created
     (pre-existing databases), guarded by inspector checks,
  3. CREATE INDEX for the composite indexes, IF NOT EXISTS,
  4. data backfill for users.token_version.

Revision ID: 0001_baseline
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision: str = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

# (table, column, DDL type fragment) — kept in sync with app/models/tables.py
# for any column added after its table first shipped.
COLUMNS: list[tuple[str, str, str]] = [
    ("users", "avatar_path", "VARCHAR(1024)"),
    ("users", "firebase_uid", "VARCHAR(128)"),
    ("users", "phone", "VARCHAR(20)"),
    ("users", "token_version", "INTEGER DEFAULT 0"),
    ("users", "health_id", "VARCHAR(10)"),
    ("otp_codes", "phone", "VARCHAR(20)"),
    ("documents", "family_member_id", "VARCHAR(36)"),
    ("documents", "category", "VARCHAR(50)"),
    ("documents", "report_kind", "VARCHAR(50)"),
    ("ai_summaries", "language", "VARCHAR(10) DEFAULT 'en'"),
    ("visit_notes", "family_member_id", "VARCHAR(36)"),
    ("visit_notes", "diagnosis_code", "VARCHAR(20)"),
    ("visit_notes", "diagnosis_name", "VARCHAR(255)"),
    ("appointments", "family_member_id", "VARCHAR(36)"),
    ("appointments", "consult_type", "VARCHAR(20) DEFAULT 'in_person'"),
    ("appointments", "video_url", "VARCHAR(1024)"),
    ("appointments", "cancel_reason", "VARCHAR(500)"),
    ("appointments", "token_no", "INTEGER"),
    ("appointments", "checked_in", "BOOLEAN DEFAULT FALSE"),
    ("appointments", "checked_in_at", "TIMESTAMP"),
    ("appointments", "fee", "FLOAT"),
    ("appointments", "payment_status", "VARCHAR(20) DEFAULT 'unpaid'"),
    ("health_alerts", "family_member_id", "VARCHAR(36)"),
    ("doctor_profiles", "education", "TEXT"),
    ("doctor_profiles", "experience_years", "INTEGER"),
    ("doctor_profiles", "consultation_fee", "FLOAT"),
    ("doctor_profiles", "languages", "VARCHAR(255)"),
    ("doctor_profiles", "bio", "TEXT"),
    ("doctor_profiles", "clinic_address", "TEXT"),
    ("doctor_profiles", "timings", "VARCHAR(500)"),
    ("family_members", "health_id", "VARCHAR(10)"),
    ("messages", "priority", "VARCHAR(10) DEFAULT 'normal'"),
    ("messages", "category", "VARCHAR(20) DEFAULT 'general'"),
    ("messages", "attachment_document_id", "VARCHAR(36)"),
    ("messages", "sos_detected", "BOOLEAN DEFAULT FALSE"),
    ("messages", "read_at", "TIMESTAMP"),
]

# Shared profile columns living on both patient_profiles and family_members.
PROFILE_COLUMNS: list[tuple[str, str]] = [
    ("height_cm", "FLOAT"), ("weight_kg", "FLOAT"),
    ("marital_status", "VARCHAR(50)"), ("occupation", "VARCHAR(255)"),
    ("smoking_status", "VARCHAR(100)"), ("alcohol_use", "VARCHAR(100)"),
    ("diet", "VARCHAR(100)"), ("activity_level", "VARCHAR(100)"),
    ("past_illnesses", "TEXT"), ("surgeries", "TEXT"),
    ("current_medications", "TEXT"), ("immunizations", "TEXT"),
    ("family_history_text", "TEXT"), ("menstrual_history", "TEXT"),
    ("mental_health", "TEXT"),
]

# (index name, table, columns)
INDEXES: list[tuple[str, str, str]] = [
    ("ix_docs_owner_visit_created", "documents", "(owner_id, visit_date, created_at)"),
    ("ix_docs_owner_doctype", "documents", "(owner_id, doc_type)"),
    ("ix_labs_owner_test_measured", "lab_results", "(owner_id, test_key, measured_at)"),
    ("ix_msg_pair_created", "messages", "(doctor_id, patient_id, created_at)"),
    ("ix_appt_doc_date_status", "appointments", "(doctor_id, date, status, start_time)"),
    ("ix_appt_patient_date", "appointments", "(patient_id, date)"),
    ("ix_notif_user_read_created", "notifications", "(user_id, read, created_at)"),
    ("ix_visit_patient_type_created", "visit_notes", "(patient_id, note_type, created_at)"),
    ("ix_alert_patient_ack", "health_alerts", "(patient_id, acknowledged)"),
    ("ix_vac_owner_status_due", "vaccinations", "(owner_id, status, due_date)"),
    ("ix_otp_purpose_consumed_created", "otp_codes", "(purpose, consumed, created_at)"),
    ("ix_vitals_owner_type_measured", "vitals", "(owner_id, vital_type, measured_at)"),
]


def _add_missing_columns() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())
    is_pg = bind.dialect.name == "postgresql"

    def add(table: str, col: str, ddl: str) -> None:
        if table not in existing_tables:
            return
        cols = [c["name"] for c in insp.get_columns(table)]
        if col in cols:
            return
        # Runs inside the migration transaction (Alembic owns it — never
        # open a nested transaction here). IF NOT EXISTS keeps Postgres
        # re-runs safe if a previous attempt died mid-revision.
        if is_pg:
            bind.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {ddl}"))
        else:
            bind.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

    for table, col, ddl in COLUMNS:
        add(table, col, ddl)
    for table in ("patient_profiles", "family_members"):
        for col, ddl in PROFILE_COLUMNS:
            add(table, col, ddl)


def upgrade() -> None:
    # 1. Fresh databases: create every modeled table (checkfirst, so safe
    #    to run on existing databases too).
    from app.db.base import Base

    Base.metadata.create_all(bind=op.get_bind())
    # 2. Pre-existing databases: backfill columns added after first release.
    _add_missing_columns()
    # 3. Composite indexes (same syntax works on SQLite + Postgres).
    #    Skip tables that don't exist yet (very old databases).
    existing = set(inspect(op.get_bind()).get_table_names())
    for name, table, cols in INDEXES:
        if table not in existing:
            continue
        op.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {cols}"))
    # 4. Data backfill for the non-nullable token_version default.
    if "users" in existing:
        op.execute(text("UPDATE users SET token_version = 0 WHERE token_version IS NULL"))


def downgrade() -> None:
    # Baseline downgrade only drops the composite indexes; added columns
    # are left in place (SQLite cannot DROP COLUMN without a table
    # rebuild, and dropping patient data columns is never safe).
    for name, table, _cols in INDEXES:
        op.execute(text(f"DROP INDEX IF EXISTS {name}"))
