"""Hospital doctors available for appointment — curated deep links.

Bombay Hospital, Apollo Hospitals, Fortis Healthcare, Lilavati Hospital,
Kokilaben Hospital and Nanavati Max publish NO public booking API, so live
availability cannot be pulled with a key. Instead this endpoint curates each
hospital's real departments and links every specialty to that hospital's own
doctor directory / booking pages, where each doctor card carries a live
"Book Appointment" button.

Endpoints (all PUBLIC — no login needed):
  GET /api/hospitals/                    (hospital list)
  GET /api/hospitals/doctors?q=cardio&hospital=apollo
  GET /api/hospitals/specialties         (names grouped by hospital)

Source of truth: this file. The frontend keeps an offline mirror
(frontend/src/pages/FindDoctors.jsx FALLBACK_HOSPITALS) so links render
when the backend is unreachable — update both when hospitals change.
"""

from fastapi import APIRouter, Query

router = APIRouter()

BOMBAY = "https://www.bombayhospital.com"
APOLLO = "https://www.apollohospitals.com"
FORTIS = "https://www.fortishealthcare.com"
LILAVATI = "https://www.lilavatihospital.com"
KOKILABEN = "https://www.kokilabenhospital.com"
NANAVATI = "https://www.nanavatimaxhospital.org"

LILAVATI_BOOK = "https://www.lilavatihospital.com/doctors/request-an-appointment"
KOKILABEN_BOOK = "https://www.kokilabenhospital.com/patients/makeanappointment.html"
NANAVATI_BOOK = "https://www.nanavatimaxhospital.org/book-an-appointment/"

HOSPITALS: list[dict] = [
    {"id": "bombay",
     "name": "Bombay Hospital & Medical Research Centre",
     "cities": "Mumbai",
     "consultants_url": f"{BOMBAY}/consultants",
     "contact_url": f"{BOMBAY}/contact",
     "booking_url": f"{BOMBAY}/consultants"},
    {"id": "apollo",
     "name": "Apollo Hospitals",
     "cities": "Pan-India (Mumbai, Delhi, Chennai, Bangalore, Hyderabad, Kolkata…)",
     "consultants_url": f"{APOLLO}/doctors",
     "contact_url": f"{APOLLO}/contact-us",
     "booking_url": f"{APOLLO}/doctors"},
    {"id": "fortis",
     "name": "Fortis Healthcare",
     "cities": "Pan-India (Mumbai, Delhi NCR, Bangalore, Chennai, Kolkata…)",
     "consultants_url": f"{FORTIS}/doctors",
     "contact_url": f"{FORTIS}/contact-us",
     "booking_url": f"{FORTIS}/doctors"},
    {"id": "lilavati",
     "name": "Lilavati Hospital & Research Centre",
     "cities": "Mumbai (Bandra West)",
     "consultants_url": f"{LILAVATI}/doctors",
     "contact_url": LILAVATI,
     "booking_url": LILAVATI_BOOK},
    {"id": "kokilaben",
     "name": "Kokilaben Dhirubhai Ambani Hospital",
     "cities": "Mumbai (Andheri West)",
     "consultants_url": f"{KOKILABEN}/doctors",
     "contact_url": KOKILABEN,
     "booking_url": KOKILABEN_BOOK},
    {"id": "nanavati",
     "name": "Nanavati Max Super Speciality Hospital",
     "cities": "Mumbai (Vile Parle West)",
     "consultants_url": f"{NANAVATI}/find-a-doctor",
     "contact_url": NANAVATI,
     "booking_url": NANAVATI_BOOK},
]

