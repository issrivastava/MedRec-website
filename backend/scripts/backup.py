"""MedRec backup helper: Postgres pg_dump + uploads snapshot.

Usage (from backend/):
    .venv\\Scripts\\python scripts\\backup.py --out .\\backups

- Dumps DATABASE_URL (Postgres) with pg_dump when available, else copies
  the SQLite file.
- Tarballs UPLOAD_DIR alongside the dump with a timestamped name.
- Keeps the last 7 backups, prints the restore command.

Schedule daily via Task Scheduler / cron for production clinics.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import settings  # noqa: E402


def _stamp() -> str:
    return _dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def backup_database(out_dir: Path) -> Path | None:
    url = settings.DATABASE_URL
    stamp = _stamp()
    if url.startswith("sqlite"):
        src = url.split("sqlite:///", 1)[-1] or "./medrec.db"
        src_p = Path(src)
        if not src_p.is_absolute():
            src_p = Path.cwd() / src_p
        dest = out_dir / f"medrec-sqlite-{stamp}.db"
        if src_p.exists():
            shutil.copy2(src_p, dest)
            print(f"[backup] sqlite copied -> {dest}")
            return dest
        print("[backup] no sqlite file found, skipping db dump")
        return None
    dest = out_dir / f"medrec-pg-{stamp}.dump"
    try:
        # pg_dump reads PGPASSWORD from env; pass through.
        with open(dest, "wb") as fh:
            subprocess.run(["pg_dump", url, "-Fc", "-f", str(dest)],
                           check=True, stdout=fh, stderr=subprocess.PIPE)
        print(f"[backup] pg_dump -> {dest}")
        return dest
    except FileNotFoundError:
        print("[backup] pg_dump not found — install Postgres client tools; "
              "uploads will still be archived.")
        return None
    except subprocess.CalledProcessError as exc:
        print(f"[backup] pg_dump failed: {exc}")
        return None


def backup_uploads(out_dir: Path) -> Path | None:
    src = Path(settings.UPLOAD_DIR)
    if not src.exists():
        print("[backup] no uploads dir, skipping")
        return None
    dest = out_dir / f"medrec-uploads-{_stamp()}.tar.gz"
    with tarfile.open(dest, "w:gz") as tar:
        tar.add(src, arcname=src.name)
    print(f"[backup] uploads archived -> {dest}")
    return dest


def prune(out_dir: Path, keep: int = 7) -> None:
    files = sorted(out_dir.glob("medrec-*"), key=os.path.getmtime)
    for old in files[: max(0, len(files) - keep * 2)]:
        try:
            old.unlink()
            print(f"[backup] pruned {old.name}")
        except OSError:
            pass


def main() -> int:
    ap = argparse.ArgumentParser(description="MedRec backup: database + uploads")
    ap.add_argument("--out", default=".\\backups", help="output directory")
    ap.add_argument("--keep", type=int, default=7, help="days of backups to keep")
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    backup_database(out_dir)
    backup_uploads(out_dir)
    prune(out_dir, keep=args.keep)
    print("[backup] restore: pg_restore -d $DATABASE_URL <dump> + extract uploads tarball "
          "to UPLOAD_DIR. Test restores monthly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
