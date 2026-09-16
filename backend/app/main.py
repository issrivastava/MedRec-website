from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.core.config import settings
from app.api import api_router
from app.db.base import Base
from app.db.session import engine, SessionLocal

Base.metadata.create_all(bind=engine)


def _ensure_columns() -> None:
    """Add newer columns on databases created before those updates."""
    try:
        insp = inspect(engine)
        user_cols = [c["name"] for c in insp.get_columns("users")]
        doc_cols = [c["name"] for c in insp.get_columns("documents")]
        sum_cols = [c["name"] for c in insp.get_columns("ai_summaries")]
        with engine.begin() as conn:
            if "avatar_path" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_path VARCHAR(1024)"))
            if "firebase_uid" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128)"))
            if "family_member_id" not in doc_cols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN family_member_id VARCHAR(36)"))
            if "language" not in sum_cols:
                conn.execute(text("ALTER TABLE ai_summaries ADD COLUMN language VARCHAR(10) DEFAULT 'en'"))
    except Exception:
        pass  # fresh create_all already covers new databases


_ensure_columns()

try:
    from app.services.labranges import seed_defaults

    db = SessionLocal()
    try:
        seed_defaults(db)
    finally:
        db.close()
except Exception:
    pass

app = FastAPI(title="MedRec API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

avatar_dir = Path(settings.UPLOAD_DIR) / "avatars"
avatar_dir.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(avatar_dir)), name="avatars")


@app.get("/")
def root():
    return {"name": "MedRec API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
