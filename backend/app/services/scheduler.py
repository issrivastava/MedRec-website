"""Automatic reminders daemon (stdlib only — no new dependency).

A daemon thread ticks hourly and, once per day:
  1. Appointment reminders: every BOOKED appointment dated tomorrow ->
     in-app notification to patient (+SMS when configured).
  2. Medicine nudges: active MedicationReminders whose HH:MM falls in the
     current hour and which were not already sent today.

Idempotent via notification `ref` dedup keys + MedicationReminder.last_sent,
so overlapping ticks / restarts never double-send. All notifiers are
best-effort — the scheduler never raises and never blocks requests.
"""
from __future__ import annotations
import threading
import time
from datetime import date, datetime, timedelta

from app.core.config import settings


def _today_str() -> str:
    return date.today().isoformat()


def send_appointment_reminders(db, target: date | None = None) -> dict:
    """Remind all patients with BOOKED appointments on `target` (default tomorrow)."""
    from app.models.tables import Appointment, User
    from app.services.notify import notify, patient_phone, notify_phone_sms
    target = target or (date.today() + timedelta(days=1))
    rows = db.query(Appointment).filter_by(date=target, status="booked").all()
    sent = sms = 0
    for a in rows:
        try:
            doc = db.query(User).filter_by(id=a.doctor_id).first()
            name = doc.full_name if doc else "your doctor"
            n = notify(db, a.patient_id, "appointment_reminder",
                       f"Reminder: visit with Dr. {name} tomorrow ({target.isoformat()})",
                       f"Token {getattr(a, 'token_no', '') or '—'} · "
                       f"{a.start_time.strftime('%H:%M') if a.start_time else ''}"
                       f"{f' · {a.reason}' if a.reason else ''}. Reply if you can't make it.",
                       link="/patient",
                       ref=f"auto-remind:{a.id}:{target.isoformat()}")
            if n is None:
                continue  # already sent (dedup ref) — don't double-count
            phone = patient_phone(db, a.patient_id)
            if phone:
                notify_phone_sms(phone, f"MedRec: visit with Dr. {name} tomorrow {target.isoformat()} "
                                        f"{a.start_time.strftime('%H:%M') if a.start_time else ''}.")
                sms += 1
            sent += 1
        except Exception:
            continue
    return {"date": target.isoformat(), "booked": len(rows), "reminded": sent, "sms": sms}


def send_medicine_reminders(db, now: datetime | None = None) -> dict:
    """Nudge every active reminder whose HH:MM matches the current hour."""
    from app.models.tables import MedicationReminder
    from app.services.notify import notify, patient_phone, notify_phone_sms
    now = now or datetime.now()
    today = now.date()
    hhmm = now.strftime("%H:00")
    rows = db.query(MedicationReminder).filter_by(active=True).all()
    sent = sms = 0
    for r in rows:
        try:
            if (r.remind_at or "")[:2] != hhmm[:2]:
                continue
            if r.last_sent == today:
                continue
            label = r.medicine_name + (f" {r.dosage}" if r.dosage else "")
            n = notify(db, r.owner_id, "medicine_reminder",
                       f"💊 Time for {label}",
                       f"Scheduled dose at {r.remind_at}. Mark it taken — or snooze by replying to your doctor.",
                       link="/patient",
                       ref=f"med-remind:{r.id}:{today.isoformat()}")
            if n is None:
                continue  # already sent today
            phone = patient_phone(db, r.owner_id)
            if phone:
                notify_phone_sms(phone, f"MedRec: time for {label} ({r.remind_at}).")
                sms += 1
            r.last_sent = today
            db.commit()
            sent += 1
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
    return {"hour": hhmm, "sent": sent, "sms": sms}


def run_daily_jobs() -> dict:
    """One full pass (both job types) with a fresh DB session."""
    from app.db.session import SessionLocal
    out: dict = {}
    db = SessionLocal()
    try:
        try:
            out["appointments"] = send_appointment_reminders(db)
        except Exception as exc:
            out["appointments"] = {"error": str(exc)[:200]}
        try:
            out["medicines"] = send_medicine_reminders(db)
        except Exception as exc:
            out["medicines"] = {"error": str(exc)[:200]}
    finally:
        try:
            db.close()
        except Exception:
            pass
    return out


_started = False
_lock = threading.Lock()


def _loop(poll_seconds: int = 3600) -> None:
    while True:
        try:
            time.sleep(poll_seconds)
            run_daily_jobs()
        except Exception:
            continue


def start_scheduler() -> bool:
    """Start the hourly daemon tick (idempotent). Never raises."""
    global _started
    try:
        if not settings.AUTO_REMINDERS or _started:
            return False
        with _lock:
            if _started:
                return False
            t = threading.Thread(target=_loop, daemon=True, name="medrec-reminders")
            t.start()
            _started = True
            print("[MedRec] automatic reminders scheduler started (hourly tick).", flush=True)
            return True
    except Exception as exc:
        print(f"[MedRec] scheduler not started: {exc}", flush=True)
        return False
