"""JustDial doctors directory — curated deep links.

JustDial publishes NO official public doctor API, so live availability
cannot be pulled with a key. Same approach as /api/hospitals: curate
city + specialty deep links where each JustDial page carries ratings,
phone/WhatsApp and live "Book Appointment" buttons.

Endpoints (all PUBLIC — no login needed):
  GET /api/justdial/cities
  GET /api/justdial/specialties
  GET /api/justdial/doctors?city=Mumbai&q=cardio&specialty=Cardiology

Source of truth: this file. The frontend keeps an offline mirror
(frontend/src/pages/FindDoctors.jsx FALLBACK_JD_* + fallbackJdItems()) so
links render when the backend is unreachable — update both when cities or
specialties change.
"""

from fastapi import APIRouter, Query

router = APIRouter()

JD = "https://www.justdial.com"

# MedRec region -> JustDial city slug. JustDial canonical slugs use
# Delhi (not "Delhi NCR") and Bangalore (not "Bengaluru") — both
# redirects work, but canonical avoids an extra hop.
CITIES: list[dict] = [
    {"id": "mumbai", "region": "Mumbai", "justdial_city": "Mumbai",
     "doctors_url": f"{JD}/Mumbai/Doctors"},
    {"id": "delhi", "region": "Delhi NCR", "justdial_city": "Delhi",
     "doctors_url": f"{JD}/Delhi/Doctors"},
    {"id": "chennai", "region": "Chennai", "justdial_city": "Chennai",
     "doctors_url": f"{JD}/Chennai/Doctors"},
    {"id": "bengaluru", "region": "Bengaluru", "justdial_city": "Bangalore",
     "doctors_url": f"{JD}/Bangalore/Doctors"},
    {"id": "hyderabad", "region": "Hyderabad", "justdial_city": "Hyderabad",
     "doctors_url": f"{JD}/Hyderabad/Doctors"},
    {"id": "kolkata", "region": "Kolkata", "justdial_city": "Kolkata",
     "doctors_url": f"{JD}/Kolkata/Doctors"},
    {"id": "pune", "region": "Pune", "justdial_city": "Pune",
     "doctors_url": f"{JD}/Pune/Doctors"},
    {"id": "ahmedabad", "region": "Ahmedabad", "justdial_city": "Ahmedabad",
     "doctors_url": f"{JD}/Ahmedabad/Doctors"},
]

_CITY_BY_ID = {c["id"]: c for c in CITIES}
_CITY_BY_REGION = {c["region"].lower(): c for c in CITIES}
_CITY_BY_JD = {c["justdial_city"].lower(): c for c in CITIES}
# Alias so "bengaluru" resolves to the Bangalore entry.
_CITY_BY_JD["bengaluru"] = _CITY_BY_ID["bengaluru"]

# (display name, JustDial category slug, tags for search)
# Slugs match JustDial's real category pages; short /City/Slug URLs
# 302-redirect to the full /nct-... listing which carries ratings +
# Book Appointment buttons. Three combos below pin the full nct URL
# observed on JustDial so those cards land exactly.
SPECIALTIES: list[tuple] = [
    ("Cardiology", "Cardiologists", ["cardio", "heart"]),
    ("Dermatology", "Dermatologists", ["skin", "hair"]),
    ("Dentistry", "Dentists", ["dental", "teeth", "dentist"]),
    ("Orthopaedics", "Orthopaedic-Doctors", ["ortho", "bone", "joint", "knee"]),
    ("Neurology", "Neurologists", ["neuro", "brain", "migraine", "epilepsy"]),
    ("Gynaecology & Obstetrics", "Gynaecologists",
     ["pregnancy", "women", "gynae", "obstetrics"]),
    ("Paediatrics", "Paediatricians", ["child", "baby", "kids", "paediatrics"]),
    ("ENT", "ENT-Doctors", ["ent", "ear", "nose", "throat", "laryngology"]),
    ("Ophthalmology", "Ophthalmologists", ["eye", "vision"]),
    ("General Medicine", "General-Physician-Doctors",
     ["physician", "fever", "general", "infection", "flu", "diabetes", "hypertension"]),
    ("Psychiatry", "Psychiatrists", ["mental health", "depression", "anxiety"]),
    ("Urology", "Urologists", ["urinary", "kidney stone", "prostate"]),
    ("Nephrology", "Nephrologists", ["kidney", "renal"]),
    ("Gastroenterology", "Gastroenterologists",
     ["gastro", "stomach", "liver", "digestive"]),
    ("Endocrinology & Diabetes", "Endocrinologists",
     ["hormone", "thyroid", "diabetes", "sugar", "diabetology"]),
    ("Oncology", "Oncologists", ["cancer", "oncology", "tumor"]),
    ("Pulmonology", "Pulmonologists",
     ["lungs", "asthma", "copd", "breathing", "tb", "tuberculosis", "pulmonary"]),
    ("Rheumatology", "Rheumatologists", ["arthritis", "joint pain", "autoimmune"]),
    ("General Surgery", "General-Surgeons",
     ["surgery", "general surgeon", "laparoscopic"]),
    ("Plastic Surgery", "Plastic-Surgeons", ["cosmetic", "reconstructive", "burns"]),
    ("Physiotherapy", "Physiotherapists",
     ["physio", "back pain", "joint", "rehab", "sports injury"]),
    ("Homoeopathy", "Homeopathic-Doctors", ["homeo", "homeopathic", "alternative"]),
    ("Ayurveda", "Ayurvedic-Doctors", ["ayurveda", "ayurvedic", "alternative"]),
]