# (hospital_id, display name, booking URL, info URL or None, tags for search)
SPECIALTIES: list[tuple] = [
    # ---- Bombay Hospital (service page + shared consultants directory) ----
    ("bombay", "Cardiology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/cardiology",
     ["cardio", "heart"]),
    ("bombay", "Neurology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/neurology",
     ["neuro", "brain", "migraine", "epilepsy"]),
    ("bombay", "Neurosurgery", f"{BOMBAY}/consultants", f"{BOMBAY}/services/neurosurgery",
     ["neuro", "brain", "spine surgery"]),
    ("bombay", "Orthopaedics", f"{BOMBAY}/consultants", f"{BOMBAY}/services/orthopaedics",
     ["ortho", "bone", "joint", "knee"]),
    ("bombay", "Spine Surgery", f"{BOMBAY}/consultants", f"{BOMBAY}/services/spine-surgery",
     ["spine", "back pain", "ortho", "neuro"]),
    ("bombay", "Gastroenterology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/gastroenterology",
     ["gastro", "stomach", "liver", "digestive"]),
    ("bombay", "Nephrology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/nephrology",
     ["kidney", "renal"]),
    ("bombay", "Urology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/urology",
     ["urinary", "kidney stone", "prostate"]),
    ("bombay", "Endocrinology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/endocrinology",
     ["hormone", "thyroid", "diabetes"]),
    ("bombay", "Diabetology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/diabetology",
     ["diabetes", "sugar", "endocrinology"]),
    ("bombay", "Pulmonary Medicine", f"{BOMBAY}/consultants", f"{BOMBAY}/services/pulmonary-medicine",
     ["lungs", "asthma", "copd", "breathing", "tb", "tuberculosis"]),
    ("bombay", "General Medicine & Infectious Disease",
     f"{BOMBAY}/consultants", f"{BOMBAY}/services/general-medicine-infectious-disease",
     ["physician", "fever", "infection", "infectious", "dengue", "typhoid", "covid", "flu", "general"]),
    ("bombay", "Dermatology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/dermatology",
     ["skin", "hair"]),
    ("bombay", "ENT & Laryngology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/ent-laryngology",
     ["ent", "ear", "nose", "throat"]),
    ("bombay", "Ophthalmology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/ophthalmology",
     ["eye", "vision"]),
    ("bombay", "Gynaecology & Obstetrics", f"{BOMBAY}/consultants",
     f"{BOMBAY}/services/gynaecology-obstetrics", ["pregnancy", "women", "gynae", "obstetrics"]),
    ("bombay", "Paediatrics", f"{BOMBAY}/consultants", f"{BOMBAY}/services/paediatrics",
     ["child", "baby", "kids"]),
    ("bombay", "Paediatric Surgery", f"{BOMBAY}/consultants", f"{BOMBAY}/services/paediatric-surgery",
     ["child surgery", "kids"]),
    ("bombay", "Psychiatry", f"{BOMBAY}/consultants", f"{BOMBAY}/services/psychiatry",
     ["mental health", "depression", "anxiety"]),
    ("bombay", "Medical Oncology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/medical-oncology",
     ["cancer", "oncology", "tumor"]),
    ("bombay", "Surgical Oncology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/surgical-oncology",
     ["cancer", "oncology", "tumor", "surgery"]),
    ("bombay", "Radiation Oncology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/radiation-oncology",
     ["cancer", "oncology", "radiation"]),
    ("bombay", "General & Minimal Access Surgery", f"{BOMBAY}/consultants",
     f"{BOMBAY}/services/general-surgery", ["surgery", "general surgeon", "laparoscopic"]),
    ("bombay", "Plastic Surgery", f"{BOMBAY}/consultants", f"{BOMBAY}/services/plastic-surgery",
     ["cosmetic", "reconstructive", "burns"]),
    ("bombay", "Rheumatology", f"{BOMBAY}/consultants", f"{BOMBAY}/services/rheumatology",
     ["arthritis", "joint pain", "autoimmune"]),
    ("bombay", "Cardiovascular Thoracic Surgery", f"{BOMBAY}/consultants",
     f"{BOMBAY}/services/cardiovascular-thoracic-surgery", ["cardio", "heart surgery", "bypass"]),
    ("bombay", "Critical Care Medicine", f"{BOMBAY}/consultants",
     f"{BOMBAY}/services/critical-care-medicine", ["icu", "critical", "emergency"]),
    # ---- Apollo Hospitals (per-specialty booking pages) ----
    ("apollo", "Cardiology", f"{APOLLO}/book-doctor-appointment/cardiologist", None,
     ["cardio", "heart"]),
    ("apollo", "Orthopaedics", f"{APOLLO}/book-doctor-appointment/orthopedician", None,
     ["ortho", "bone", "joint", "knee"]),
    ("apollo", "Neurology", f"{APOLLO}/book-doctor-appointment/neurologist", None,
     ["neuro", "brain", "migraine", "epilepsy"]),
    ("apollo", "Gastroenterology", f"{APOLLO}/book-doctor-appointment/gastroenterologist", None,
     ["gastro", "stomach", "liver", "digestive"]),
    ("apollo", "Oncology", f"{APOLLO}/book-doctor-appointment/oncologist", None,
     ["cancer", "oncology", "tumor", "medical oncology", "surgical oncology"]),
    ("apollo", "Nephrology", f"{APOLLO}/book-doctor-appointment/nephrologist", None,
     ["kidney", "renal"]),
    ("apollo", "Urology", f"{APOLLO}/book-doctor-appointment/urologist", None,
     ["urinary", "kidney stone", "prostate"]),
    ("apollo", "General Medicine", f"{APOLLO}/book-doctor-appointment/general-physician", None,
     ["physician", "fever", "infection", "dengue", "typhoid", "covid", "flu", "general",
      "diabetes", "hypertension", "internal"]),
    ("apollo", "Pulmonology", f"{APOLLO}/book-doctor-appointment/pulmonologist", None,
     ["lungs", "asthma", "copd", "breathing", "tb", "tuberculosis", "pulmonary"]),
    ("apollo", "Paediatrics", f"{APOLLO}/book-doctor-appointment/pediatrician", None,
     ["child", "baby", "kids", "paediatrics"]),
    ("apollo", "Gynaecology & Obstetrics", f"{APOLLO}/book-doctor-appointment/gynecologist", None,
     ["pregnancy", "women", "gynae", "obstetrics"]),
    ("apollo", "ENT", f"{APOLLO}/book-doctor-appointment/ent-specialist", None,
     ["ent", "ear", "nose", "throat", "laryngology"]),
    ("apollo", "Dermatology", f"{APOLLO}/book-doctor-appointment/dermatologist", None,
     ["skin", "hair"]),
    ("apollo", "Endocrinology & Diabetes Care", f"{APOLLO}/book-doctor-appointment/endocrinologist", None,
     ["hormone", "thyroid", "diabetes", "diabetology", "sugar", "endocrinology"]),
    ("apollo", "Psychiatry", f"{APOLLO}/book-doctor-appointment/psychiatrist", None,
     ["mental health", "depression", "anxiety"]),
    ("apollo", "Rheumatology", f"{APOLLO}/book-doctor-appointment/rheumatologist", None,
     ["arthritis", "joint pain", "autoimmune"]),
    ("apollo", "General Surgery", f"{APOLLO}/book-doctor-appointment/general-surgeon", None,
     ["surgery", "general surgeon", "laparoscopic"]),
    ("apollo", "Dentistry", f"{APOLLO}/book-doctor-appointment/dentist", None,
     ["dental", "teeth"]),
    ("apollo", "Infectious Diseases", f"{APOLLO}/book-doctor-appointment/infectious-diseases", None,
     ["infection", "fever", "dengue", "typhoid", "covid", "tb", "tuberculosis"]),
    ("apollo", "Plastic Surgery", f"{APOLLO}/book-doctor-appointment/plastic-surgeon", None,
     ["cosmetic", "reconstructive", "burns"]),
    ("apollo", "Ophthalmology", f"{APOLLO}/book-doctor-appointment/opthalmologist", None,
     ["eye", "vision"]),
    ("apollo", "Vascular Surgery", f"{APOLLO}/book-doctor-appointment/vascular-surgery", None,
     ["vascular", "veins", "cardio"]),
    ("apollo", "Neurosurgery", f"{APOLLO}/doctors", None,
     ["neuro", "brain", "spine surgery", "spine"]),
    # ---- Fortis Healthcare (per-specialty doctor lists with booking) ----
    ("fortis", "Cardiac Sciences", f"{FORTIS}/doctors/speciality/cardiac-sciences-5", None,
     ["cardio", "heart", "cardiology"]),
    ("fortis", "Dermatology", f"{FORTIS}/doctors/speciality/dermatology-8", None,
     ["skin", "hair"]),
    ("fortis", "Diabetology/Endocrinology", f"{FORTIS}/doctors/speciality/diabetologyendocrinology-9", None,
     ["diabetes", "diabetology", "sugar", "hormone", "thyroid", "endocrinology"]),
    ("fortis", "ENT", f"{FORTIS}/doctors/speciality/ent-ear-nose-and-throat-47", None,
     ["ent", "ear", "nose", "throat", "laryngology"]),
    ("fortis", "Gastroenterology", f"{FORTIS}/doctors/speciality/gastroenterology-50", None,
     ["gastro", "stomach", "liver", "digestive"]),
    ("fortis", "General Surgery", f"{FORTIS}/doctors/speciality/general-surgery-54", None,
     ["surgery", "general surgeon", "laparoscopic"]),
    ("fortis", "Infectious Diseases", f"{FORTIS}/doctors/speciality/infectious-diseases-49", None,
     ["infection", "fever", "dengue", "typhoid", "covid", "tb", "tuberculosis"]),
    ("fortis", "Internal Medicine", f"{FORTIS}/doctors/speciality/internal-medicine-17", None,
     ["physician", "fever", "general", "flu", "diabetes", "hypertension",
      "general medicine", "internal"]),
    ("fortis", "Nephrology", f"{FORTIS}/doctors/speciality/nephrology-28", None,
     ["kidney", "renal"]),
    ("fortis", "Neurology", f"{FORTIS}/doctors/speciality/neurology-69", None,
     ["neuro", "brain", "migraine", "epilepsy"]),
    ("fortis", "Neurosurgery", f"{FORTIS}/doctors/speciality/neurosurgery-30", None,
     ["neuro", "brain", "spine surgery", "spine"]),
    ("fortis", "Obstetrics and Gynaecology",
     f"{FORTIS}/doctors/speciality/obstetrics-and-gynaecology-18", None,
     ["pregnancy", "women", "gynae", "obstetrics"]),
    ("fortis", "Oncology", f"{FORTIS}/doctors/speciality/oncology-79", None,
     ["cancer", "oncology", "tumor"]),
    ("fortis", "Medical Oncology", f"{FORTIS}/doctors/speciality/medical-oncology-5", None,
     ["cancer", "oncology", "chemo"]),
    ("fortis", "Surgical Oncology", f"{FORTIS}/doctors/speciality/surgical-oncology-10", None,
     ["cancer", "oncology", "surgery", "tumor"]),
    ("fortis", "Radiation Oncology", f"{FORTIS}/doctors/speciality/radiation-oncology-9", None,
     ["cancer", "oncology", "radiation"]),
    ("fortis", "Ophthalmology", f"{FORTIS}/doctors/speciality/ophthalmology-32", None,
     ["eye", "vision"]),
    ("fortis", "Orthopaedics", f"{FORTIS}/doctors/speciality/orthopaedics-14", None,
     ["ortho", "bone", "joint", "knee"]),
    ("fortis", "Paediatrics", f"{FORTIS}/doctors/speciality/paediatrics-10", None,
     ["child", "baby", "kids"]),
    ("fortis", "Plastic and Reconstructive Surgery",
     f"{FORTIS}/doctors/speciality/plastic-and-reconstructive-surgery-3", None,
     ["cosmetic", "reconstructive", "burns", "plastic"]),
    ("fortis", "Psychiatry", f"{FORTIS}/doctors/speciality/psychiatry-64", None,
     ["mental health", "depression", "anxiety"]),
    ("fortis", "Pulmonology", f"{FORTIS}/doctors/speciality/pulmonology-40", None,
     ["lungs", "asthma", "copd", "breathing", "tb", "tuberculosis", "pulmonary", "pulmonary medicine"]),
    ("fortis", "Rheumatology", f"{FORTIS}/doctors/speciality/rheumatology-34", None,
     ["arthritis", "joint pain", "autoimmune"]),
    ("fortis", "Urology", f"{FORTIS}/doctors/speciality/urology-29", None,
     ["urinary", "kidney stone", "prostate"]),
    ("fortis", "Endocrinology", f"{FORTIS}/doctors/speciality/endocrinology-44", None,
     ["hormone", "thyroid", "diabetes", "endocrinology"]),    ("fortis", "Critical Care", f"{FORTIS}/doctors/speciality/critical-care-65", None,
     ["icu", "critical", "emergency"]),
    # ---- Lilavati Hospital, Mumbai (central appointment request page) ----
    ("lilavati", "Cardiology", LILAVATI_BOOK, f"{LILAVATI}/specialities/cardiology",
     ["cardio", "heart"]),
    ("lilavati", "Neurology", LILAVATI_BOOK, f"{LILAVATI}/specialities/neurology",
     ["neuro", "brain", "migraine", "epilepsy"]),
    ("lilavati", "Orthopaedics", LILAVATI_BOOK, f"{LILAVATI}/specialities/orthopaedics",
     ["ortho", "bone", "joint", "knee"]),
    ("lilavati", "Gastroenterology", LILAVATI_BOOK, None,
     ["gastro", "stomach", "liver", "digestive"]),
    ("lilavati", "Nephrology", LILAVATI_BOOK, None,
     ["kidney", "renal"]),
    ("lilavati", "Urology", LILAVATI_BOOK, None,
     ["urinary", "kidney stone", "prostate"]),
    ("lilavati", "Oncology", LILAVATI_BOOK, None,
     ["cancer", "oncology", "tumor"]),
    ("lilavati", "Paediatrics", LILAVATI_BOOK, None,
     ["child", "baby", "kids"]),
    ("lilavati", "Gynaecology & Obstetrics", LILAVATI_BOOK, None,
     ["pregnancy", "women", "gynae", "obstetrics"]),
    ("lilavati", "Dermatology", LILAVATI_BOOK, None,
     ["skin", "hair"]),
    ("lilavati", "ENT", LILAVATI_BOOK, None,
     ["ent", "ear", "nose", "throat"]),
    ("lilavati", "Ophthalmology", LILAVATI_BOOK, None,
     ["eye", "vision"]),
    ("lilavati", "Endocrinology & Diabetes", LILAVATI_BOOK, None,
     ["hormone", "thyroid", "diabetes", "sugar"]),
    ("lilavati", "Pulmonology", LILAVATI_BOOK, None,
     ["lungs", "asthma", "copd", "breathing"]),
    ("lilavati", "General Medicine", LILAVATI_BOOK, None,
     ["physician", "fever", "general", "infection", "flu"]),
    # ---- Kokilaben Hospital, Mumbai (Make an Appointment page) ----
    ("kokilaben", "Cardiology", KOKILABEN_BOOK, f"{KOKILABEN}/specialities/cardiology",
     ["cardio", "heart"]),
    ("kokilaben", "Neurology", KOKILABEN_BOOK, f"{KOKILABEN}/specialities/neurology",
     ["neuro", "brain", "migraine", "epilepsy"]),
    ("kokilaben", "Neurosurgery", KOKILABEN_BOOK, None,
     ["neuro", "brain", "spine surgery", "spine"]),
    ("kokilaben", "Orthopaedics", KOKILABEN_BOOK, None,
     ["ortho", "bone", "joint", "knee"]),
    ("kokilaben", "Gastroenterology", KOKILABEN_BOOK, None,
     ["gastro", "stomach", "liver", "digestive"]),
    ("kokilaben", "Nephrology", KOKILABEN_BOOK, None,
     ["kidney", "renal"]),
    ("kokilaben", "Urology", KOKILABEN_BOOK, None,
     ["urinary", "kidney stone", "prostate"]),
    ("kokilaben", "Oncology", KOKILABEN_BOOK, None,
     ["cancer", "oncology", "tumor"]),
    ("kokilaben", "Paediatrics", KOKILABEN_BOOK, None,
     ["child", "baby", "kids"]),
    ("kokilaben", "Gynaecology & Obstetrics", KOKILABEN_BOOK, None,
     ["pregnancy", "women", "gynae", "obstetrics"]),
    ("kokilaben", "Dermatology", KOKILABEN_BOOK, None,
     ["skin", "hair"]),
    ("kokilaben", "ENT", KOKILABEN_BOOK, None,
     ["ent", "ear", "nose", "throat"]),
    ("kokilaben", "Ophthalmology", KOKILABEN_BOOK, None,
     ["eye", "vision"]),
    ("kokilaben", "Endocrinology & Diabetes", KOKILABEN_BOOK, None,
     ["hormone", "thyroid", "diabetes", "sugar"]),
    ("kokilaben", "Pulmonology", KOKILABEN_BOOK, None,
     ["lungs", "asthma", "copd", "breathing"]),
    ("kokilaben", "General Medicine", KOKILABEN_BOOK, None,
     ["physician", "fever", "general", "infection", "flu"]),
    # ---- Nanavati Max, Mumbai (Book an Appointment page) ----
    ("nanavati", "Cardiology", NANAVATI_BOOK, f"{NANAVATI}/speciality/cardiology",
     ["cardio", "heart"]),
    ("nanavati", "Neurology", NANAVATI_BOOK, f"{NANAVATI}/speciality/neurology",
     ["neuro", "brain", "migraine", "epilepsy"]),
    ("nanavati", "Neurosurgery", NANAVATI_BOOK, None,
     ["neuro", "brain", "spine surgery", "spine"]),
    ("nanavati", "Orthopaedics", NANAVATI_BOOK, None,
     ["ortho", "bone", "joint", "knee"]),
    ("nanavati", "Gastroenterology", NANAVATI_BOOK, None,
     ["gastro", "stomach", "liver", "digestive"]),
    ("nanavati", "Nephrology", NANAVATI_BOOK, None,
     ["kidney", "renal"]),
    ("nanavati", "Urology", NANAVATI_BOOK, None,
     ["urinary", "kidney stone", "prostate"]),
    ("nanavati", "Oncology", NANAVATI_BOOK, None,
     ["cancer", "oncology", "tumor"]),
    ("nanavati", "Paediatrics", NANAVATI_BOOK, None,
     ["child", "baby", "kids"]),
    ("nanavati", "Gynaecology & Obstetrics", NANAVATI_BOOK, None,
     ["pregnancy", "women", "gynae", "obstetrics"]),
    ("nanavati", "Dermatology", NANAVATI_BOOK, None,
     ["skin", "hair"]),
    ("nanavati", "ENT", NANAVATI_BOOK, None,
     ["ent", "ear", "nose", "throat"]),
    ("nanavati", "Ophthalmology", NANAVATI_BOOK, None,
     ["eye", "vision"]),
    ("nanavati", "Endocrinology & Diabetes", NANAVATI_BOOK, None,
     ["hormone", "thyroid", "diabetes", "sugar"]),
    ("nanavati", "Pulmonology", NANAVATI_BOOK, None,
     ["lungs", "asthma", "copd", "breathing"]),
    ("nanavati", "General Medicine", NANAVATI_BOOK, None,
     ["physician", "fever", "general", "infection", "flu"]),
]

