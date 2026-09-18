"""Disease Description API — 100% FREE, no API key needed.

Source: Wikipedia / MediaWiki API (https://www.mediawiki.org/wiki/API:Main_page)
  * search  -> action=query&list=search  (article matches + snippets)
  * detail  -> REST summary (overview) + per-section plain text for
               symptoms / causes / diagnosis / treatment / prevention
  * No key, generous free limits. A contact User-Agent is polite practice.

Falls back to a curated offline guide (common conditions in India) when
Wikipedia is unreachable or has no match.

Endpoints (all PUBLIC — no login needed):
  GET /api/diseases/search?q=diabetes&limit=8
  GET /api/diseases/detail?title=Diabetes
  GET /api/diseases/popular
"""

import html
import re
import time
from urllib.parse import quote_plus

import httpx
from fastapi import APIRouter, Query

from app.core.config import settings

router = APIRouter()

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_UA = {"User-Agent": "MedRec/1.0 (disease-info; contact: support@medrec.local)"}

_CACHE: dict[str, tuple[float, object]] = {}


def _cache_get(key: str):
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, val = hit
    if time.time() - ts > settings.DISEASES_CACHE_TTL_SEC:
        _CACHE.pop(key, None)
        return None
    return val


def _cache_set(key: str, val: object) -> None:
    if len(_CACHE) > 200:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[key] = (time.time(), val)


def _wiki_url(title: str) -> str:
    return f"https://en.wikipedia.org/wiki/{quote_plus(title.replace(' ', '_'))}"


