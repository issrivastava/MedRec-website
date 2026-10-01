"""Canonical report taxonomy: category -> report kinds (X-Ray, CBC, MRI, TSH, LFT...).

Single source of truth for the backend. The frontend mirrors it in
frontend/src/reportKinds.js — keep both in sync when adding kinds.
"""
from __future__ import annotations

CATEGORIES: dict[str, dict] = {
    "lab": {
        "label": "Pathology Lab",
        "kinds": [
            {"key": "cbc", "label": "CBC (Complete Blood Count)"},
            {"key": "tsh", "label": "TSH / Thyroid"},
            {"key": "lft", "label": "LFT (Liver Function)"},
            {"key": "kft", "label": "KFT (Kidney Function)"},
            {"key": "lipid", "label": "Lipid Profile"},
            {"key": "hba1c", "label": "HbA1c / Diabetes"},
            {"key": "blood_sugar", "label": "Blood Sugar (Fasting/PP)"},
            {"key": "urine", "label": "Urine Routine"},
            {"key": "vitamin_d", "label": "Vitamin D / B12"},
            {"key": "esr_crp", "label": "ESR / CRP (Inflammation)"},
            {"key": "other_lab", "label": "Other Lab Test"},
        ],
    },
    "imaging": {
        "label": "Radiology / Imaging",
        "kinds": [
            {"key": "xray", "label": "X-Ray"},
            {"key": "mri", "label": "MRI"},
            {"key": "ct", "label": "CT Scan"},
            {"key": "ultrasound", "label": "Ultrasound / Sonography"},
            {"key": "mammography", "label": "Mammography"},
            {"key": "pet", "label": "PET Scan"},
            {"key": "dexa", "label": "DEXA / Bone Density"},
            {"key": "other_imaging", "label": "Other Imaging"},
        ],
    },
    "cardiology": {
        "label": "Cardiac",
        "kinds": [
            {"key": "ecg", "label": "ECG"},
            {"key": "echo", "label": "Echo / 2D-Echo"},
            {"key": "stress_test", "label": "Stress Test / TMT"},
            {"key": "holter", "label": "Holter Monitor"},
        ],
    },
    "prescription": {
        "label": "Prescriptions & Clinical",
        "kinds": [
            {"key": "prescription", "label": "Prescription"},
            {"key": "discharge_summary", "label": "Discharge Summary"},
            {"key": "consultation", "label": "Consultation Note"},
            {"key": "vaccination", "label": "Vaccination Record"},
            {"key": "operative_note", "label": "Operative / Procedure Note"},
            {"key": "biopsy", "label": "Biopsy / Histopathology"},
        ],
    },
    "other": {
        "label": "Other",
        "kinds": [
            {"key": "general_report", "label": "General Report"},
            {"key": "scan_copy", "label": "Scanned Copy"},
            {"key": "other", "label": "Other"},
        ],
    },
}

# kind -> category reverse lookup
KIND_TO_CATEGORY: dict[str, str] = {
    kind["key"]: cat for cat, spec in CATEGORIES.items() for kind in spec["kinds"]
}

# kind -> default legacy doc_type (keeps old UI working)
# NOTE: doc_type is DERIVED from report_kind — never the other way round.
# cardiology kinds stay "report" (there is no dedicated cardiology doc_type);
# what keeps them out of lab-compare is COMPARABLE_KINDS below, not doc_type.
KIND_TO_DOC_TYPE: dict[str, str] = {
    "cbc": "lab", "tsh": "lab", "lft": "lab", "kft": "lab", "lipid": "lab",
    "hba1c": "lab", "blood_sugar": "lab", "urine": "lab", "vitamin_d": "lab",
    "esr_crp": "lab", "other_lab": "lab",
    "xray": "scan", "mri": "scan", "ct": "scan", "ultrasound": "scan",
    "mammography": "scan", "pet": "scan", "dexa": "scan", "other_imaging": "scan",
    "ecg": "report", "echo": "report", "stress_test": "report", "holter": "report",
    "prescription": "prescription", "discharge_summary": "prescription",
    "consultation": "report", "vaccination": "report", "operative_note": "report",
    "biopsy": "lab",
    "general_report": "report", "scan_copy": "scan", "other": "other",
}

# Legacy doc_types stored in documents.doc_type (DB-compatible — do NOT rename
# without a migration). The frontend shows these as the top-level Type filter.
DOC_TYPES: dict[str, str] = {
    "lab": "Lab",
    "scan": "Scan / Imaging",
    "report": "Report (ECG, Echo, clinical notes…)",
    "prescription": "Prescription",
    "other": "Other",
}

# Only these kinds carry numeric lab values worth trending in "What changed".
# Prescriptions, imaging (MRI/X-Ray/ECG…), discharge summaries etc. are
# explicitly EXCLUDED — comparing them yields "no overlapping lab values"
# and confuses users ("my prescription is being treated as a report").
COMPARABLE_KINDS: frozenset[str] = frozenset({
    "cbc", "tsh", "lft", "kft", "lipid", "hba1c",
    "blood_sugar", "urine", "vitamin_d", "esr_crp", "other_lab", "biopsy",
})

# Kinds that are prescriptions / clinical paperwork — never lab-comparable.
PRESCRIPTION_KINDS: frozenset[str] = frozenset({
    "prescription", "discharge_summary",
})

