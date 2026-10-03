"""Visit vitals + detailed Rx PDF: schema validation, serializer passthrough,
PDF content. Run from backend/:  .venv\\Scripts\\python -m pytest tests/ -q
"""
import base64
import re
import zlib
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.api.routes import visits
from app.schemas.schemas import VisitNoteIn


def _vitals(**kw):
    base = {"age": 31, "sex": "Female", "bp_sys": 120, "bp_dia": 80,
            "pulse": 78, "spo2": 98}
    base.update(kw)
    return base


def test_visit_note_accepts_vitals():
    n = VisitNoteIn(patient_id="p1", content="Rest well.", vitals=_vitals())
    assert n.vitals.bp_sys == 120
    assert n.vitals.spo2 == 98


def test_visit_note_rejects_absurd_vitals():
    with pytest.raises(ValidationError):
        VisitNoteIn(patient_id="p1", content="Rest well.", vitals=_vitals(spo2=140))
    with pytest.raises(ValidationError):
        VisitNoteIn(patient_id="p1", content="Rest well.", vitals=_vitals(bp_sys=20))
    with pytest.raises(ValidationError):
        VisitNoteIn(patient_id="p1", content="Rest well.", vitals=_vitals(age=200))


def test_out_map_passes_vitals_through():
    v = SimpleNamespace(
        id="n1", patient_id="p1", doctor_id="d1", note_type="prescription",
        title="Fever", content="Rest.", medicines=[],
        visit_date=date(2026, 10, 1), follow_up_date=None,
        created_at=datetime(2026, 10, 1), family_member_id=None,
        diagnosis_code="R50.9", diagnosis_name="Fever", vitals=_vitals())
    d = visits._out_with_map(v, {"d1": SimpleNamespace(full_name="Dr Who")})
    assert d["vitals"]["bp_sys"] == 120
    assert d["diagnosis_code"] == "R50.9"
    assert d["doctor_name"] == "Dr Who"


class _FakeQ:
    def __init__(self, model, store):
        self.model = model
        self.store = store
        self.kw = {}

    def filter_by(self, **kw):
        self.kw = kw
        return self

    def filter(self, *a):
        return self

    def order_by(self, *a):
        return self

    def first(self):
        name = self.model.__name__
        if name == "VisitNote":
            return self.store.get("note")
        if name == "User":
            return (self.store["pat"] if self.kw.get("id") == self.store["pat"].id
                    else self.store["doc"])
        return None


class _FakeDB:
    def __init__(self, store):
        self.store = store

    def query(self, model):
        return _FakeQ(model, self.store)


def _pdf_text(body: bytes) -> str:
    text = ""
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", body, re.S):
        blob = re.sub(rb"\s", b"", m.group(1).strip())
        if blob.endswith(b"~>"):
            blob = blob[:-2]
        try:
            blob = base64.a85decode(blob, adobe=False)
        except Exception:
            pass
        try:
            text += zlib.decompress(blob).decode("latin-1")
        except Exception:
            try:
                text += blob.decode("latin-1")
            except Exception:
                pass
    return text


def test_rx_pdf_contains_vitals_and_details():
    pat = SimpleNamespace(
        id="p1", full_name="SAGARIKA SRIVASTAVA", email="s@example.com",
        health_id="AH-1234", phone="9999999999",
        patient_profile=SimpleNamespace(dob=date(1995, 5, 5), gender="Female",
                                        phone=None, address="12 MG Road"))
    doc = SimpleNamespace(
        id="d1", full_name="Asha Verma", phone="9888888888",
        doctor_profile=SimpleNamespace(
            qualification="MBBS, MD", specialization="General Medicine",
            hospital="City Hospital", clinic_address="Bandra",
            license_no="MCI-12345", phone=None, registration_council=None))
    note = SimpleNamespace(
        id="n1", patient_id="p1", doctor_id="d1", note_type="prescription",
        title="Fever review", content="Rest well.",
        medicines=[{"name": "Paracetamol", "dosage": "500mg",
                    "frequency": "twice daily", "duration": "3 days"}],
        visit_date=date(2026, 10, 1), follow_up_date=date(2026, 10, 5),
        diagnosis_code="R50.9", diagnosis_name="Fever, unspecified",
        vitals=_vitals(temp_c=38.2, weight_kg=62.5),
        family_member_id=None, created_at=datetime(2026, 10, 1, 10, 0))
    db = _FakeDB({"note": note, "pat": pat, "doc": doc})
    resp = visits.rx_pdf("n1", db=db, user=SimpleNamespace(role="patient", id="p1"))
    assert resp.media_type == "application/pdf"
    assert resp.body[:5] == b"%PDF-"
    text = _pdf_text(resp.body)
    for expected in ("E-PRESCRIPTION", "MCI-12345", "SAGARIKA", "120/80",
                     "78", "98", "38.2", "62.5", "R50.9", "Paracetamol",
                     "500mg", "2026-10-05", "Signature", "AH-1234"):
        assert expected in text, f"missing from Rx PDF: {expected}"
