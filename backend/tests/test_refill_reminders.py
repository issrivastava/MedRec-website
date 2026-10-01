"""Refill loop + medicine reminders + UPI ref + scheduler idempotency.

Uses isolated sqlite DBs + mounted routers (never the dev database).
Run from backend/:  .venv\\Scripts\\python -m pytest tests/ -q
"""
import app.models.tables as _tables  # noqa: F401 — register all models on Base
from datetime import date, datetime, time as dtime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes import billing as billing_routes
from app.api.routes import visits as visits_routes
from app.api.routes import wellness as wellness_routes
from app.core.deps import get_current_user
from app.core.deps import get_db as _get_db_dep
from app.db.session import Base, get_db
from app.models.tables import (Appointment, AvailabilitySlot, Invoice, MedicationReminder,
                               Notification, User, VisitNote)
from app.services import scheduler as sched

app = FastAPI()
app.include_router(wellness_routes.router, prefix="/wellness")
app.include_router(visits_routes.router, prefix="/visits")
app.include_router(billing_routes.router, prefix="/billing")


def _seed(tmp_path):
    db_file = tmp_path / "loop.db"
    eng = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    factory = sessionmaker(bind=eng)
    db = factory()
    pat = User(email="loop_pat@test.com", hashed_password="x", full_name="Loop Pat", role="patient")
    doc = User(email="loop_doc@test.com", hashed_password="x", full_name="Loop Doc", role="doctor")
    db.add_all([pat, doc])
    db.commit()
    db.refresh(pat)
    db.refresh(doc)
    note = VisitNote(patient_id=pat.id, doctor_id=doc.id, note_type="prescription",
                     title="Fever Rx", content="Rest well",
                     medicines=[{"name": "Paracetamol", "dosage": "500mg"}])
    db.add(note)
    inv = Invoice(patient_id=pat.id, doctor_id=doc.id, receipt_no="R-TEST-1",
                  amount=500.0, status="issued", issued_at=datetime.utcnow())
    db.add(inv)
    db.commit()
    ids = {"pat": pat.id, "doc": doc.id, "note": note.id, "inv": inv.id}

    def override_db():
        d = factory()
        try:
            yield d
        finally:
            d.close()

    def client_as(role="patient"):
        me = ids["doc"] if role == "doctor" else ids["pat"]

        def override_user():
            d = factory()
            try:
                return d.query(User).filter_by(id=me).first()
            finally:
                d.close()

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user
        return TestClient(app, raise_server_exceptions=False)

    return client_as, factory, ids


