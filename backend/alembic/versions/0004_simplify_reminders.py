"""Simplify + refill/reminder loop: new medication_reminders table, UPI ref on
invoices, and DROP the tables of removed duplicate features
(site_reviews, second_opinions, doctor_broadcasts, pre_visits).

Revision ID: 0004_simplify_reminders
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "0004_simplify_reminders"
down_revision = "0003_page_index"
branch_labels = None
depends_on = None

DROPPED_TABLES = ("site_reviews", "second_opinions", "doctor_broadcasts", "pre_visits")

INDEXES: list[tuple[str, str, str]] = [
    ("ix_medrem_owner_active", "medication_reminders", "(owner_id, active)"),
]


def upgrade() -> None:
    from app.db.base import Base

    # New tables (checkfirst-safe on fresh + pre-existing databases).
    Base.metadata.create_all(bind=op.get_bind())
    bind = op.get_bind()
    insp = inspect(bind)
    existing = set(insp.get_table_names())
    is_pg = bind.dialect.name == "postgresql"

    # UPI collect ref on pre-existing invoices tables (ADD COLUMN, idempotent).
    if "invoices" in existing:
        cols = [c["name"] for c in insp.get_columns("invoices")]
        if "upi_ref" not in cols:
            if is_pg:
                bind.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS upi_ref VARCHAR(100)"))
            else:
                bind.execute(text("ALTER TABLE invoices ADD COLUMN upi_ref VARCHAR(100)"))

    for name, table, cols in INDEXES:
        if table not in existing and table not in set(inspect(bind).get_table_names()):
            continue
        op.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {cols}"))

    # Drop tables of features removed as duplicates (data-free lookups;
    # user-facing content like reviews/announcements is untouched).
    for table in DROPPED_TABLES:
        try:
            bind.execute(text(f"DROP TABLE IF EXISTS {table}"))
        except Exception:
            pass


def downgrade() -> None:
    for name, _table, _cols in INDEXES:
        op.execute(text(f"DROP INDEX IF EXISTS {name}"))
    # medication_reminders / upi_ref left in place (never drop patient data).
