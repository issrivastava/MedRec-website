"""Medicine Description API.

Tata 1mg has NO official public API (no API key exists to "take data from
Tata 1mg"). So this endpoint uses the best FREE alternative available:

  * openFDA Drug Label API (https://open.fda.gov/apis/drug/label/) —
    free, no key required, maintained by the US FDA / NIH.
    An optional free key (https://open.fda.gov/apis/authentication/)
    raises the rate limit; the app works fine WITHOUT any key.

Every result also carries a Tata 1mg deep link
(https://www.1mg.com/search/all?name=<medicine>) so users can read the
Tata 1mg-style product page / buy the medicine in India.

Optional Tata 1mg passthrough:
  If you obtain an UNOFFICIAL Tata 1mg proxy key (e.g. a RapidAPI
  Tata1mg mirror), set TATA1MG_API_KEY (+ optionally TATA1MG_API_URL)
  and this service will try it first, falling back to openFDA.

Endpoints (all PUBLIC — no login needed):
  GET /api/medicines/search?q=paracetamol&limit=8
  GET /api/medicines/detail?set_id=<openfda set_id>  (or ?name=...)
  GET /api/medicines/popular
"""

import time
from urllib.parse import quote_plus

import httpx
from fastapi import APIRouter, Query

from app.core.config import settings

router = APIRouter()

_CACHE: dict[str, tuple[float, object]] = {}


def _cache_get(key: str):
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, val = hit
    if time.time() - ts > settings.MEDICINES_CACHE_TTL_SEC:
        _CACHE.pop(key, None)
        return None
    return val


def _cache_set(key: str, val: object) -> None:
    if len(_CACHE) > 200:  # tiny LRU-ish guard
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[key] = (time.time(), val)


def _tata1mg_url(name: str) -> str:
    return f"{settings.TATA1MG_SEARCH_URL}?name={quote_plus(name)}"


def _first(v, default: str = "") -> str:
    if isinstance(v, list) and v:
        return str(v[0])
    if isinstance(v, str):
        return v
    return default


def _clip(text: str, n: int = 1200) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[:n].rsplit(" ", 1)[0] + "…"


