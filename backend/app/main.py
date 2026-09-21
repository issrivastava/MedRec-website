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
    def _add(table: str, col: str, ddl: str) -> None:
        # Each ALTER in its own transaction: on Postgres one bad DDL used
        # to roll back every other column (the doctor 500s). IF NOT EXISTS
        # makes it safe to re-run. TIMESTAMP (not DATETIME) for Postgres.
        ddl = ddl.replace("DATETIME", "TIMESTAMP").replace(
            "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE")
        try:
            with engine.begin() as c:
                if engine.dialect.name == "postgresql":
                    c.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {ddl}"))
                else:
                    c.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
        except Exception:
            pass  # column exists (sqlite) or already handled
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
        appt_extra = [c["name"] for c in insp.get_columns("appointments")] if "appointments" in tables else []
        docprof_cols = [c["name"] for c in insp.get_columns("doctor_profiles")] if "doctor_profiles" in tables else []
        visit_extra = [c["name"] for c in insp.get_columns("visit_notes")] if "visit_notes" in tables else []
        with engine.begin() as conn:
            if "avatar_path" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_path VARCHAR(1024)"))
            if "firebase_uid" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128)"))
            if "phone" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(20)"))
            try:
                otp_cols = [c["name"] for c in insp.get_columns("otp_codes")] if "otp_codes" in tables else []
                if otp_cols and "phone" not in otp_cols:
                    conn.execute(text("ALTER TABLE otp_codes ADD COLUMN phone VARCHAR(20)"))
            except Exception:
                pass
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
            for col, ddl in [
                ("consult_type", "VARCHAR(20) DEFAULT 'in_person'"),
                ("video_url", "VARCHAR(1024)"),
                ("cancel_reason", "VARCHAR(500)"),
                ("token_no", "INTEGER"),
                ("checked_in", "BOOLEAN DEFAULT FALSE"),
                ("checked_in_at", "TIMESTAMP"),
                ("fee", "FLOAT"),
                ("payment_status", "VARCHAR(20) DEFAULT 'unpaid'"),
            ]:
                if appt_extra and col not in appt_extra:
                    _add("appointments", col, ddl)
            for col, ddl in [
                ("education", "TEXT"), ("experience_years", "INTEGER"),
                ("consultation_fee", "FLOAT"), ("languages", "VARCHAR(255)"),
                ("bio", "TEXT"), ("clinic_address", "TEXT"), ("timings", "VARCHAR(500)"),
            ]:
                if docprof_cols and col not in docprof_cols:
                    _add("doctor_profiles", col, ddl)
            for col, ddl in [
                ("diagnosis_code", "VARCHAR(20)"), ("diagnosis_name", "VARCHAR(255)"),
            ]:
                if visit_extra and col not in visit_extra:
                    _add("visit_notes", col, ddl)
            # AH-XXXX health IDs (unique across users + family_members)
            try:
                u_cols = [c["name"] for c in insp.get_columns("users")] if "users" in tables else []
                if u_cols and "health_id" not in u_cols:
                    _add("users", "health_id", "VARCHAR(10)")
            except Exception:
                pass
            try:
                f_cols = [c["name"] for c in insp.get_columns("family_members")] if "family_members" in tables else []
                if f_cols and "health_id" not in f_cols:
                    _add("family_members", "health_id", "VARCHAR(10)")
            except Exception:
                pass
            # Secure chat upgrades: priority / category / attachments / SOS / read receipts
            try:
                m_cols = [c["name"] for c in insp.get_columns("messages")] if "messages" in tables else []
                for col, ddl in [
                    ("priority", "VARCHAR(10) DEFAULT 'normal'"),
                    ("category", "VARCHAR(20) DEFAULT 'general'"),
                    ("attachment_document_id", "VARCHAR(36)"),
                    ("sos_detected", "BOOLEAN DEFAULT FALSE"),
                    ("read_at", "TIMESTAMP"),
                ]:
                    if m_cols and col not in m_cols:
                        _add("messages", col, ddl)
            except Exception:
                pass
    except Exception:
        pass  # fresh create_all already covers new databases


_ensure_columns()

try:
    from app.services.health_ids import backfill_missing

    db = SessionLocal()
    try:
        backfill_missing(db)
    finally:
        db.close()
except Exception:
    pass

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
    # Vite auto-bumps ports (5173 -> 5174 -> 5175...) when the default is
    # busy, and 127.0.0.1 is the same origin as localhost for dev. The regex
    # covers any local dev port so CORS never blocks again; explicit
    # allow_origins above still covers any deployed domains from .env.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    """Return JSON (with CORS headers) for unhandled crashes.

    Without this, Starlette's plain-text 500 bypasses CORSMiddleware, so the
    browser reports 'Network Error' and the real traceback is only visible
    in this terminal. HTTPException keeps its own handler — this is only
    for genuine bugs."""
    import traceback

    traceback.print_exc()
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=500, content={
        "detail": f"Server error: {type(exc).__name__}: {str(exc)[:300]}",
    })

avatar_dir = Path(settings.UPLOAD_DIR) / "avatars"
avatar_dir.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(avatar_dir)), name="avatars")


@app.get("/")
def root():
    return {"name": "MedRec API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
