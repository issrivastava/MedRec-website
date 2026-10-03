"""Visit vitals: JSON snapshot column on visit_notes (age, sex, BP, pulse, SpO2...).

Revision ID: 0006_visit_vitals
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "0006_visit_vitals"
down_revision = "0005_bill_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.base import Base

    Base.metadata.create_all(bind=op.get_bind())
    bind = op.get_bind()
    insp = inspect(bind)
    existing = set(insp.get_table_names())
    is_pg = bind.dialect.name == "postgresql"

    if "visit_notes" in existing:
        cols = [c["name"] for c in insp.get_columns("visit_notes")]
        if "vitals" not in cols:
            if is_pg:
                bind.execute(text("ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS vitals JSON"))
            else:
                # SQLite: plain ADD COLUMN (no IF NOT EXISTS); guarded by the check above.
                bind.execute(text("ALTER TABLE visit_notes ADD COLUMN vitals JSON"))


def downgrade() -> None:
    # vitals column left in place (never drop clinical data).
    pass