# Curated fallback for common Indian medicines (Tata 1mg-style wording).
# Used when openFDA is unreachable or returns nothing.
COMMON_MEDS: dict[str, dict] = {
    "paracetamol": {
        "name": "Paracetamol",
        "generic": "Paracetamol (Acetaminophen)",
        "manufacturer": "Various (Crocin, Dolo 650, Calpol)",
        "purpose": "Pain reliever and fever reducer",
        "description": "Paracetamol is widely used in India for fever, headache, body ache, toothache, cold and flu symptoms.",
        "uses": "Fever; headache; migraine; muscle aches; toothache; cold/flu symptoms.",
        "dosage": "Adults: 500–1000 mg every 4–6 hours as needed, max 4000 mg/day. Follow your doctor's advice.",
        "side_effects": "Rare when used as directed. Overdose can cause serious liver damage. Stop and see a doctor for rash, nausea or dark urine.",
        "warnings": "Do not exceed the stated dose. Avoid alcohol. Tell your doctor about liver disease before use.",
    },
    "azithromycin": {
        "name": "Azithromycin",
        "generic": "Azithromycin",
        "manufacturer": "Various (Azithral, Zithromax)",
        "purpose": "Antibiotic (macrolide)",
        "description": "Azithromycin treats bacterial infections of the respiratory tract, skin, ears and some sexually transmitted infections.",
        "uses": "Bacterial sinusitis, bronchitis, pneumonia, ear, skin and throat infections (prescription only).",
        "dosage": "As prescribed — commonly 500 mg once daily for 3–5 days. Complete the full course.",
        "side_effects": "Nausea, diarrhoea, stomach pain, headache. Seek care for irregular heartbeat, hearing changes or allergic reaction.",
        "warnings": "Prescription only. Not for viral infections like common cold. Inform doctor of heart/liver conditions.",
    },
    "cetirizine": {
        "name": "Cetirizine",
        "generic": "Cetirizine",
        "manufacturer": "Various (Cetzine, Zyrtec)",
        "purpose": "Anti-allergic (antihistamine)",
        "description": "Cetirizine relieves allergy symptoms such as sneezing, runny nose, itchy/watery eyes and skin hives.",
        "uses": "Allergic rhinitis, hay fever, urticaria (hives), itching.",
        "dosage": "Adults & children 6+: usually 10 mg once daily. Follow label/doctor advice.",
        "side_effects": "Drowsiness (mild), dry mouth, fatigue, headache.",
        "warnings": "Avoid alcohol. Caution while driving. Consult doctor in pregnancy, kidney disease.",
    },
    "amoxicillin": {
        "name": "Amoxicillin",
        "generic": "Amoxicillin",
        "manufacturer": "Various (Moxikind, Novamox)",
        "purpose": "Antibiotic (penicillin-type)",
        "description": "Amoxicillin treats many bacterial infections including ear, nose, throat, urinary tract and skin infections.",
        "uses": "Bacterial ear/nose/throat, urinary tract, skin and dental infections (prescription only).",
        "dosage": "250–500 mg every 8 hours or as prescribed. Complete the full course even if you feel better.",
        "side_effects": "Nausea, diarrhoea, rash. Seek urgent care for breathing difficulty or swelling (allergy).",
        "warnings": "Prescription only. Tell your doctor about penicillin allergy, asthma or kidney disease.",
    },
    "omeprazole": {
        "name": "Omeprazole",
        "generic": "Omeprazole",
        "manufacturer": "Various (Omez, Prilosec)",
        "purpose": "Reduces stomach acid (PPI)",
        "description": "Omeprazole treats acidity, heartburn, acid reflux (GERD), stomach and intestinal ulcers.",
        "uses": "Acidity, GERD, gastritis, stomach/duodenal ulcers, with antibiotics for H. pylori.",
        "dosage": "Usually 20 mg once daily before breakfast for 2–4 weeks, or as prescribed.",
        "side_effects": "Headache, stomach pain, nausea, diarrhoea, constipation, gas.",
        "warnings": "Long-term use needs doctor review (vitamin B12, magnesium, bone health).",
    },
    "metformin": {
        "name": "Metformin",
        "generic": "Metformin",
        "manufacturer": "Various (Glycomet, Glucophage)",
        "purpose": "Lowers blood sugar (type 2 diabetes)",
        "description": "Metformin is a first-line medicine for type 2 diabetes; it lowers glucose made by the liver and improves insulin response.",
        "uses": "Type 2 diabetes mellitus, sometimes PCOS/insulin resistance (prescription only).",
        "dosage": "Usually started 500 mg once/twice daily with food, adjusted by doctor.",
        "side_effects": "Nausea, diarrhoea, stomach upset, metallic taste (often improves with time).",
        "warnings": "Prescription only. Avoid excess alcohol. Pause before contrast X-ray scans — ask your doctor.",
    },
    "ibuprofen": {
        "name": "Ibuprofen",
        "generic": "Ibuprofen",
        "manufacturer": "Various (Brufen, Combiflam contains ibuprofen + paracetamol)",
        "purpose": "Pain, inflammation and fever (NSAID)",
        "description": "Ibuprofen relieves pain, swelling and fever in conditions like headache, toothache, backache, arthritis and period pain.",
        "uses": "Headache, dental pain, muscle/joint pain, sprains, fever, period pain.",
        "dosage": "Adults: 200–400 mg every 4–6 hours with food, max 1200 mg/day OTC unless doctor says otherwise.",
        "side_effects": "Stomach pain, acidity, nausea. Long/high-dose use can affect kidneys, heart, stomach lining.",
        "warnings": "Take with food. Avoid in late pregnancy, stomach ulcers, severe kidney/heart disease unless advised.",
    },
    "vitamin c": {
        "name": "Vitamin C (Ascorbic Acid)",
        "generic": "Ascorbic Acid",
        "manufacturer": "Various (Limcee, Celin)",
        "purpose": "Vitamin supplement / antioxidant",
        "description": "Vitamin C supports immunity, skin health and iron absorption; used to prevent/treat deficiency.",
        "uses": "Vitamin C deficiency, immunity support, adjunct in cold recovery, gum health.",
        "dosage": "Typically 40–75 mg/day dietary need; supplements 500 mg/day or as advised. Do not mega-dose long term.",
        "side_effects": "High doses may cause diarrhoea, nausea, stomach cramps, kidney stones.",
        "warnings": "Tell your doctor about kidney stones or iron-overload conditions.",
    },
    "dolo 650": {
        "name": "Dolo 650 (Paracetamol 650 mg)",
        "generic": "Paracetamol 650 mg",
        "manufacturer": "Micro Labs",
        "purpose": "Fever and pain relief",
        "description": "Dolo 650 is India's popular paracetamol brand for fever, headache and body ache.",
        "uses": "Fever, headache, body ache, toothache, cold/flu aches.",
        "dosage": "Adults: 1 tablet (650 mg) every 4–6 hours as needed, max ~4 g/day. Follow doctor advice.",
        "side_effects": "Rare at correct dose; overdose harms the liver.",
        "warnings": "Do not combine with other paracetamol products. Avoid alcohol.",
    },
    "crocin": {
        "name": "Crocin (Paracetamol)",
        "generic": "Paracetamol",
        "manufacturer": "GSK",
        "purpose": "Fever and pain relief",
        "description": "Crocin is a paracetamol brand used for fever, headache, body ache and cold symptoms.",
        "uses": "Same as paracetamol: fever, headache, body ache, toothache.",
        "dosage": "500–650 mg every 4–6 hours as needed, within daily limits.",
        "side_effects": "Rare; liver risk in overdose.",
        "warnings": "Check Combo cold medicines — many already contain paracetamol.",
    },
}