def test_med_reminder_crud(tmp_path):
    client_as, factory, ids = _seed(tmp_path)
    client = client_as("patient")
    r = client.post("/wellness/med-reminders", json={"medicine_name": "Metformin", "remind_at": "08:00"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert client.get("/wellness/med-reminders").json()[0]["medicine_name"] == "Metformin"
    r = client.post("/wellness/med-reminders", json={"medicine_name": "X", "remind_at": "25:00"})
    assert r.status_code in (400, 422)
    r = client.patch(f"/wellness/med-reminders/{rid}",
                     json={"medicine_name": "Metformin", "remind_at": "08:00", "active": False})
    assert r.json()["active"] is False
    assert client.delete(f"/wellness/med-reminders/{rid}").status_code == 204
    assert client.get("/wellness/med-reminders").json() == []


def test_med_reminder_doctor_forbidden(tmp_path):
    client_as, factory, ids = _seed(tmp_path)
    assert client_as("doctor").get("/wellness/med-reminders").status_code == 403


def test_refill_notifies_doctor(tmp_path):
    client_as, factory, ids = _seed(tmp_path)
    client = client_as("patient")
    r = client.post(f"/visits/{ids['note']}/refill")
    assert r.status_code == 200, r.text
    assert r.json()["doctor"] == "Loop Doc"
    db = factory()
    try:
        n = db.query(Notification).filter_by(user_id=ids["doc"], kind="refill_request").first()
        assert n is not None and "Paracetamol" in (n.body or "")
    finally:
        db.close()


def test_refill_doctor_forbidden_and_unknown_404(tmp_path):
    client_as, factory, ids = _seed(tmp_path)
    assert client_as("doctor").post(f"/visits/{ids['note']}/refill").status_code == 403
    assert client_as("patient").post("/visits/nope/refill").status_code == 404


def test_upi_ref_flow(tmp_path):
    client_as, factory, ids = _seed(tmp_path)
    client = client_as("patient")
    r = client.get("/billing/upi")
    assert r.status_code == 200 and "configured" in r.json()
    r = client.post(f"/billing/invoices/{ids['inv']}/upi-ref", params={"upi_ref": "12"})
    assert r.status_code == 400  # too short
    r = client.post(f"/billing/invoices/{ids['inv']}/upi-ref", params={"upi_ref": "123456789012"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["upi_ref"] == "123456789012" and body["payment_mode"] == "upi"
    # Doctor (staff) records the verified payment with the same ref.
    staff = client_as("doctor")
    r = staff.post(f"/billing/invoices/{ids['inv']}/pay",
                   json={"paid_amount": 500.0, "payment_mode": "upi", "upi_ref": "123456789012"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"


def test_invoice_list_name_search(tmp_path):
    from app.models.tables import DoctorPatientAssignment
    client_as, factory, ids = _seed(tmp_path)
    db = factory()
    try:
        db.add(DoctorPatientAssignment(doctor_id=ids["doc"], patient_id=ids["pat"]))
        db.commit()
    finally:
        db.close()
    staff = client_as("doctor")
    r = staff.get("/billing/invoices", params={"q": "Loop Pat"})
    assert r.status_code == 200, r.text
    assert len(r.json()) == 1 and r.json()[0]["receipt_no"] == "R-TEST-1"
    r = staff.get("/billing/invoices", params={"q": "Nobody Here"})
    assert r.status_code == 200 and r.json() == []


def test_invoice_bill_type_create_and_filter(tmp_path):
    from app.models.tables import DoctorPatientAssignment
    client_as, factory, ids = _seed(tmp_path)
    db = factory()
    try:
        db.add(DoctorPatientAssignment(doctor_id=ids["doc"], patient_id=ids["pat"]))
        db.commit()
    finally:
        db.close()
    staff = client_as("doctor")
    r = staff.post("/billing/invoices",
                   json={"patient_id": ids["pat"], "doctor_id": ids["doc"],
                         "amount": 800.0, "category": "mri"})
    assert r.status_code == 201, r.text
    assert r.json()["category"] == "mri"
    r = staff.post("/billing/invoices",
                   json={"patient_id": ids["pat"], "amount": 100.0, "category": "bogus"})
    assert r.status_code == 400
    r = staff.get("/billing/invoices", params={"category": "mri"})
    assert r.status_code == 200 and len(r.json()) == 1
    r = staff.get("/billing/invoices", params={"category": "lab"})
    assert r.status_code == 200 and r.json() == []
    # Receipt PDF stamps the bill type.
    inv_id = staff.get("/billing/invoices", params={"category": "mri"}).json()[0]["id"]
    r = staff.get(f"/billing/invoices/{inv_id}/receipt")
    assert r.status_code == 200 and r.content[:4] == b"%PDF"


def test_invoice_receipt_pdf_downloads(tmp_path):
    # Regression: the receipt route once lost its decorator (silent 404).
    client_as, factory, ids = _seed(tmp_path)
    client = client_as("patient")
    r = client.get(f"/billing/invoices/{ids['inv']}/receipt")
    assert r.status_code == 200, r.text[:200]
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
    # Unknown invoice still 404s cleanly.
    assert client.get("/billing/invoices/nope/receipt").status_code == 404


def test_scheduler_medicine_idempotent(tmp_path):
    client_as, factory, ids = _seed(tmp_path)
    db = factory()
    try:
        db.add(MedicationReminder(owner_id=ids["pat"], medicine_name="Metformin", remind_at="08:00"))
        db.commit()
        morning = datetime.combine(date.today(), dtime(8, 15))
        out1 = sched.send_medicine_reminders(db, now=morning)
        assert out1["sent"] == 1
        out2 = sched.send_medicine_reminders(db, now=morning)
        assert out2["sent"] == 0  # last_sent stops the re-send
        rows = db.query(Notification).filter_by(user_id=ids["pat"], kind="medicine_reminder").all()
        assert len(rows) == 1
    finally:
        db.close()


def test_scheduler_appointment_reminder(tmp_path):
    client_as, factory, ids = _seed(tmp_path)
    db = factory()
    try:
        tomorrow = date.today() + timedelta(days=1)
        db.add(AvailabilitySlot(doctor_id=ids["doc"], weekday=tomorrow.weekday(),
                                start_time=dtime(9, 0), end_time=dtime(9, 30)))
        db.add(Appointment(doctor_id=ids["doc"], patient_id=ids["pat"], date=tomorrow,
                           start_time=dtime(9, 0), end_time=dtime(9, 30), status="booked"))
        db.commit()
        out = sched.send_appointment_reminders(db, target=tomorrow)
        assert out["booked"] == 1 and out["reminded"] == 1
        out2 = sched.send_appointment_reminders(db, target=tomorrow)
        assert out2["reminded"] == 0  # ref dedup — no double-send
    finally:
        db.close()
