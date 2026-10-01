"""Bill types: category column on invoices (consultation, lab, MRI, ...).

Revision ID: 0005_bill_categories
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "0005_bill_categories"
down_revision = "0004_simplify_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.base import Base

    Base.metadata.create_all(bind=op.get_bind())
    bind = op.get_bind()
    insp = inspect(bind)
    existing = set(insp.get_table_names())
    is_pg = bind.dialect.name == "postgresql"

    if "invoices" in existing:
        cols = [c["name"] for c in insp.get_columns("invoices")]
        if "category" not in cols:
            if is_pg:
                bind.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other'"))
            else:
                bind.execute(text("ALTER TABLE invoices ADD COLUMN category VARCHAR(50) DEFAULT 'other'"))
        bind.execute(text("UPDATE invoices SET category = 'other' WHERE category IS NULL"))
        op.execute(text("CREATE INDEX IF NOT EXISTS ix_inv_category ON invoices (category)"))


def downgrade() -> None:
    op.execute(text("DROP INDEX IF EXISTS ix_inv_category"))
    # category column left in place (never drop billing data).