# Keywords to auto-suggest a kind from free text (title + filename + notes).
# Keep in sync with the frontend keyword overrides in auto-classify — this
# table IS the single source of truth, upload + auto-classify both use it.
TITLE_KEYWORDS: list[tuple[str, str]] = [
    ("cbc", "cbc"), ("complete blood", "cbc"), ("hemogram", "cbc"),
    ("tsh", "tsh"), ("thyroid", "tsh"), ("t3", "tsh"), ("t4", "tsh"),
    ("lft", "lft"), ("liver function", "lft"), ("sgot", "lft"), ("sgpt", "lft"),
    ("kft", "kft"), ("kidney function", "kft"), ("creatinine", "kft"),
    ("lipid", "lipid"), ("cholesterol", "lipid"), ("triglyceride", "lipid"),
    ("hba1c", "hba1c"), ("a1c", "hba1c"),
    ("sugar", "blood_sugar"), ("glucose", "blood_sugar"), ("fbs", "blood_sugar"),
    ("urine", "urine"),
    ("vitamin d", "vitamin_d"), ("vitamin b12", "vitamin_d"), ("b12", "vitamin_d"),
    ("esr", "esr_crp"), ("crp", "esr_crp"),
    ("x-ray", "xray"), ("xray", "xray"), ("x ray", "xray"),
    ("mri", "mri"), ("ct scan", "ct"), ("ct ", "ct"),
    ("ultrasound", "ultrasound"), ("sonography", "ultrasound"),
    ("sono", "ultrasound"), ("mammograph", "mammography"), ("pet scan", "pet"),
    ("dexa", "dexa"), ("bone density", "dexa"),
    ("ecg", "ecg"), ("ekg", "ecg"), ("echo", "echo"), ("2d echo", "echo"),
    ("tmt", "stress_test"), ("stress test", "stress_test"),
    ("holter", "holter"),
    ("prescription", "prescription"), ("prescribe", "prescription"),
    (" rx ", "prescription"), (" rx", "prescription"),
    ("medicine", "prescription"), ("medication", "prescription"),
    ("discharge", "discharge_summary"),
    ("consultation", "consultation"), ("consult", "consultation"),
    ("vaccine", "vaccination"), ("vaccination", "vaccination"),
    ("immunis", "vaccination"),
    ("operative", "operative_note"), ("operation note", "operative_note"),
    ("procedure note", "operative_note"),
    ("biopsy", "biopsy"), ("histopath", "biopsy"),
    # generic scan-copy hints (checked LAST so specific kinds win)
    ("scan", "scan_copy"), ("scanned", "scan_copy"),
]


def infer_kind(title: str | None, filename: str | None = None, notes: str | None = None) -> str | None:
    """Infer kind from title + filename + notes combined (all optional).

    Specific kinds are matched first; generic "scan" fallback is last so
    e.g. "ECG scan" still resolves to ecg, not scan_copy.
    """
    low = f"{title or ''} {filename or ''} {notes or ''}".lower()
    if not low.strip():
        return None
    for kw, kind in TITLE_KEYWORDS:
        if kw in low:
            # "ct " with trailing space also matches "ct scan" — fine, both map to ct.
            # Guard the very generic "scan" fallback: only when nothing more
            # specific matched earlier (it is last in the table, so reaching
            # here means nothing specific hit).
            return kind
    return None


def valid_category(cat: str | None) -> bool:
    return not cat or cat in CATEGORIES


def valid_kind(kind: str | None) -> bool:
    return not kind or kind in KIND_TO_CATEGORY


def valid_doc_type(doc_type: str | None) -> bool:
    return not doc_type or doc_type in DOC_TYPES


def category_of(kind: str | None) -> str | None:
    return KIND_TO_CATEGORY.get(kind) if kind else None


def doc_type_of(kind: str | None) -> str | None:
    return KIND_TO_DOC_TYPE.get(kind) if kind else None


def is_comparable_kind(kind: str | None) -> bool:
    """True when the kind carries trendable numeric lab values."""
    return bool(kind) and kind in COMPARABLE_KINDS


def is_prescription_kind(kind: str | None) -> bool:
    return bool(kind) and kind in PRESCRIPTION_KINDS


def resolve_classification(
    doc_type: str | None = None,
    category: str | None = None,
    report_kind: str | None = None,
    title: str | None = None,
    filename: str | None = None,
    notes: str | None = None,
) -> tuple[str, str | None, str | None, bool]:
    """Single source of truth for Type/Category/Kind.

    kind is authoritative: when a valid kind is known (given or inferred
    from title+filename+notes), category and doc_type are DERIVED from it.
    This is what stops "prescription uploaded as report".

    Returns (doc_type, category, report_kind, was_inferred).
    doc_type always falls back to "report" (legacy default); category/kind
    may stay None when nothing could be inferred.
    """
    doc_type = (doc_type or "report").strip().lower() or "report"
    if doc_type not in DOC_TYPES:
        doc_type = "report"
    category = (category or "").strip().lower() or None
    if category and category not in CATEGORIES:
        category = None
    report_kind = (report_kind or "").strip().lower() or None
    if report_kind and report_kind not in KIND_TO_CATEGORY:
        report_kind = None

    inferred = False
    if not report_kind:
        guess = infer_kind(title, filename, notes)
        if guess:
            report_kind = guess
            inferred = True

    if report_kind:
        # kind wins — derive the rest so they can never contradict it
        category = KIND_TO_CATEGORY[report_kind]
        doc_type = KIND_TO_DOC_TYPE[report_kind]
        return doc_type, category, report_kind, inferred

    # No kind at all: reverse-map an explicit doc_type so a user-picked
    # "Prescription" with an empty kind still stores kind=prescription
    # instead of silently becoming a generic report.
    if not inferred and doc_type == "prescription":
        return "prescription", "prescription", "prescription", False
    if not inferred and doc_type == "lab":
        return "lab", "lab", "other_lab", False
    if not inferred and doc_type == "scan":
        return "scan", "imaging", "other_imaging", False
    return doc_type, category, None, inferred
