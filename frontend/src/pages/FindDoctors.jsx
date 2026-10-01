import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api'
import { findDepartment } from '../departments'
import { PhotoFrame, PHOTOS } from '../components/People'

/* Find Doctors — 2 sources, same region filter:
   [Hospitals] 2-step flow: pick region -> pick hospital -> browse
   specialties with booking links (hospital sites, no public booking API).
   [JustDial] 2-step flow: pick region -> pick city -> browse
   specialties with JustDial listing links (ratings + Book Appointment
   buttons live on JustDial; JustDial offers no public doctor API). */

const REGIONS = [
  'All regions',
  'Mumbai',
  'Delhi NCR',
  'Chennai',
  'Bengaluru',
  'Hyderabad',
  'Kolkata',
  'Pune',
  'Ahmedabad',
]

/* Fallback hospital directory (mirrors backend) so hospital links ALWAYS
   render — even if the backend is unreachable. */
const FALLBACK_HOSPITALS = [
  { id: 'bombay', name: 'Bombay Hospital & Medical Research Centre', cities: 'Mumbai',
    consultants_url: 'https://www.bombayhospital.com/consultants',
    contact_url: 'https://www.bombayhospital.com/contact',
    booking_url: 'https://www.bombayhospital.com/consultants' },
  { id: 'apollo', name: 'Apollo Hospitals', cities: 'Pan-India (Mumbai, Delhi, Chennai, Bangalore, Hyderabad, Kolkata…)',
    consultants_url: 'https://www.apollohospitals.com/doctors',
    contact_url: 'https://www.apollohospitals.com/contact-us',
    booking_url: 'https://www.apollohospitals.com/doctors' },
  { id: 'fortis', name: 'Fortis Healthcare', cities: 'Pan-India (Mumbai, Delhi NCR, Bangalore, Chennai, Kolkata…)',
    consultants_url: 'https://www.fortishealthcare.com/doctors',
    contact_url: 'https://www.fortishealthcare.com/contact-us',
    booking_url: 'https://www.fortishealthcare.com/doctors' },
  { id: 'lilavati', name: 'Lilavati Hospital & Research Centre', cities: 'Mumbai (Bandra West)',
    consultants_url: 'https://www.lilavatihospital.com/doctors',
    contact_url: 'https://www.lilavatihospital.com',
    booking_url: 'https://www.lilavatihospital.com/doctors/request-an-appointment' },
  { id: 'kokilaben', name: 'Kokilaben Dhirubhai Ambani Hospital', cities: 'Mumbai (Andheri West)',
    consultants_url: 'https://www.kokilabenhospital.com/doctors',
    contact_url: 'https://www.kokilabenhospital.com',
    booking_url: 'https://www.kokilabenhospital.com/patients/makeanappointment.html' },
  { id: 'nanavati', name: 'Nanavati Max Super Speciality Hospital', cities: 'Mumbai (Vile Parle West)',
    consultants_url: 'https://www.nanavatimaxhospital.org/find-a-doctor',
    contact_url: 'https://www.nanavatimaxhospital.org',
    booking_url: 'https://www.nanavatimaxhospital.org/book-an-appointment/' },
]

/* Fallback JustDial directory (mirrors backend/app/api/routes/justdial.py)
   so JustDial links ALWAYS render — even if the backend is unreachable.
   Short /City/Slug URLs 302-redirect to the full /nct-... listing. */
