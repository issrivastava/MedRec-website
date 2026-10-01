"""Naive lab-value extractor for OCR text. Returns [(test_key, value)]."""
from __future__ import annotations
import re


def _num(s: str) -> float | None:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


PATTERNS: list[tuple[str, str]] = [
    # CBC
    ("hemoglobin", r"(?:hemoglobin|haemoglobin|\bhb\b)[^\d]{0,25}(\d+\.?\d*)"),
    ("wbc", r"(?:wbc|white blood cells?|leukocytes?|\btlc\b)[^\d]{0,25}(\d[\d,\.]*)"),
    ("mpv", r"(?:\bmpv\b|mean platelet volume)[^\d]{0,25}(\d+\.?\d*)"),
    ("platelets", r"(?:platelets?)(?!\s+volume)[^\d]{0,25}(\d[\d,\.]*)"),
    ("rbc", r"(?:\brbc\b|red blood cells?|erythrocytes?)[^\d]{0,25}(\d+\.?\d*)"),
    ("hct", r"(?:\bhct\b|hematocrit|packed cell volume|\bpcv\b)[^\d]{0,25}(\d+\.?\d*)"),
    ("mcv", r"(?:\bmcv\b|mean corpuscular volume)[^\d]{0,25}(\d+\.?\d*)"),
    ("mch", r"(?:\bmch\b|mean corpuscular hemoglobin(?! concentration))[^\d]{0,25}(\d+\.?\d*)"),
    ("mchc", r"(?:\bmchc\b|mean corpuscular hemoglobin concentration)[^\d]{0,25}(\d+\.?\d*)"),
    ("rdw", r"(?:\brdw\b|red (?:cell|blood cell) distribution width)[^\d]{0,25}(\d+\.?\d*)"),
    # Diabetes / sugar
    ("glucose_fasting", r"(?:fasting(?: blood)? (?:sugar|glucose)|\bfbs\b|fasting glucose)[^\d]{0,30}(\d+\.?\d*)"),
    ("glucose_pp", r"(?:post ?prandial|ppbs|\bpp\b|post lunch)[^\d]{0,30}(\d+\.?\d*)"),
    ("hba1c", r"(?:hba1c|\ba1c\b)[^\d]{0,20}(\d+\.?\d*)"),
    ("glucose_random", r"(?:random(?: blood)? (?:sugar|glucose)|\brbs\b)[^\d]{0,30}(\d+\.?\d*)"),
    # Lipid
    ("cholesterol_total", r"(?:total cholesterol|cholesterol)[^\d]{0,25}(\d+\.?\d*)"),
    ("ldl", r"(?:\bldl\b|low density lipoprotein)[^\d]{0,25}(\d+\.?\d*)"),
    ("hdl", r"(?:\bhdl\b|high density lipoprotein)[^\d]{0,25}(\d+\.?\d*)"),
    ("triglycerides", r"(?:triglycerides?|\btg\b|\btgl\b)[^\d]{0,25}(\d+\.?\d*)"),
    # Kidney + electrolytes
    ("creatinine", r"(?:creatinine)[^\d]{0,20}(\d+\.?\d*)"),
    ("urea", r"(?:\burea\b|blood urea)[^\d]{0,20}(\d+\.?\d*)"),
    ("uric_acid", r"(?:uric acid|\burate\b)[^\d]{0,25}(\d+\.?\d*)"),
    ("sodium", r"(?:serum sodium|\bsodium\b)[^\d]{0,25}(\d+\.?\d*)"),
    ("potassium", r"(?:serum potassium|\bpotassium\b)[^\d]{0,25}(\d+\.?\d*)"),
    # Liver (LFT)
    ("bilirubin_total", r"(?:total bilirubin|bilirubin total|\bbilirubin\b)[^\d]{0,25}(\d+\.?\d*)"),
    ("sgot", r"(?:\bsgot\b|\bast\b|aspartate aminotransferase)[^\d]{0,25}(\d+\.?\d*)"),
    ("sgpt", r"(?:\bsgpt\b|\balt\b|alanine aminotransferase)[^\d]{0,25}(\d+\.?\d*)"),
    ("alp", r"(?:\balp\b|alkaline phosphatase)[^\d]{0,25}(\d+\.?\d*)"),
    ("albumin", r"(?:\balbumin\b|serum albumin)[^\d]{0,25}(\d+\.?\d*)"),
    ("ggt", r"(?:\bggt\b|gamma[ -]?gt|gamma glutamyl(?: transpeptidase)?)[^\d]{0,25}(\d+\.?\d*)"),
    ("total_protein", r"(?:total protein|total serum protein)[^\d]{0,25}(\d+\.?\d*)"),
    # Iron studies
    ("ferritin", r"(?:serum ferritin|\bferritin\b)[^\d]{0,25}(\d[\d,\.]*)"),
    ("serum_iron", r"(?:serum iron)[^\d]{0,25}(\d+\.?\d*)"),
    ("tibc", r"(?:\btibc\b|total iron[ -]?binding capacity)[^\d]{0,30}(\d[\d,\.]*)"),
    # Thyroid (free hormones first: "FT4" must not be read as T4)
    ("tsh", r"(?:\btsh\b|thyroid stimulating)[^\d]{0,20}(\d+\.?\d*)"),
    ("ft3", r"(?:\bft3\b|free t3|free triiodothyronine)[^\d]{0,20}(\d+\.?\d*)"),
    ("t3", r"(?:(?<!free )(?<!f)\bt3\b|triiodothyronine)[^\d]{0,20}(\d+\.?\d*)"),
    ("ft4", r"(?:\bft4\b|free t4|free thyroxine)[^\d]{0,20}(\d+\.?\d*)"),
    ("t4", r"(?:(?<!free )(?<!f)\bt4\b|(?<!free )thyroxine)[^\d]{0,20}(\d+\.?\d*)"),
    # Vitals beyond BP
    ("pulse", r"(?:pulse(?: rate)?|heart rate)[^\d]{0,20}(\d{2,3})"),
    ("spo2", r"(?:spo2|spo 2|oxygen saturation|o2 sat)[^\d]{0,20}(\d{2,3})"),
    ("bmi", r"(?:\bbmi\b|body mass index)[^\d]{0,20}(\d+\.?\d*)"),
    # Inflammation / vitamins / minerals
    ("esr", r"(?:\besr\b|erythrocyte sedimentation)[^\d]{0,25}(\d+\.?\d*)"),
    ("crp", r"(?:\bcrp\b|c-reactive protein)[^\d]{0,25}(\d+\.?\d*)"),
    ("vitamin_d", r"(?:vitamin d|25-?oh vitamin d|25\(oh\)d)[^\d]{0,30}(\d+\.?\d*)"),
    ("vitamin_b12", r"(?:vitamin b12|\bb12\b)[^\d]{0,30}(\d[\d,\.]*)"),
    ("calcium", r"(?:calcium|serum calcium)[^\d]{0,25}(\d+\.?\d*)"),
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