def _strip_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    text = html.unescape(text)
    text = re.sub(r"\[\s*edit\s*\]", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _clip(text: str, n: int = 1500) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[:n].rsplit(" ", 1)[0] + "…"


# Section-name matchers: field -> keywords looked for in Wikipedia headings.
FIELDS = [
    ("symptoms", ["symptom", "signs and symptoms", "clinical presentation", "clinical features"]),
    ("causes", ["cause", "etiology", "aetiology", "pathophysiology", "risk factor"]),
    ("diagnosis", ["diagnos"]),
    ("treatment", ["treat", "manag", "therapy"]),
    ("prevention", ["prevent", "prophylaxis"]),
]

COMMON_DISEASES: dict[str, dict] = {
    "diabetes": {
        "name": "Diabetes Mellitus (Type 2)",
        "overview": "Diabetes is a condition where blood sugar (glucose) stays too high because the body doesn't make enough insulin or can't use it well. Very common in India; managed with lifestyle, medicines and monitoring.",
        "symptoms": "Increased thirst, frequent urination, extreme hunger, unexplained weight loss, fatigue, blurred vision, slow-healing sores, frequent infections.",
        "causes": "Insulin resistance linked to excess weight, inactivity, family history; type 1 is autoimmune (pancreas makes little/no insulin).",
        "diagnosis": "Fasting blood sugar, HbA1c (3-month average), oral glucose tolerance test — as advised by your doctor.",
        "treatment": "Healthy diet, daily activity, weight control; medicines like metformin and others as prescribed; insulin when needed. Regular sugar monitoring.",
        "prevention": "Maintain healthy weight, 30+ min activity daily, balanced diet low in refined sugar, avoid tobacco, limit alcohol, regular checkups.",
    },
    "hypertension": {
        "name": "Hypertension (High Blood Pressure)",
        "overview": "Blood pressure consistently at or above 130/80 mmHg strains the heart, brain and kidneys. Often symptomless — the 'silent killer' — so regular checks matter.",
        "symptoms": "Usually none. Very high pressure may cause headache, shortness of breath, nosebleeds — but these aren't reliable signs.",
        "causes": "Age, family history, excess salt, obesity, inactivity, smoking, alcohol, stress, kidney/thyroid or sleep-apnoea issues.",
        "diagnosis": "Repeated BP readings on different days; home/ambulatory monitoring; tests for heart, kidney effects.",
        "treatment": "Less salt, DASH-style diet, exercise, weight loss, no tobacco, limited alcohol; BP medicines (e.g. amlodipine, telmisartan) exactly as prescribed.",
        "prevention": "Healthy weight, active lifestyle, low-salt diet, fruits/vegetables, stress management, regular BP checks after age 30.",
    },
    "asthma": {
        "name": "Asthma",
        "overview": "A chronic condition where airways swell and narrow, causing wheezing, breathlessness, chest tightness and coughing — often worse at night or with triggers.",
        "symptoms": "Wheezing, shortness of breath, chest tightness, cough (worse at night/early morning), difficulty breathing during activity.",
        "causes": "Genetics plus triggers: dust, smoke, pollution, pollen, cold air, exercise, respiratory infections, strong smells.",
        "diagnosis": "History + lung-function tests (spirometry/peak flow), allergy evaluation.",
        "treatment": "Daily controller inhalers (e.g. inhaled steroids) + quick-relief inhaler for attacks; avoid triggers; written asthma action plan from your doctor.",
        "prevention": "Control dust/smoke exposure, treat allergies, vaccinate against flu, follow the action plan, regular reviews.",
    },
    "dengue": {
        "name": "Dengue Fever",
        "overview": "A mosquito-borne (Aedes) viral fever common in India during/after monsoon. Most cases are mild, but warning signs need urgent hospital care.",
        "symptoms": "High fever, severe headache, pain behind eyes, joint/muscle pain, nausea, rash. Warning signs: severe abdominal pain, persistent vomiting, bleeding gums/nose, fatigue, restlessness.",
        "causes": "Dengue virus (4 serotypes) spread by daytime-biting Aedes mosquitoes breeding in clean stagnant water.",
        "diagnosis": "NS1 antigen (early days), IgM/IgG antibodies, platelet and blood counts.",
        "treatment": "No specific antiviral — rest, plenty of fluids, paracetamol for fever. Avoid aspirin/ibuprofen (bleeding risk). Hospital care if warning signs or low platelets.",
        "prevention": "No waterlogging (coolers, tyres, pots), mosquito nets/repellents, full-sleeve clothes, community fogging and source reduction.",
    },
    "typhoid": {
        "name": "Typhoid Fever",
        "overview": "Bacterial infection (Salmonella Typhi) from contaminated food/water causing prolonged fever, weakness and abdominal pain.",
        "symptoms": "Sustained high fever, weakness, stomach pain, headache, loss of appetite, diarrhoea or constipation, sometimes rose-coloured rash.",
        "causes": "Salmonella Typhi via unsafe water, street food, poor hand hygiene; carriers can spread it without symptoms.",
        "diagnosis": "Blood culture (best in week 1), Widal test (supportive), CBC.",
        "treatment": "Antibiotics exactly as prescribed (e.g. cefixime/azithromycin per local resistance) — complete the course; fluids and rest.",
        "prevention": "Safe drinking water, freshly cooked hot food, handwashing, typhoid vaccination (Typhar/TCV) — ask your doctor.",
    },
    "tuberculosis": {
        "name": "Tuberculosis (TB)",
        "overview": "Bacterial lung infection spread through air. Curable with a full 6+ month medicine course — stopping early causes drug resistance. Free treatment via India's Nikshay/NTEP program.",
        "symptoms": "Cough over 2 weeks, evening fever, night sweats, weight loss, loss of appetite, blood in sputum, chest pain.",
        "causes": "Mycobacterium tuberculosis, spread when an untreated person coughs/sneezes; risk higher with diabetes, HIV, malnutrition, smoking.",
        "diagnosis": "Sputum test (CBNAAT/TrueNat), chest X-ray, tuberculin/IGRA blood tests.",
        "treatment": "Multi-drug course for at least 6 months under DOTS/Nikshay supervision — never stop early. Report side effects promptly.",
        "prevention": "Cover coughs, ventilation, treat latent TB in contacts, BCG for infants, complete every prescribed dose.",
    },
    "migraine": {
        "name": "Migraine",
        "overview": "Recurrent moderate-to-severe headache, often one-sided and throbbing, with nausea and sensitivity to light/sound; attacks last hours to days.",
        "symptoms": "Throbbing head pain, nausea/vomiting, light/sound sensitivity, visual aura (flashes, blind spots) in some people.",
        "causes": "Exact cause unclear — genetics plus triggers: stress, missed meals, dehydration, lack of sleep, hormonal changes, strong smells, certain foods.",
        "diagnosis": "Clinical history and headache diary; scans only to rule out other causes.",
        "treatment": "Rest in a dark quiet room; acute medicines (paracetamol/NSAIDs/triptans) as prescribed; preventive medicines for frequent attacks.",
        "prevention": "Regular sleep and meals, hydration, stress management, identify and avoid personal triggers, limit painkiller overuse.",
    },
    "anemia": {
        "name": "Anemia (Iron Deficiency)",
        "overview": "Too few healthy red blood cells (low haemoglobin) reduces oxygen delivery — very common in India, especially among women and children.",
        "symptoms": "Fatigue, weakness, pale skin, shortness of breath, dizziness, cold hands/feet, brittle nails, unusual cravings (pica).",
        "causes": "Iron-poor diet, blood loss (heavy periods, worms, piles), pregnancy needs, poor absorption, chronic disease.",
        "diagnosis": "Complete blood count (haemoglobin), iron studies/ferritin, stool test for worms/blood loss.",
        "treatment": "Iron-rich diet + iron supplements as prescribed (with vitamin C for absorption); deworming; treat the underlying cause.",
        "prevention": "Green leafy vegetables, millets, jaggery, meat/eggs where eaten; weekly IFA tablets in pregnancy/adolescence per national guidelines.",
    },
    "hypothyroidism": {
        "name": "Hypothyroidism",
        "overview": "Underactive thyroid gland makes too little thyroid hormone, slowing metabolism — common and easily treated with a daily tablet.",
        "symptoms": "Fatigue, weight gain, feeling cold, dry skin, hair fall, constipation, low mood, slow heart rate, irregular periods.",
        "causes": "Hashimoto's autoimmune thyroiditis (most common), iodine deficiency, thyroid surgery/radiation, some medicines.",
        "diagnosis": "TSH blood test (high) with T3/T4; thyroid antibodies if needed.",
        "treatment": "Daily levothyroxine on an empty stomach, same time each day; dose adjusted by repeat TSH tests.",
        "prevention": "Adequate iodine (iodised salt); condition itself isn't always preventable — early detection via screening helps.",
    },
    "covid-19": {
        "name": "COVID-19",
        "overview": "Respiratory illness caused by the SARS-CoV-2 virus. Most cases are mild, but the elderly and those with other conditions face higher risk.",
        "symptoms": "Fever, cough, sore throat, body ache, fatigue, loss of taste/smell, breathlessness in severe cases.",
        "causes": "SARS-CoV-2 virus spread through respiratory droplets and aerosols, especially in crowds and poor ventilation.",
        "diagnosis": "Rapid antigen or RT-PCR test; consult a doctor if breathless or high-risk.",
        "treatment": "Isolation, rest, fluids, paracetamol for fever; medical care and oxygen for breathlessness; follow current government/doctor guidance.",
        "prevention": "Vaccination and boosters as advised, masks in crowds, hand hygiene, ventilation, isolate when positive.",
    },
}

POPULAR = ["Diabetes", "Hypertension", "Asthma", "Dengue", "Typhoid",
           "Tuberculosis", "Migraine", "Anemia", "Hypothyroidism", "COVID-19"]


async def _wiki_search(q: str, limit: int) -> list[dict]:
    params = {"action": "query", "format": "json", "list": "search",
              "srsearch": q, "srnamespace": 0, "srlimit": max(1, min(limit, 20)),
              "srprop": "snippet"}
    async with httpx.AsyncClient(timeout=15, headers=WIKI_UA) as client:
        r = await client.get(WIKI_API, params=params)
        r.raise_for_status()
        out = []
        for item in (r.json().get("query", {}).get("search") or []):
            title = item.get("title", "")
            if "(disambiguation)" in title.lower():
                continue
            out.append({
                "title": title,
                "name": title,
                "snippet": _clip(_strip_html(item.get("snippet", "")), 300),
                "wikipedia_url": _wiki_url(title),
            })
        return out


async def _wiki_summary(title: str) -> tuple[str, str | None]:
    """(overview extract, thumbnail url) via the REST summary endpoint."""
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote_plus(title)}"
    async with httpx.AsyncClient(timeout=15, headers=WIKI_UA) as client:
        r = await client.get(url)
        if r.status_code != 200:
            return "", None
        j = r.json()
        if j.get("type") == "disambiguation":
            return "", None
        thumb = (j.get("thumbnail") or {}).get("source")
        return j.get("extract") or "", thumb


