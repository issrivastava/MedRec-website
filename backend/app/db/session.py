from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings


def _make_engine():
    """Use the configured DATABASE_URL, but fall back to local SQLite when
    Postgres is unreachable (common on fresh clones without Postgres running).
    This keeps `uvicorn app.main:app` bootable so login/register work."""
    url = settings.DATABASE_URL
    if url.startswith("sqlite"):
        return create_engine(url, pool_pre_ping=True, connect_args={"check_same_thread": False})
    try:
        eng = create_engine(url, pool_pre_ping=True)
        with eng.connect():
            pass
        return eng
    except Exception as exc:  # noqa: BLE001 - dev fallback, log and continue
        print(f"[MedRec] WARNING: DATABASE_URL unreachable ({exc}). "
              "Falling back to local sqlite:///./medrec.db. "
              "Start Postgres or fix DATABASE_URL in backend/.env for shared data.", flush=True)
        return create_engine("sqlite:///./medrec.db", pool_pre_ping=True,
                             connect_args={"check_same_thread": False})


engine = _make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