POPULAR = ["Paracetamol", "Dolo 650", "Azithromycin", "Cetirizine", "Amoxicillin",
           "Omeprazole", "Metformin", "Ibuprofen", "Vitamin C", "Crocin"]


def _normalize_openfda(rec: dict) -> dict:
    openfda = rec.get("openfda", {}) or {}
    name = _first(openfda.get("brand_name")) or _first(openfda.get("generic_name")) \
        or _first(openfda.get("substance_name")) or "Medicine"
    generic = _first(openfda.get("generic_name")) or _first(openfda.get("substance_name"))
    return {
        "id": rec.get("set_id", name),
        "set_id": rec.get("set_id"),
        "name": name,
        "generic": generic,
        "manufacturer": _first(openfda.get("manufacturer_name")),
        "purpose": _clip(_first(rec.get("purpose")), 500),
        "description": _clip(
            _first(rec.get("description")) or _first(rec.get("indications_and_usage"))
            or _first(rec.get("purpose")) or f"{name} — see uses and warnings below.",
            1200,
        ),
        "uses": _clip(_first(rec.get("indications_and_usage")), 1200),
        "dosage": _clip(_first(rec.get("dosage_and_administration")), 1200),
        "side_effects": _clip(_first(rec.get("adverse_reactions")), 1200),
        "warnings": _clip(_first(rec.get("warnings")) or _first(rec.get("boxed_warning")), 1200),
        "interactions": _clip(_first(rec.get("drug_interactions")), 800),
        "contraindications": _clip(_first(rec.get("contraindications")), 800),
        "tata1mg_url": _tata1mg_url(name),
        "source": "openFDA (free, no key needed)" + (" + Tata 1mg link" if True else ""),
    }


def _fallback_entry(key: str, data: dict) -> dict:
    return {
        "id": f"local-{key}",
        "curated": True,
        "set_id": None,
        "name": data["name"],
        "generic": data.get("generic", ""),
        "manufacturer": data.get("manufacturer", ""),
        "purpose": data.get("purpose", ""),
        "description": data.get("description", ""),
        "uses": data.get("uses", ""),
        "dosage": data.get("dosage", ""),
        "side_effects": data.get("side_effects", ""),
        "warnings": data.get("warnings", ""),
        "interactions": "",
        "contraindications": "",
        "tata1mg_url": _tata1mg_url(data["name"]),
        "source": "MedRec offline guide (openFDA unreachable) + Tata 1mg link",
    }


