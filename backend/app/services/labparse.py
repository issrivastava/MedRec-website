"""Naive lab-value extractor for OCR text. Returns [(test_key, value)]."""
from __future__ import annotations
import re


def _num(s: str) -> float | None:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


PATTERNS: list[tuple[str, str]] = [
    ("hemoglobin", r"(?:hemoglobin|haemoglobin|\bhb\b)[^\d]{0,25}(\d+\.?\d*)"),
    ("wbc", r"(?:wbc|white blood cells?|leukocytes?|\btlc\b)[^\d]{0,25}(\d[\d,\.]*)"),
    ("platelets", r"(?:platelets?)[^\d]{0,25}(\d[\d,\.]*)"),
    ("glucose_fasting", r"(?:fasting(?: blood)? (?:sugar|glucose)|\bfbs\b|fasting glucose)[^\d]{0,30}(\d+\.?\d*)"),
    ("hba1c", r"(?:hba1c|\ba1c\b)[^\d]{0,20}(\d+\.?\d*)"),
    ("cholesterol_total", r"(?:total cholesterol|cholesterol)[^\d]{0,25}(\d+\.?\d*)"),
    ("creatinine", r"(?:creatinine)[^\d]{0,20}(\d+\.?\d*)"),
    ("tsh", r"(?:\btsh\b|thyroid stimulating)[^\d]{0,20}(\d+\.?\d*)"),
]

BP_PATTERN = r"(?:\bbp\b|blood pressure)[^\d]{0,25}(\d{2,3})\s*/\s*(\d{2,3})"


def parse_lab_values(text: str) -> list[tuple[str, float]]:
    found: list[tuple[str, float]] = []
    low = (text or "").lower()
    for key, pat in PATTERNS:
        m = re.search(pat, low)
        if m:
            v = _num(m.group(1))
            if v is not None and key not in [k for k, _ in found]:
                found.append((key, v))
    m = re.search(BP_PATTERN, low)
    if m:
        s, d = _num(m.group(1)), _num(m.group(2))
        if s is not None:
            found.append(("systolic", s))
        if d is not None:
            found.append(("diastolic", d))
    return found
