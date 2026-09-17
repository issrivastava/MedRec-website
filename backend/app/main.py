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
        tables = set(insp.get_table_names())
        user_cols = [c["name"] for c in insp.get_columns("users")] if "users" in tables else []
        doc_cols = [c["name"] for c in insp.get_columns("documents")] if "documents" in tables else []
        sum_cols = [c["name"] for c in insp.get_columns("ai_summaries")] if "ai_summaries" in tables else []
        prof_cols = [c["name"] for c in insp.get_columns("patient_profiles")] if "patient_profiles" in tables else []
        fam_cols = [c["name"] for c in insp.get_columns("family_members")] if "family_members" in tables else []
        visit_cols = [c["name"] for c in insp.get_columns("visit_notes")] if "visit_notes" in tables else []
        appt_cols = [c["name"] for c in insp.get_columns("appointments")] if "appointments" in tables else []
        alert_cols = [c["name"] for c in insp.get_columns("health_alerts")] if "health_alerts" in tables else []
        with engine.begin() as conn:
            if "avatar_path" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_path VARCHAR(1024)"))
            if "firebase_uid" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128)"))
            if "family_member_id" not in doc_cols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN family_member_id VARCHAR(36)"))
            if "category" not in doc_cols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN category VARCHAR(50)"))
            if "report_kind" not in doc_cols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN report_kind VARCHAR(50)"))
            if "language" not in sum_cols:
                conn.execute(text("ALTER TABLE ai_summaries ADD COLUMN language VARCHAR(10) DEFAULT 'en'"))
            for col, ddl in [
                ("height_cm", "FLOAT"), ("weight_kg", "FLOAT"),
                ("marital_status", "VARCHAR(50)"), ("occupation", "VARCHAR(255)"),
                ("smoking_status", "VARCHAR(100)"), ("alcohol_use", "VARCHAR(100)"),
                ("diet", "VARCHAR(100)"), ("activity_level", "VARCHAR(100)"),
                ("past_illnesses", "TEXT"), ("surgeries", "TEXT"),
                ("current_medications", "TEXT"), ("immunizations", "TEXT"),
                ("family_history_text", "TEXT"), ("menstrual_history", "TEXT"),
                ("mental_health", "TEXT"),
            ]:
                if prof_cols and col not in prof_cols:
                    conn.execute(text(f"ALTER TABLE patient_profiles ADD COLUMN {col} {ddl}"))
                if fam_cols and col not in fam_cols:
                    conn.execute(text(f"ALTER TABLE family_members ADD COLUMN {col} {ddl}"))
            if visit_cols and "family_member_id" not in visit_cols:
                conn.execute(text("ALTER TABLE visit_notes ADD COLUMN family_member_id VARCHAR(36)"))
            if appt_cols and "family_member_id" not in appt_cols:
                conn.execute(text("ALTER TABLE appointments ADD COLUMN family_member_id VARCHAR(36)"))
            if alert_cols and "family_member_id" not in alert_cols:
                conn.execute(text("ALTER TABLE health_alerts ADD COLUMN family_member_id VARCHAR(36)"))
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
