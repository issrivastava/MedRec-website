"""Smoke tests for the directory endpoints (hospitals + JustDial).

These are pure functions over curated data — no database needed.
Run from backend/:  pytest  (or  python -m pytest tests/)
"""

from app.api.routes import hospitals, justdial


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


def test_justdial_cities_cover_all_regions():
    data = justdial.justdial_cities()
    regions = {c["region"] for c in data["results"]}
    assert {"Mumbai", "Delhi NCR", "Chennai", "Bengaluru",
            "Hyderabad", "Kolkata", "Pune", "Ahmedabad"} <= regions


def test_justdial_doctors_per_city():
    data = justdial.justdial_doctors(city="Mumbai", q=None, specialty=None)
    assert data["count"] > 0
    assert {i["city_id"] for i in data["results"]} == {"mumbai"}
    assert all(i["justdial_url"].startswith("https://www.justdial.com/Mumbai/")
               for i in data["results"])


def test_justdial_region_aliases_resolve():
    # "Delhi NCR" (MedRec region) and "Bangalore" (JustDial slug) both work.
    delhi = justdial.justdial_doctors(city="Delhi NCR", q="cardio", specialty=None)
    assert delhi["count"] > 0
    bengaluru = justdial.justdial_doctors(city="Bengaluru", q=None, specialty=None)
    assert bengaluru["count"] > 0
    assert all(i["justdial_city"] == "Bangalore" for i in bengaluru["results"])


def test_justdial_unknown_city_is_empty_not_500():
    data = justdial.justdial_doctors(city="Atlantis", q=None, specialty=None)
    assert data["count"] == 0
    assert data["results"] == []


def test_justdial_known_nct_urls_pinned():
    data = justdial.justdial_doctors(city="Mumbai", q=None, specialty="Dentistry")
    assert data["count"] == 1
    assert data["results"][0]["justdial_url"].endswith("/nct-10156331")


def test_illnesses_alias_registered():
    # /api/illnesses/* must mirror /api/diseases/* (UI renamed, API kept).
    from app.api import api_router

    paths = [getattr(r, "path", "") for r in api_router.routes]
    for leaf in ("search", "detail", "popular"):
        assert f"/diseases/{leaf}" in paths
        assert f"/illnesses/{leaf}" in paths