async def _wiki_sections(title: str) -> list[dict]:
    params = {"action": "parse", "format": "json", "page": title,
              "prop": "sections", "redirects": 1}
    async with httpx.AsyncClient(timeout=15, headers=WIKI_UA) as client:
        r = await client.get(WIKI_API, params=params)
        r.raise_for_status()
        return r.json().get("parse", {}).get("sections") or []


async def _wiki_section_text(title: str, index: str) -> str:
    params = {"action": "parse", "format": "json", "page": title,
              "prop": "text", "section": index, "redirects": 1, "disabletoc": 1}
    async with httpx.AsyncClient(timeout=15, headers=WIKI_UA) as client:
        r = await client.get(WIKI_API, params=params)
        r.raise_for_status()
        raw = (r.json().get("parse", {}).get("text") or {}).get("*", "")
        return _strip_html(raw)


def _pick_sections(sections: list[dict]) -> dict[str, str]:
    """Map our fields to the first matching Wikipedia section index."""
    picked: dict[str, str] = {}
    for field, keywords in FIELDS:
        for s in sections:
            line = str(s.get("line", "")).lower()
            if field in picked:
                break
            if any(k in line for k in keywords):
                # skip top-level noise like "See also" false friends
                if field == "treatment" and "water treatment" in line:
                    continue
                picked[field] = str(s.get("index"))
    return picked


