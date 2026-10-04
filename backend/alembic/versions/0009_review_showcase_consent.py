"""Review showcase consent: opt-in flag for public testimonials.

Revision ID: 0009_review_showcase_consent
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "0009_review_showcase_consent"
down_revision = "0008_invoice_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.base import Base

    Base.metadata.create_all(bind=op.get_bind())
    bind = op.get_bind()
    insp = inspect(bind)
    existing = set(insp.get_table_names())
    is_pg = bind.dialect.name == "postgresql"

    if "reviews" in existing:
        cols = [c["name"] for c in insp.get_columns("reviews")]
        if "showcase_consent" not in cols:
            if is_pg:
                bind.execute(text("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "
                                  "showcase_consent BOOLEAN NOT NULL DEFAULT FALSE"))
            else:
                # SQLite: plain ADD COLUMN (no IF NOT EXISTS); guarded by the check above.
                bind.execute(text("ALTER TABLE reviews ADD COLUMN "
                                  "showcase_consent BOOLEAN NOT NULL DEFAULT 0"))


def downgrade() -> None:
    # showcase_consent left in place (never drop consent records).
    pass