const JD_BASE = 'https://www.justdial.com'
const FALLBACK_JD_CITIES = [
  { id: 'mumbai', region: 'Mumbai', justdial_city: 'Mumbai', doctors_url: `${JD_BASE}/Mumbai/Doctors` },
  { id: 'delhi', region: 'Delhi NCR', justdial_city: 'Delhi', doctors_url: `${JD_BASE}/Delhi/Doctors` },
  { id: 'chennai', region: 'Chennai', justdial_city: 'Chennai', doctors_url: `${JD_BASE}/Chennai/Doctors` },
  { id: 'bengaluru', region: 'Bengaluru', justdial_city: 'Bangalore', doctors_url: `${JD_BASE}/Bangalore/Doctors` },
  { id: 'hyderabad', region: 'Hyderabad', justdial_city: 'Hyderabad', doctors_url: `${JD_BASE}/Hyderabad/Doctors` },
  { id: 'kolkata', region: 'Kolkata', justdial_city: 'Kolkata', doctors_url: `${JD_BASE}/Kolkata/Doctors` },
  { id: 'pune', region: 'Pune', justdial_city: 'Pune', doctors_url: `${JD_BASE}/Pune/Doctors` },
  { id: 'ahmedabad', region: 'Ahmedabad', justdial_city: 'Ahmedabad', doctors_url: `${JD_BASE}/Ahmedabad/Doctors` },
]
const FALLBACK_JD_SPECIALTIES = [
  ['Cardiology', 'Cardiologists', ['cardio', 'heart']],
  ['Dermatology', 'Dermatologists', ['skin', 'hair']],
  ['Dentistry', 'Dentists', ['dental', 'teeth']],
  ['Orthopaedics', 'Orthopaedic-Doctors', ['ortho', 'bone', 'joint', 'knee']],
  ['Neurology', 'Neurologists', ['neuro', 'brain', 'migraine', 'epilepsy']],
  ['Gynaecology & Obstetrics', 'Gynaecologists', ['pregnancy', 'women', 'gynae']],
  ['Paediatrics', 'Paediatricians', ['child', 'baby', 'kids']],
  ['ENT', 'ENT-Doctors', ['ent', 'ear', 'nose', 'throat']],
  ['Ophthalmology', 'Ophthalmologists', ['eye', 'vision']],
  ['General Medicine', 'General-Physician-Doctors', ['physician', 'fever', 'general']],
  ['Psychiatry', 'Psychiatrists', ['mental health', 'depression', 'anxiety']],
  ['Urology', 'Urologists', ['urinary', 'prostate']],
  ['Nephrology', 'Nephrologists', ['kidney', 'renal']],
  ['Gastroenterology', 'Gastroenterologists', ['gastro', 'stomach', 'liver']],
  ['Endocrinology & Diabetes', 'Endocrinologists', ['hormone', 'thyroid', 'diabetes']],
  ['Oncology', 'Oncologists', ['cancer', 'tumor']],
  ['Pulmonology', 'Pulmonologists', ['lungs', 'asthma', 'breathing']],
  ['Rheumatology', 'Rheumatologists', ['arthritis', 'joint pain']],
  ['General Surgery', 'General-Surgeons', ['surgery', 'laparoscopic']],
  ['Plastic Surgery', 'Plastic-Surgeons', ['cosmetic', 'burns']],
  ['Physiotherapy', 'Physiotherapists', ['physio', 'rehab', 'back pain']],
  ['Homoeopathy', 'Homeopathic-Doctors', ['homeo']],
  ['Ayurveda', 'Ayurvedic-Doctors', ['ayurveda']],
]
const KNOWN_JD_URLS = {
  'Mumbai|Dentists': `${JD_BASE}/Mumbai/Dentists/nct-10156331`,
  'Mumbai|Dermatologists': `${JD_BASE}/Mumbai/Dermatologists/nct-10156786`,
  'Chennai|Cardiologists': `${JD_BASE}/Chennai/Cardiologists/nct-10080172`,
}
function fallbackJdItems() {
  return FALLBACK_JD_CITIES.flatMap((c) =>
    FALLBACK_JD_SPECIALTIES.map(([name, slug, tags]) => ({
      city_id: c.id,
      region: c.region,
      justdial_city: c.justdial_city,
      specialty: name,
      slug,
      tags,
      justdial_url: KNOWN_JD_URLS[`${c.justdial_city}|${slug}`] || `${JD_BASE}/${c.justdial_city}/${slug}`,
      book_url: KNOWN_JD_URLS[`${c.justdial_city}|${slug}`] || `${JD_BASE}/${c.justdial_city}/${slug}`,
      city_doctors_url: c.doctors_url,
    }))
  )
}

/* Best hospital-level link: booking page first, then directory, then contact. */
function hospitalLink(h) {
  return h?.booking_url || h?.consultants_url || h?.contact_url || null
}