async def _try_tata1mg_proxy(q: str, limit: int) -> list[dict] | None:
    """Try an unofficial Tata 1mg proxy if the user configured one.

    There is no official Tata 1mg API, but some deployments front it with a
    RapidAPI mirror or an internal scraper. If TATA1MG_API_KEY is set, we
    attempt GET {TATA1MG_API_URL}?q=... with header X-API-Key and expect a
    JSON list/dict. Anything unexpected -> return None (fall through).
    """
    if not settings.TATA1MG_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(
                settings.TATA1MG_API_URL,
                params={"q": q, "query": q, "limit": limit},
                headers={"X-API-Key": settings.TATA1MG_API_KEY,
                         "X-RapidAPI-Key": settings.TATA1MG_API_KEY},
            )
            if r.status_code != 200:
                return None
            payload = r.json()
            items = payload if isinstance(payload, list) else payload.get("results") or payload.get("data") or []
            out = []
            for it in items[:limit]:
                if not isinstance(it, dict):
                    continue
                nm = str(it.get("name") or it.get("title") or q)
                out.append({
                    "id": str(it.get("id") or nm),
                    "set_id": None,
                    "name": nm,
                    "generic": str(it.get("generic") or it.get("salt") or ""),
                    "manufacturer": str(it.get("manufacturer") or it.get("brand") or ""),
                    "purpose": str(it.get("purpose") or "")[:500],
                    "description": str(it.get("description") or it.get("uses") or "")[:1200],
                    "uses": str(it.get("uses") or "")[:1200],
                    "dosage": str(it.get("dosage") or "")[:1200],
                    "side_effects": str(it.get("side_effects") or it.get("sideEffects") or "")[:1200],
                    "warnings": str(it.get("warnings") or "")[:1200],
                    "interactions": "",
                    "contraindications": "",
                    "tata1mg_url": str(it.get("url") or it.get("link") or _tata1mg_url(nm)),
                    "source": "Tata 1mg via configured proxy key",
                })
            return out or None
    except Exception:
        return None


# Indian brand -> US/generic terms openFDA actually indexes under.
SYNONYMS: dict[str, list[str]] = {
    "paracetamol": ["acetaminophen"],
    "dolo": ["acetaminophen"],
    "crocin": ["acetaminophen"],
    "calpol": ["acetaminophen"],
    "tylenol": ["acetaminophen"],
    "combiflam": ["ibuprofen"],
    "brufen": ["ibuprofen"],
    "omez": ["omeprazole"],
    "glycomet": ["metformin"],
    "glucophage": ["metformin"],
    "azithral": ["azithromycin"],
    "cetzine": ["cetirizine"],
    "zyrtec": ["cetirizine"],
    "moxikind": ["amoxicillin"],
    "novamox": ["amoxicillin"],
    "vitamin c": ["ascorbic acid"],
    "vit c": ["ascorbic acid"],
    "limcee": ["ascorbic acid"],
    "celin": ["ascorbic acid"],
    "disprin": ["aspirin"],
}


def _candidates(q: str) -> list[str]:
    """Original query + synonym expansions (deduped, order kept)."""
    ql = q.lower().strip()
    cands = [q.strip()]
    for key, vals in SYNONYMS.items():
        if key == ql or key in ql.split() or (len(key) > 3 and key in ql):
            for v in vals:
                if v not in cands:
                    cands.append(v)
    return cands[:4]


async def _fielded_search(client: httpx.AsyncClient, term: str, limit: int) -> list[dict]:
    params: dict = {
        "search": f'(openfda.brand_name:"{term}"+openfda.generic_name:"{term}"+openfda.substance_name:"{term}")',
        "limit": max(1, min(limit, 20)),
    }
    if settings.OPENFDA_API_KEY:
        params["api_key"] = settings.OPENFDA_API_KEY
    r = await client.get(settings.OPENFDA_BASE_URL, params=params)
    if r.status_code == 404:
        return []
    r.raise_for_status()
    return [_normalize_openfda(rec) for rec in (r.json().get("results") or [])]


async def _search_openfda(q: str, limit: int) -> list[dict]:
    """Fielded openFDA search over the query + Indian-brand synonyms."""
    out, seen = [], set()
    async with httpx.AsyncClient(timeout=15) as client:
        for term in _candidates(q):
            try:
                hits = await _fielded_search(client, term, limit)
            except Exception:
                continue
            for h in hits:
                key = h.get("set_id") or h.get("name", "").lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(h)
                if len(out) >= limit:
                    return out
    return out


