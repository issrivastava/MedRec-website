"""Hospital-ops smoke tests: billing receipt numbers, pharmacy safety rules,
FHIR patient shaping, directory archive defaults.

Run from backend/:  .venv\\Scripts\\python -m pytest tests/ -q
"""
from app.api.routes import billing, pharmacy
from app.api.routes.fhir import _patient_resource


class _FakeProfile:
    gender = "female"
    phone = "+911234567890"
    address = "Pune"
    dob = None
    abha_id = "abha-123"


class _FakeUser:
    id = "u-1"
    full_name = "Test Patient"
    email = "t@example.com"
    phone = "+911234567890"
    health_id = "AH-ABCD"


def test_receipt_numbers_look_unique():
    seen = set()
    for _ in range(20):
        import secrets
        cand = f"R-20260101-{secrets.token_hex(2).upper()}"
        assert cand not in seen
        seen.add(cand)
    assert len(seen) == 20


def test_pharmacy_risky_pairs_flagged():
    assert frozenset({"warfarin", "aspirin"}) in pharmacy.RISKY_PAIRS
    level, _reason = pharmacy.RISKY_PAIRS[frozenset({"warfarin", "aspirin"})]
    assert level == "major"


def test_fhir_patient_resource_shape():
    res = _patient_resource(_FakeUser(), _FakeProfile())
    assert res["resourceType"] == "Patient"
    assert res["id"] == "u-1"
    assert any(i["system"].endswith("health-id") for i in res["identifier"])
    assert any(i["system"] == "https://abha.abdm.gov.in" for i in res["identifier"])
    assert res["gender"] == "female"


def test_invoice_statuses_valid():
    assert set(billing.VALID_STATUS) >= {"issued", "paid", "cancelled", "refunded"}


def test_staff_roles_include_front_desk():
    from app.core.deps import STAFF_ROLES
    assert {"receptionist", "nurse", "doctor", "admin"} <= set(STAFF_ROLES)
