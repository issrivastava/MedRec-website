"""Invoice referred-by: free-text referring-doctor column on invoices.

Revision ID: 0007_invoice_referred_by
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "0007_invoice_referred_by"
down_revision = "0006_visit_vitals"
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
        if "referred_by" not in cols:
            if is_pg:
                bind.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255)"))
            else:
                # SQLite: plain ADD COLUMN (no IF NOT EXISTS); guarded by the check above.
                bind.execute(text("ALTER TABLE invoices ADD COLUMN referred_by VARCHAR(255)"))


def downgrade() -> None:
    # referred_by column left in place (never drop billing data).
    pass