// Match free-text `cities` ("Pan-India (Mumbai, Delhi NCR, ...)") against a region.
function regionMatches(cities, region) {
  if (!region || region === 'All regions') return true
  const c = (cities || '').toLowerCase()
  const r = region.toLowerCase()
  if (r === 'bengaluru') return c.includes('bengaluru') || c.includes('bangalore')
  if (r === 'delhi ncr') return c.includes('delhi')
  return c.includes(r)
}

export default function FindDoctors() {
  const [params] = useSearchParams()
  const [source, setSource] = useState('hospitals') // 'hospitals' | 'justdial'
  const [hospitals, setHospitals] = useState([])
  const [items, setItems] = useState([])
  const [note, setNote] = useState('')
  const [hospitalId, setHospitalId] = useState(null)
  const [q, setQ] = useState(params.get('specialty') || '')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // JustDial state
  const [jdCities, setJdCities] = useState(FALLBACK_JD_CITIES)
  const [jdItems, setJdItems] = useState(() => fallbackJdItems())
  const [jdNote, setJdNote] = useState('')
  const [jdCityId, setJdCityId] = useState(null)
  const [jdLoading, setJdLoading] = useState(true)
  const [region, setRegion] = useState(() => {
    try { return localStorage.getItem('medrec_region') || 'All regions' } catch { return 'All regions' }
  })

  const reload = () => {
    setLoading(true); setLoadError('')
    Promise.all([api.get('/api/hospitals/'), api.get('/api/hospitals/doctors')])
      .then(([{ data: h }, { data: d }]) => {
        if ((h.results || []).length) setHospitals(h.results)
        setItems(d.results || [])
        setNote(d.note || '')
      })
      .catch(() => {
        // Keep fallback hospitals so links still show; explain why.
        setHospitals((prev) => (prev.length ? prev : FALLBACK_HOSPITALS))
        setLoadError('Could not reach the backend — showing saved hospital links. Booking happens on each hospital site.')
      })
      .finally(() => setLoading(false))
  }

  const reloadJd = () => {
    setJdLoading(true)
    Promise.all([api.get('/api/justdial/cities'), api.get('/api/justdial/doctors')])
      .then(([{ data: c }, { data: d }]) => {
        if ((c.results || []).length) setJdCities(c.results)
        if ((d.results || []).length) setJdItems(d.results)
        setJdNote(d.note || '')
      })
      .catch(() => {
        // Fallbacks already set — JustDial short URLs still resolve.
        setJdCities((prev) => (prev.length ? prev : FALLBACK_JD_CITIES))
        setJdItems((prev) => (prev.length ? prev : fallbackJdItems()))
        setJdNote('Could not reach the backend — showing saved JustDial links. Ratings & booking live on JustDial.')
      })
      .finally(() => setJdLoading(false))
  }

  useEffect(() => {
    // Show fallback links instantly; replace with live data when it arrives.
    setHospitals(FALLBACK_HOSPITALS)
    reload()
    reloadJd()
  }, [])

  const pickRegion = (r) => {
    setRegion(r)
    try { localStorage.setItem('medrec_region', r) } catch { /* ignore */ }
  }

  const counts = useMemo(() => {
    const c = {}
    items.forEach((i) => { c[i.hospital_id] = (c[i.hospital_id] || 0) + 1 })
    return c
  }, [items])

  const visibleHospitals = useMemo(
    () => hospitals.filter((h) => regionMatches(h.cities, region)),
    [hospitals, region]
  )

  const hospital = hospitals.find((h) => h.id === hospitalId) || null

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return items.filter((i) =>
      i.hospital_id === hospitalId &&
      (!ql || i.specialty.toLowerCase().includes(ql) ||
        i.hospital.toLowerCase().includes(ql) ||
        (i.tags || []).some((t) => t.includes(ql))))
  }, [items, hospitalId, q])

  // If the saved hospital is filtered out by a new region, go back to step 1.
  useEffect(() => {
    if (hospitalId && !visibleHospitals.some((h) => h.id === hospitalId)) setHospitalId(null)
  }, [region]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- JustDial derived state ----
  const visibleJdCities = useMemo(() => {
    if (!region || region === 'All regions') return jdCities
    return jdCities.filter((c) => c.region === region)
  }, [jdCities, region])

  const jdCity = jdCities.find((c) => c.id === jdCityId) || null

  const jdCounts = useMemo(() => {
    const c = {}
    jdItems.forEach((i) => { c[i.city_id] = (c[i.city_id] || 0) + 1 })
    return c
  }, [jdItems])

  const jdShown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return jdItems.filter((i) =>
      i.city_id === jdCityId &&
      (!ql || i.specialty.toLowerCase().includes(ql) ||
        i.slug.toLowerCase().includes(ql) ||
        (i.tags || []).some((t) => t.includes(ql))))
  }, [jdItems, jdCityId, q])

  useEffect(() => {
    if (jdCityId && !visibleJdCities.some((c) => c.id === jdCityId)) setJdCityId(null)
  }, [region]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select the city when a single region is picked (JustDial tab).
  useEffect(() => {
    if (source !== 'justdial') return
    if (region !== 'All regions' && visibleJdCities.length === 1) setJdCityId(visibleJdCities[0].id)
  }, [region, source]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={s.wrap} className="rise">
      <div style={s.head}>
        <div>
          <h2 style={{ margin: '0 0 4px' }}>🏥 Find Doctors for Appointment</h2>
          <p style={{ color: '#667085', margin: 0, maxWidth: 720 }}>
            Choose your region first, then a hospital or JustDial city to see doctors available for appointment.
          </p>
        </div>
        <label style={s.regionWrap}>
          <span style={s.regionLabel}>Select your region</span>
          <select value={region} onChange={(e) => pickRegion(e.target.value)} style={s.regionSelect} aria-label="Select your region">
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>

      {/* Source tabs */}
      <div style={s.tabs} role="tablist" aria-label="Doctor source">
        <button
          role="tab" aria-selected={source === 'hospitals'}
          onClick={() => setSource('hospitals')}
          style={source === 'hospitals' ? { ...s.tab, ...s.tabActive } : s.tab}
        >
          🏥 Hospitals
        </button>
        <button
          role="tab" aria-selected={source === 'justdial'}
          onClick={() => setSource('justdial')}
          style={source === 'justdial' ? { ...s.tab, ...s.tabActive } : s.tab}
        >
          🔍 JustDial <span style={s.newPill}>new</span>
        </button>
      </div>

      {region !== 'All regions' && (
        <p style={{ margin: '12px 0 0' }}><span className="pill pill-info">📍 {region}</span></p>
      )}

      {source === 'hospitals' && loadError && (
        <div className="empty" style={{ marginTop: 14, textAlign: 'left' }}>
          ⚠️ {loadError} <button onClick={reload} style={s.linkBtn}>Retry →</button>
        </div>
      )}

      {/* ============ HOSPITALS TAB ============ */}
      {source === 'hospitals' && (
      <>
      {/* STEP 1 — pick a hospital */}
      {!loading && !hospital && (
        <>
          <p style={{ color: '#667085', margin: '12px 0 16px', maxWidth: 720 }}>
            Step 1 of 2 — {visibleHospitals.length} hospital(s){region !== 'All regions' ? ` serving ${region}` : ''}. Pick one to see its doctors.
          </p>
          <div style={s.grid}>
            {visibleHospitals.map((h) => {
              const link = hospitalLink(h)
              return (
                <div key={h.id} style={s.hospCard}>
                  <div style={s.hospImgWrap}>
                    <span style={s.hospImgFallback}>🏥</span>
                    <PhotoFrame
                      src={PHOTOS.hospital}
                      alt={`${h.name} building`}
                      style={{ position: 'absolute', inset: 0, borderRadius: 12 }}
                    />
                  </div>
                  <b style={s.hospName}>{h.name}</b>
                  <span style={s.hospMeta} title={h.cities}>
                    📍 {region !== 'All regions' ? region : h.cities}
                    {counts[h.id] ? ` · ${counts[h.id]} specialties` : ''}
                  </span>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" style={s.bookBtn}>
                      📅 Book Appointment ↗
                    </a>
                  )}
                  {(h.consultants_url || h.contact_url) && (
                    <span style={{ fontSize: 13 }}>
                      {h.consultants_url && (
                        <a href={h.consultants_url} target="_blank" rel="noreferrer" style={s.siteLink}>
                          🌐 Hospital site ↗
                        </a>
                      )}
                      {h.consultants_url && h.contact_url && <span style={{ color: '#98a2b3' }}> · </span>}
                      {h.contact_url && (
                        <a href={h.contact_url} target="_blank" rel="noreferrer" style={s.siteLink}>
                          Contact ↗
                        </a>
                      )}
                    </span>
                  )}
                  <button onClick={() => setHospitalId(h.id)} style={s.pickBtn}>
                    View doctors →
                  </button>
                </div>
              )
            })}
          </div>
          {!visibleHospitals.length && (
            <div className="empty" style={{ marginTop: 12 }}>
              No hospitals list {region} yet — try <b>All regions</b> or <b>Mumbai</b>.
              {' '}<button onClick={() => pickRegion('All regions')} style={s.linkBtn}>Show all →</button>
            </div>
          )}
        </>
      )}

      {/* STEP 2 — that hospital's doctors list */}
      {!loading && hospital && (
        <>
          <p style={{ color: '#667085', margin: '12px 0', maxWidth: 720 }}>
            Step 2 of 2 — <b>{hospital.name}</b> ({hospital.cities})
            {region !== 'All regions' && <> · 📍 {region}</>}.{' '}
            <button onClick={() => setHospitalId(null)} style={s.linkBtn}>← Change hospital</button>
          </p>
          {/* Prominent hospital-level booking banner */}
          <div style={s.bookBanner}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>📅 Book an appointment at {hospital.name}</div>
              <div style={{ fontSize: 13, color: '#e6f4f1', marginTop: 2 }}>
                Official hospital booking page — pick doctor, date & time slot there. No login needed here.
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
                {hospital.consultants_url && (
                  <a href={hospital.consultants_url} target="_blank" rel="noreferrer" style={s.bannerLink}>
                    🌐 Hospital doctors site ↗
                  </a>
                )}
                {hospital.contact_url && (
                  <a href={hospital.contact_url} target="_blank" rel="noreferrer" style={s.bannerLink}>
                    Contact hospital ↗
                  </a>
                )}
              </div>
            </div>
            {hospitalLink(hospital) && (
              <a href={hospitalLink(hospital)} target="_blank" rel="noreferrer" style={s.bookBannerBtn}>
                Book Appointment ↗
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter specialties — e.g. cardio, neuro, skin…"
              style={{ padding: '11px 13px', fontSize: 14.5, width: 'min(480px, 100%)', borderRadius: 12 }}
            />
            {hospitalLink(hospital) && (
              <a href={hospitalLink(hospital)} target="_blank" rel="noreferrer" style={s.ghostBtn}>
                All {hospital.name.split(' ')[0]} doctors ↗
              </a>
            )}
          </div>

          <div style={s.grid}>
            {shown.map((d) => {
              const guide = findDepartment(d.specialty, d.tags)
              return (
                <div key={`${d.hospital_id}-${d.specialty}`} style={s.card}>
                  <b style={{ fontSize: 16 }}>🩺 {d.specialty}</b>
                  {guide && (
                    <p style={{ fontSize: 13, color: '#344054', margin: '6px 0 0' }}>
                      <b>What it does:</b> {guide.purpose}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {(d.book_url || hospitalLink(hospital)) && (
                      <a href={d.book_url || hospitalLink(hospital)} target="_blank" rel="noreferrer" style={s.bookBtn}>
                        📅 Book {d.specialty} ↗
                      </a>
                    )}
                    {d.info_url && (
                      <a href={d.info_url} target="_blank" rel="noreferrer" style={s.ghostBtn}>
                        About department ↗
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {!shown.length && (
            <div className="empty">
              {!items.length ? (
                <>Specialty list couldn&apos;t load — but you can still{' '}
                  {hospitalLink(hospital) && (
                    <a href={hospitalLink(hospital)} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
                      book at {hospital.name} directly ↗
                    </a>
                  )}.</>
              ) : (
                <>No specialty matches &quot;{q}&quot; at {hospital.name} — try e.g. cardio, neuro, ortho.</>
              )}
            </div>
          )}
        </>
      )}

      {note && <p style={{ fontSize: 12, color: '#667085', marginTop: 12 }}>ℹ️ {note}</p>}
      </>)}

      {/* ============ JUSTDIAL TAB ============ */}
      {source === 'justdial' && (
      <>
        {/* STEP 1 — pick a city */}
        {!jdLoading && !jdCity && (
          <>
            <p style={{ color: '#667085', margin: '12px 0 16px', maxWidth: 720 }}>
              Step 1 of 2 — {visibleJdCities.length} cit{visibleJdCities.length === 1 ? 'y' : 'ies'}
              {region !== 'All regions' ? ` for ${region}` : ' across India'}. Pick one to see its doctors on JustDial.
            </p>
            <div style={s.grid}>
              {visibleJdCities.map((c) => (
                <div key={c.id} style={s.hospCard}>
                  <div style={s.hospImgWrap}>
                    <span style={s.hospImgFallback}>🔍</span>
                    <PhotoFrame
                      src={PHOTOS.hospital}
                      alt={`${c.region} on JustDial`}
                      style={{ position: 'absolute', inset: 0, borderRadius: 12 }}
                    />
                  </div>
                  <b style={s.hospName}>Doctors in {c.region}</b>
                  <span style={s.hospMeta}>
                    📍 {c.justdial_city} on JustDial
                    {jdCounts[c.id] ? ` · ${jdCounts[c.id]} specialties` : ''}
                  </span>
                  <a href={c.doctors_url} target="_blank" rel="noreferrer" style={s.jdBtn}>
                    🔍 All doctors on JustDial ↗
                  </a>
                  <button onClick={() => setJdCityId(c.id)} style={s.pickBtn}>
                    View specialties →
                  </button>
                </div>
              ))}
            </div>
            {!visibleJdCities.length && (
              <div className="empty" style={{ marginTop: 12 }}>
                No city matches — try <b>All regions</b>.
                {' '}<button onClick={() => pickRegion('All regions')} style={s.linkBtn}>Show all →</button>
              </div>
            )}
          </>
        )}

        {/* STEP 2 — that city's specialties on JustDial */}
        {!jdLoading && jdCity && (
          <>
            <p style={{ color: '#667085', margin: '12px 0', maxWidth: 720 }}>
              Step 2 of 2 — <b>Doctors in {jdCity.region}</b> via JustDial
              {region !== 'All regions' && <> · 📍 {region}</>}.{' '}
              <button onClick={() => setJdCityId(null)} style={s.linkBtn}>← Change city</button>
            </p>
            <div style={s.jdBanner}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>🔍 Book doctors in {jdCity.region} on JustDial</div>
                <div style={{ fontSize: 13, color: '#e6f4f1', marginTop: 2 }}>
                  Ratings, phone/WhatsApp & Book Appointment buttons live on JustDial. No login needed here.
                </div>
              </div>
              <a href={jdCity.doctors_url} target="_blank" rel="noreferrer" style={s.bookBannerBtn}>
                All {jdCity.region} doctors ↗
              </a>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter specialties — e.g. cardio, dental, skin…"
                style={{ padding: '11px 13px', fontSize: 14.5, width: 'min(480px, 100%)', borderRadius: 12 }}
              />
            </div>
            <div style={s.grid}>
              {jdShown.map((d) => {
                const guide = findDepartment(d.specialty, d.tags)
                return (
                  <div key={`${d.city_id}-${d.specialty}`} style={s.card}>
                    <b style={{ fontSize: 16 }}>🩺 {d.specialty}</b>
                    <span style={{ fontSize: 12.5, color: '#667085' }}> · {d.justdial_city} on JustDial</span>
                    {guide && (
                      <p style={{ fontSize: 13, color: '#344054', margin: '6px 0 0' }}>
                        <b>What it does:</b> {guide.purpose}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <a href={d.book_url} target="_blank" rel="noreferrer" style={s.jdBtn}>
                        🔍 {d.specialty} in {d.justdial_city} ↗
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
            {!jdShown.length && (
              <div className="empty">
                {!jdItems.length ? (
                  <>Specialty list couldn&apos;t load — but you can still{' '}
                    <a href={jdCity.doctors_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
                      browse {jdCity.region} doctors on JustDial ↗
                    </a>.</>
                ) : (
                  <>No specialty matches &quot;{q}&quot; in {jdCity.region} — try e.g. cardio, dental, skin.</>
                )}
              </div>
            )}
          </>
        )}

        {(jdLoading) && <div className="empty" style={{ marginTop: 12 }}>Loading JustDial directory…</div>}
        {jdNote && <p style={{ fontSize: 12, color: '#667085', marginTop: 12 }}>ℹ️ {jdNote}</p>}
      </>)}

      <p style={{ fontSize: 12, color: '#667085' }}>
        Your MedRec-registered doctors can still be booked instantly from the Appointments tab.
        {region !== 'All regions' && <> Final city/branch selection happens on the hospital / JustDial site.</>}
      </p>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 6px 40px' },
  head: { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' },
  regionWrap: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 },
  regionLabel: { fontSize: 13, fontWeight: 650, color: '#344054' },
  regionSelect: { padding: '11px 13px', fontSize: 14.5, borderRadius: 12, minWidth: 220 },
  tabs: { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  tab: { padding: '10px 18px', borderRadius: 999, border: '1px solid #e9edf2', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#344054' },
  tabActive: { background: '#101828', color: '#fff', borderColor: '#101828' },
  newPill: { fontSize: 11, background: '#12b76a', color: '#fff', borderRadius: 999, padding: '2px 8px', marginLeft: 6, fontWeight: 800 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 20 },
  hospCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid #e9edf2', borderRadius: 20, padding: 26, background: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,.05)', gap: 14 },
  hospImgWrap: { position: 'relative', width: '100%', height: 150, borderRadius: 12, overflow: 'hidden', background: '#eef4f2', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  hospImgFallback: { fontSize: 44 },
  hospName: { fontSize: 17, fontWeight: 750, color: '#101828', letterSpacing: '-0.01em', lineHeight: 1.4 },
  hospMeta: { fontSize: 13, color: '#667085', lineHeight: 1.6 },
  siteLink: { color: '#0a6e63', fontWeight: 650, textDecoration: 'none' },
  bannerLink: { color: '#fff', fontWeight: 650 },
  pickBtn: { padding: '9px 18px', background: '#101828', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 0, cursor: 'pointer', width: '100%' },
  card: { border: '1px solid #e9edf2', borderRadius: 16, padding: 16, background: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,.05)' },
  bookBtn: { padding: '10px 16px', background: 'linear-gradient(135deg,#0a6e63,#0d9488)', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 14, display: 'inline-block', width: '100%', textAlign: 'center', boxShadow: '0 2px 8px rgba(10,110,99,.35)' },
  jdBtn: { padding: '10px 16px', background: 'linear-gradient(135deg,#175cd3,#1570ef)', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 14, display: 'inline-block', width: '100%', textAlign: 'center', boxShadow: '0 2px 8px rgba(21,112,239,.35)' },
  bookBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'linear-gradient(135deg,#0f766e,#115e59)', color: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 14, boxShadow: '0 4px 14px rgba(15,118,110,.35)' },
  jdBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'linear-gradient(135deg,#175cd3,#1849a9)', color: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 14, boxShadow: '0 4px 14px rgba(23,92,211,.35)' },
  bookBannerBtn: { padding: '11px 20px', background: '#fff', color: '#0f766e', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,.2)' },
  ghostBtn: { padding: '9px 15px', border: '1px solid #e9edf2', color: '#101828', borderRadius: 12, textDecoration: 'none', fontWeight: 650, fontSize: 14, background: '#fff', display: 'inline-block' },
  linkBtn: { background: 'none', border: 0, color: '#0a6e63', cursor: 'pointer', padding: 0, fontWeight: 700, boxShadow: 'none', fontSize: 14 },
}