def _fallback_entry(key: str, data: dict) -> dict:
    return {
        "id": f"local-{key}", "curated": True, "title": data["name"], "name": data["name"],
        "overview": data.get("overview", ""), "symptoms": data.get("symptoms", ""),
        "causes": data.get("causes", ""), "diagnosis": data.get("diagnosis", ""),
        "treatment": data.get("treatment", ""), "prevention": data.get("prevention", ""),
        "thumbnail": None, "wikipedia_url": _wiki_url(data["name"]),
        "source": "MedRec offline guide (Wikipedia unreachable) + Wikipedia link",
    }


def _search_fallback(q: str, limit: int) -> list[dict]:
    ql = q.lower().strip()
    scored = []
    for key, data in COMMON_DISEASES.items():
        hay = f"{key} {data['name']}".lower()
        if ql in hay or any(w in hay for w in ql.split() if len(w) > 2):
            scored.append(_fallback_entry(key, data))
    if not scored:
        scored.append({
            "id": f"local-{ql}", "curated": False, "title": q.title(), "name": q.title(),
            "overview": f"No offline summary for '{q}'. Open the Wikipedia article for full details, and ask your doctor.",
            "symptoms": "", "causes": "", "diagnosis": "", "treatment": "", "prevention": "",
            "thumbnail": None, "wikipedia_url": _wiki_url(q),
            "source": "Wikipedia link (search unreachable)",
        })
    return scored[:limit]


@router.get("/search")
async def search_diseases(
    q: str = Query(..., min_length=2, description="Disease name, e.g. diabetes"),
    limit: int = Query(8, ge=1, le=20),
):
    """Search disease articles (free Wikipedia API). Public."""
    key = f"search:{q.lower().strip()}:{limit}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        hits = await _wiki_search(q, limit)
    except Exception:
        hits = []
    results = [{**h, "id": h["title"], "source": "Wikipedia (free, no key needed)"} for h in hits]
    guide = _search_fallback(q, limit)
    covered = {r["name"].lower() for r in results}
    for g in guide:
        if g.get("curated") and g["name"].lower() not in covered and len(results) < limit:
            results.append(g)
            covered.add(g["name"].lower())
    if not results:
        results = guide
    has_live = any(not r["id"].startswith("local-") for r in results)
    has_guide = any(r.get("curated") for r in results)
    provider = ("wikipedia+offline-guide" if (has_live and has_guide)
                else "wikipedia" if has_live else "offline-guide")
    payload = {"query": q, "count": len(results), "results": results,
               "provider": provider, "disclaimer": _DISCLAIMER}
    _cache_set(key, payload)
    return payload


@router.get("/detail")
async def disease_detail(title: str = Query(..., min_length=2, description="Wikipedia article title")):
    """Full description for one disease: overview + symptoms/causes/diagnosis/treatment/prevention. Public."""
    key = f"detail:{title.lower().strip()}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    overview, thumb = "", None
    fields: dict[str, str] = {}
    try:
        overview, thumb = await _wiki_summary(title)
        sections = await _wiki_sections(title)
        for field, index in _pick_sections(sections).items():
            try:
                fields[field] = _clip(await _wiki_section_text(title, index))
            except Exception:
                pass
    except Exception:
        pass
    if not overview and not fields:
        # offline guide match, else a bare Wikipedia link card
        guide = [g for g in _search_fallback(title, 3) if g.get("curated")]
        result = guide[0] if guide else {
            "id": f"local-{title.lower()}", "curated": False, "title": title, "name": title,
            "overview": "", "symptoms": "", "causes": "", "diagnosis": "",
            "treatment": "", "prevention": "", "thumbnail": None,
            "wikipedia_url": _wiki_url(title), "source": "Wikipedia link",
        }
        payload = {"result": result, "provider": "offline-guide", "disclaimer": _DISCLAIMER}
    else:
        payload = {"result": {
            "id": title, "title": title, "name": title,
            "overview": _clip(overview, 1500), "symptoms": fields.get("symptoms", ""),
            "causes": fields.get("causes", ""), "diagnosis": fields.get("diagnosis", ""),
            "treatment": fields.get("treatment", ""), "prevention": fields.get("prevention", ""),
            "thumbnail": thumb, "wikipedia_url": _wiki_url(title),
            "source": "Wikipedia (free, no key needed)",
        }, "provider": "wikipedia", "disclaimer": _DISCLAIMER}
    _cache_set(key, payload)
    return payload


@router.get("/popular")
def popular_diseases():
    """Curated popular searches (instant, no upstream call). Public."""
    return {
        "results": [{"name": n, "wikipedia_url": _wiki_url(n)} for n in POPULAR],
        "provider": "curated",
    }


_DISCLAIMER = ("Informational only — not medical advice. Content comes from the free "
               "Wikipedia encyclopedia and a built-in health guide. Always consult "
               "your doctor for diagnosis and treatment.")