def _search_fallback(q: str, limit: int) -> list[dict]:
    ql = q.lower().strip()
    scored = []
    for key, data in COMMON_MEDS.items():
        hay = f"{key} {data['name']} {data.get('generic','')}".lower()
        if ql in hay or any(w in hay for w in ql.split() if len(w) > 2):
            scored.append(_fallback_entry(key, data))
    if not scored:  # generic card so the UI always has something useful
        scored.append({
            "id": f"local-{ql}", "set_id": None, "name": q.title(),
            "generic": "", "manufacturer": "",
            "purpose": "See a pharmacist or the Tata 1mg page for this product.",
            "description": f"No offline summary for '{q}'. Open the Tata 1mg page for uses, dosage and substitutes, and ask your doctor/pharmacist.",
            "uses": "", "dosage": "", "side_effects": "", "warnings": "",
            "interactions": "", "contraindications": "",
            "tata1mg_url": _tata1mg_url(q), "source": "Tata 1mg link (openFDA unreachable)",
        })
    return scored[:limit]


@router.get("/search")
async def search_medicines(
    q: str = Query(..., min_length=2, description="Medicine name, e.g. paracetamol"),
    limit: int = Query(8, ge=1, le=20),
):
    """Search medicine descriptions (openFDA free API + Tata 1mg links). Public."""
    key = f"search:{q.lower().strip()}:{limit}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    # 1) optional unofficial Tata 1mg proxy
    proxied = await _try_tata1mg_proxy(q, limit)
    if proxied:
        payload = {"query": q, "count": len(proxied), "results": proxied,
                   "provider": "tata1mg-proxy", "disclaimer": _DISCLAIMER}
        _cache_set(key, payload)
        return payload
    # 2) best free source: openFDA (+ synonyms), merged with the offline
    #    India-focused guide so brand context is never lost
    try:
        results = await _search_openfda(q, limit)
    except Exception:
        results = []
    guide = _search_fallback(q, limit)
    covered = {r.get("name", "").lower() for r in results}
    for g in guide:
        if g.get("curated") and g["name"].lower() not in covered and len(results) < limit:
            results.append(g)
            covered.add(g["name"].lower())
    if not results:
        results = guide  # generic Tata 1mg-link card
    has_live = any(not r["id"].startswith("local-") for r in results)
    has_guide = any(r.get("curated") for r in results)
    provider = ("openfda+offline-guide" if (has_live and has_guide)
                else "openfda" if has_live else "offline-guide")
    payload = {"query": q, "count": len(results), "results": results,
               "provider": provider, "disclaimer": _DISCLAIMER}
    _cache_set(key, payload)
    return payload


@router.get("/detail")
async def medicine_detail(
    set_id: str | None = Query(None, description="openFDA set_id from /search"),
    name: str | None = Query(None, min_length=2, description="Medicine name fallback"),
):
    """Full description for one medicine. Public."""
    if set_id:
        key = f"detail:{set_id}"
        cached = _cache_get(key)
        if cached is not None:
            return cached
        params: dict = {"search": f'set_id:"{set_id}"', "limit": 1}
        if settings.OPENFDA_API_KEY:
            params["api_key"] = settings.OPENFDA_API_KEY
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(settings.OPENFDA_BASE_URL, params=params)
                r.raise_for_status()
                results = r.json().get("results") or []
                if results:
                    payload = {"result": _normalize_openfda(results[0]), "provider": "openfda",
                               "disclaimer": _DISCLAIMER}
                    _cache_set(key, payload)
                    return payload
        except Exception:
            pass
        return {"result": None, "provider": "openfda",
                "detail": "Not found. Try /search instead.", "disclaimer": _DISCLAIMER}
    if name:
        data = await search_medicines(q=name, limit=1)
        return {"result": (data["results"][0] if data["results"] else None),
                "provider": data["provider"], "disclaimer": _DISCLAIMER}
    from fastapi import HTTPException
    raise HTTPException(status_code=400, detail="Pass ?set_id=... or ?name=...")


@router.get("/popular")
def popular_medicines():
    """Curated popular searches (instant, no upstream call). Public."""
    return {
        "results": [{"name": n, "tata1mg_url": _tata1mg_url(n)} for n in POPULAR],
        "provider": "curated",
    }


_DISCLAIMER = ("Informational only — not medical advice. Dosage/side-effect data comes "
               "from the free openFDA drug-label database; Tata 1mg links are provided "
               "for India pricing/buying. Always consult your doctor or pharmacist.")
