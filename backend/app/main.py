from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.api import api_router
from app.db.session import engine, SessionLocal
from app.db.migrations import run_migrations

# Versioned schema (Alembic): brings fresh AND pre-existing databases to
# `head`. New schema changes go in backend/alembic/versions/ — never as
# inline DDL here. Data seeds (health IDs, lab ranges) run below.
run_migrations(engine)

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
    """Return a generic JSON 500 (with CORS headers) for unhandled crashes.

    The full traceback goes to the server logs only — never to the client,
    so internal paths / SQL / library details can't leak. HTTPException
    keeps its own handler — this is only for genuine bugs."""
    import re
    import traceback

    traceback.print_exc()

    # ExceptionMiddleware runs inside/outside CORSMiddleware depending on
    # Starlette version — a 500 without ACAO headers surfaces in the browser
    # as a CORS block instead of the real error. Echo an explicit ACAO
    # header here so the frontend can show the generic message below.
    origin = request.headers.get("origin", "")
    headers = {}
    if origin and re.match(r"https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"

    return JSONResponse(status_code=500, content={
        "detail": "Internal server error — please retry. The backend logs hold the details.",
    }, headers=headers)

avatar_dir = Path(settings.UPLOAD_DIR) / "avatars"
avatar_dir.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(avatar_dir)), name="avatars")


@app.get("/")
def root():
    return {"name": "MedRec API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
