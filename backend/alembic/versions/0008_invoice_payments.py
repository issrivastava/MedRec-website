"""Invoice payment history: one row per collection event (part-payments).

Revision ID: 0008_invoice_payments
"""

from alembic import op

revision: str = "0008_invoice_payments"
down_revision = "0007_invoice_referred_by"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.base import Base

    # New table only — create_all is a no-op for tables that already exist.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    # invoice_payments left in place (never drop billing data).
    pass
