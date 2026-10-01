"""Hospital-ops schema: receptionist/nurse-ready archive flags, ABHA linking,
doctor department/qualification, billing invoices + pharmacy inventory.

Revision ID: 0002_hospital_ops
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "0002_hospital_ops"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

# (table, column, DDL type fragment) for columns on pre-existing tables.
COLUMNS: list[tuple[str, str, str]] = [
    ("users", "is_archived", "BOOLEAN DEFAULT FALSE"),
    ("users", "archived_at", "TIMESTAMP"),
    ("patient_profiles", "abha_id", "VARCHAR(100)"),
    ("patient_profiles", "abha_address", "VARCHAR(255)"),
    ("patient_profiles", "aadhaar_masked", "VARCHAR(20)"),
    ("doctor_profiles", "department", "VARCHAR(255)"),
    ("doctor_profiles", "qualification", "TEXT"),
    ("doctor_profiles", "registration_council", "VARCHAR(255)"),
]

INDEXES: list[tuple[str, str, str]] = [
    ("ix_inv_patient_status_created", "invoices", "(patient_id, status, created_at)"),
    ("ix_inv_receipt", "invoices", "(receipt_no)"),
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
        if is_pg:
            bind.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {ddl}"))
        else:
            bind.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

    for table, col, ddl in COLUMNS:
        add(table, col, ddl)


def upgrade() -> None:
    from app.db.base import Base

    # New tables (invoices, pharmacy_items, pharmacy_dispenses); checkfirst-safe.
    Base.metadata.create_all(bind=op.get_bind())
    _add_missing_columns()
    existing = set(inspect(op.get_bind()).get_table_names())
    for name, table, cols in INDEXES:
        if table not in existing:
            continue
        op.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {cols}"))
    if "users" in existing:
        op.execute(text("UPDATE users SET is_archived = FALSE WHERE is_archived IS NULL"))


def downgrade() -> None:
    for name, _table, _cols in INDEXES:
        op.execute(text(f"DROP INDEX IF EXISTS {name}"))
    # Data tables/columns left in place (never drop billing/pharmacy data).