_HOSP = {h["id"]: h for h in HOSPITALS}


def _entry(hid: str, name: str, book_url: str, info_url: str | None, tags: list[str]) -> dict:
    h = _HOSP[hid]
    return {
        "hospital_id": hid,
        "hospital": h["name"],
        "cities": h["cities"],
        "specialty": name,
        "tags": tags,
        "consultants_url": h["consultants_url"],
        "book_url": book_url,
        "info_url": info_url,
    }


@router.get("/")
def hospital_list():
    """The hospitals covered. Public."""
    return {"count": len(HOSPITALS), "results": HOSPITALS}


@router.get("/doctors")
def hospital_doctors(
    q: str | None = Query(None, description="Filter, e.g. cardio, neuro, skin, diabetes"),
    specialty: str | None = Query(None, description="Exact specialty name"),
    hospital: str | None = Query(None, description="Hospital id or name, e.g. apollo"),
):
    """Specialties with doctors available for appointment (deep links). Public."""
    items = [_entry(*s) for s in SPECIALTIES]
    if hospital and hospital.strip():
        hl = hospital.lower().strip()
        items = [i for i in items if hl in (i["hospital_id"] + " " + i["hospital"]).lower()]
    if specialty:
        items = [i for i in items if i["specialty"].lower() == specialty.lower().strip()]
    if q and q.strip():
        ql = q.lower().strip()
        items = [i for i in items
                 if ql in i["specialty"].lower() or ql in i["hospital"].lower()
                 or any(ql in t for t in i["tags"])]
    return {
        "count": len(items),
        "results": items,
        "note": ("These hospitals offer no public booking API, so availability "
                 "lives on their sites — every card links straight to doctor "
                 "lists with live Book Appointment buttons."),
    }


@router.get("/specialties")
def hospital_specialties():
    """Specialty names grouped by hospital (for dropdowns / mapping). Public."""
    return {
        "results": [
            {"hospital_id": h["id"], "hospital": h["name"],
             "specialties": [s[1] for s in SPECIALTIES if s[0] == h["id"]]}
            for h in HOSPITALS
        ]
    }
