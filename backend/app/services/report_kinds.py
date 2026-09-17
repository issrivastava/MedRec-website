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

# Keywords to auto-suggest a kind from a free-text title
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
    ("mri", "mri"), ("ct scan", "ct"), ("ultrasound", "ultrasound"),
    ("sono", "ultrasound"), ("mammograph", "mammography"), ("pet scan", "pet"),
    ("dexa", "dexa"), ("ecg", "ecg"), ("echo", "echo"), ("tmt", "stress_test"),
    ("stress test", "stress_test"), ("holter", "holter"),
    ("prescription", "prescription"), ("discharge", "discharge_summary"),
    ("vaccine", "vaccination"), ("vaccination", "vaccination"),
    ("operative", "operative_note"), ("biopsy", "biopsy"),
]


def infer_kind(title: str | None) -> str | None:
    low = (title or "").lower()
    for kw, kind in TITLE_KEYWORDS:
        if kw in low:
            return kind
    return None


def valid_category(cat: str | None) -> bool:
    return not cat or cat in CATEGORIES


def valid_kind(kind: str | None) -> bool:
    return not kind or kind in KIND_TO_CATEGORY


def category_of(kind: str | None) -> str | None:
    return KIND_TO_CATEGORY.get(kind) if kind else None
