"""Smoke tests for the hospital directory (single Find-Doctors source).

JustDial was removed as a duplicate source — hospitals are the only directory.
These are pure functions over curated data — no database needed.
Run from backend/:  pytest  (or  python -m pytest tests/)
"""

from app.api.routes import hospitals


def test_hospital_list_has_core_hospitals():
    data = hospitals.hospital_list()
    ids = {h["id"] for h in data["results"]}
    assert {"bombay", "apollo", "fortis", "lilavati", "kokilaben", "nanavati"} <= ids


def test_hospital_doctors_filter_by_query():
    data = hospitals.hospital_doctors(q="cardio", specialty=None, hospital=None)
    assert data["count"] > 0
    assert all(
        "cardio" in (i["specialty"] + " " + " ".join(i["tags"])).lower()
        or "cardio" in i["hospital"].lower()
        for i in data["results"]
    )


def test_hospital_doctors_filter_by_hospital():
    data = hospitals.hospital_doctors(q=None, specialty=None, hospital="apollo")
    assert data["count"] > 0
    assert {i["hospital_id"] for i in data["results"]} == {"apollo"}


def test_illnesses_alias_registered():
    # /api/illnesses/* must mirror /api/diseases/* (UI renamed, API kept).
    from app.api import api_router

    paths = [getattr(r, "path", "") for r in api_router.routes]
    for leaf in ("search", "detail", "popular"):
        assert f"/diseases/{leaf}" in paths
        assert f"/illnesses/{leaf}" in paths


def test_removed_duplicate_routes_are_gone():
    # Broadcasts, pre-visits, second opinions, site reviews and JustDial
    # were removed as duplicates — they must not be registered anymore.
    from app.api import api_router

    paths = [getattr(r, "path", "") for r in api_router.routes]
    for dead in ("/practice/broadcasts", "/practice/pre-visits", "/care/second-opinions",
                 "/reviews/site", "/justdial"):
        assert not any(p.startswith(dead) for p in paths), dead
    # ...while the kept counterparts still are.
    for live in ("/care/referrals", "/reviews/my", "/care/announcements",
                 "/hospitals", "/practice/patient-groups"):
        assert any(p.startswith(live) for p in paths), live