# Full nct URLs observed on JustDial — pin these so the cards land exactly.
_KNOWN_URLS = {
    ("Mumbai", "Dentists"): f"{JD}/Mumbai/Dentists/nct-10156331",
    ("Mumbai", "Dermatologists"): f"{JD}/Mumbai/Dermatologists/nct-10156786",
    ("Chennai", "Cardiologists"): f"{JD}/Chennai/Cardiologists/nct-10080172",
}


def _resolve_city(raw: str | None):
    if not raw or not raw.strip():
        return None
    key = raw.strip().lower()
    return (
        _CITY_BY_ID.get(key)
        or _CITY_BY_REGION.get(key)
        or _CITY_BY_JD.get(key)
    )


def _entry(city: dict, name: str, slug: str, tags: list[str]) -> dict:
    jd_city = city["justdial_city"]
    url = _KNOWN_URLS.get((jd_city, slug), f"{JD}/{jd_city}/{slug}")
    return {
        "city_id": city["id"],
        "region": city["region"],
        "justdial_city": jd_city,
        "specialty": name,
        "slug": slug,
        "tags": tags,
        "justdial_url": url,
        "book_url": url,
        "city_doctors_url": city["doctors_url"],
    }


@router.get("/cities")
def justdial_cities():
    """Cities covered (maps MedRec regions to JustDial slugs). Public."""
    return {"count": len(CITIES), "results": CITIES}


@router.get("/specialties")
def justdial_specialties():
    """Specialty names + JustDial slugs (for dropdowns / mapping). Public."""
    return {
        "results": [
            {"name": name, "slug": slug, "tags": tags}
            for name, slug, tags in SPECIALTIES
        ]
    }


@router.get("/doctors")
def justdial_doctors(
    city: str | None = Query(None, description="City id, region or JustDial city, e.g. mumbai / Delhi NCR / Delhi"),
    q: str | None = Query(None, description="Filter, e.g. cardio, skin, dental, diabetes"),
    specialty: str | None = Query(None, description="Exact specialty name"),
):
    """City x specialty JustDial deep links with Book Appointment buttons. Public."""
    cities = [c for c in CITIES if not city or (_resolve_city(city) or {}).get("id") == c["id"]]
    if city and city.strip() and not _resolve_city(city):
        # Unknown city string — return empty with a helpful note, not 500.
        return {"count": 0, "results": [],
                "note": f"Unknown city '{city}'. Try one of: "
                        + ", ".join(c["region"] for c in CITIES) + "."}
    items = [_entry(c, name, slug, tags) for c in cities for name, slug, tags in SPECIALTIES]
    if specialty:
        items = [i for i in items if i["specialty"].lower() == specialty.lower().strip()]
    if q and q.strip():
        ql = q.lower().strip()
        items = [i for i in items
                 if ql in i["specialty"].lower() or ql in i["slug"].lower()
                 or ql in i["justdial_city"].lower() or ql in i["region"].lower()
                 or any(ql in t for t in i["tags"])]
    return {
        "count": len(items),
        "results": items,
        "note": ("JustDial offers no public booking API, so availability "
                 "lives on JustDial — every card links straight to the "
                 "city + specialty listing with ratings and Book Appointment buttons."),
    }
