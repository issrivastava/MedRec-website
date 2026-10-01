"""Programmatic Alembic runner used at app startup.

`run_migrations()` upgrades the *already-resolved* engine (see
app.db.session — including its SQLite dev fallback) to `head`, so fresh
clones and pre-existing databases converge on the same schema without
inline DDL scattered through main.py.

For manual use (inspect / stamp / new revisions), run from backend/:
    alembic upgrade head
    alembic revision --autogenerate -m "add xyz"
"""

from pathlib import Path

from alembic import command
from alembic.config import Config


"""Programmatic Alembic runner used at app startup.

`run_migrations()` upgrades the *already-resolved* engine (see
app.db.session — including its SQLite dev fallback) to `head`, so fresh
clones and pre-existing databases converge on the same schema without
inline DDL scattered through main.py.

Startup resilience: the database may be briefly unreachable (container
still starting, service restarting, two local Postgres instances racing
for port 5432). Migrations are retried with backoff; if the DB is still
down, dev boots with a loud warning (endpoints needing the DB will fail
loudly) while prod fails fast so the deployment is visibly broken
instead of silently serving half a schema.

For manual use (inspect / stamp / new revisions), run from backend/:
    alembic upgrade head
    alembic revision --autogenerate -m "add xyz"
"""

import time
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.config import settings


def run_migrations(engine, retries: int = 5, delay_sec: float = 3.0) -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    # Point Alembic at the live engine URL (already fallback-resolved).
    # NOTE: str(engine.url) masks the password as "***" (SQLAlchemy 2.0),
    # which breaks auth ("password authentication failed for user ...").
    # render_as_string(hide_password=False) preserves the real password.
    cfg.set_main_option("sqlalchemy.url", engine.url.render_as_string(hide_password=False))

    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            command.upgrade(cfg, "head")
            return
        except Exception as exc:  # noqa: BLE001 — retried, then handled below
            last_exc = exc
            print(f"[MedRec] WARNING: migration attempt {attempt}/{retries} failed: "
                  f"{type(exc).__name__}: {str(exc)[:160]}", flush=True)
            if attempt < retries:
                time.sleep(delay_sec)

    if settings.is_prod:
        raise RuntimeError(f"Database migrations failed after {retries} attempts") from last_exc
    print("[MedRec] WARNING: booting WITHOUT migrations applied — "
          "fix DATABASE_URL / start the database and restart the backend. "
          "DB-backed endpoints will error until then.", flush=True)
