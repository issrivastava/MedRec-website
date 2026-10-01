import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { DEPARTMENTS } from '../departments'

/* Floating "Need help ?" widget — mounted app-wide, with help matched to
   the page you're on, plus a Departments guide (purpose + how it works). */

const GENERAL_FAQS = [
  { q: 'How do I start?', a: 'Register free → fill your info → scan your first report → link your doctor by email.' },
  { q: 'I forgot my password', a: 'Use Login → Forgot password (email OTP), or ask us via Contact Us.' },
  { q: 'Is this an emergency?', a: 'MedRec is not for emergencies — call your local emergency number first, then use the SOS button inside the app.' },
]

const ROUTE_HELP = {
  '/medicines': {
    title: '💊 Medicines help',
    faqs: [
      { q: 'Where does medicine data come from?', a: 'The free openFDA drug-label database (no key needed). Every result also links to its Tata 1mg page for prices and substitutes.' },
      { q: 'The brand I searched is missing?', a: 'Try the generic/salt name — e.g. Paracetamol instead of Crocin. Indian brand names are auto-translated where possible.' },
    ],
  },
  '/illnesses': {
    title: '🩺 Illnesses help',
    faqs: [
      { q: 'Where does illness info come from?', a: 'The free Wikipedia encyclopedia, with a built-in offline guide as backup. Always confirm with your doctor.' },
      { q: 'How do I find a doctor for this condition?', a: 'Open any illness and tap "Find doctors for appointment" — it takes you to the right specialists at Bombay, Apollo, Fortis, Lilavati, Kokilaben or Nanavati Max.' },
    ],
  },
  '/diseases': {
    title: '🩺 Illnesses help',
    faqs: [
      { q: 'Where does illness info come from?', a: 'The free Wikipedia encyclopedia, with a built-in offline guide as backup. Always confirm with your doctor.' },
      { q: 'How do I find a doctor for this condition?', a: 'Open any illness and tap "Find doctors for appointment" — it takes you to the right specialists at Bombay, Apollo, Fortis, Lilavati, Kokilaben or Nanavati Max.' },
    ],
  },
  '/find-doctors': {
    title: '🏥 Hospital doctors help',
    faqs: [
      { q: 'How do I book?', a: 'Step 1: pick a hospital (Bombay, Apollo, Fortis, Lilavati, Kokilaben or Nanavati Max). Step 2: tap "📅 Book Appointment" for the official hospital booking page, or choose a specialty and tap "📅 Book …" — booking happens on the hospital site.' },
      { q: 'What does each department do?', a: 'Switch to the Departments tab below — every department’s purpose and how it works is listed there.' },
    ],
    tab: 'departments',
  },
  '/ask-ai': {
    title: '🤖 Ask AI help',
    faqs: [
      { q: 'What can I ask?', a: 'Any health or MedRec doubt in simple words. Keep it specific — e.g. "What is HbA1c?" works better than "tell me about blood".' },
      { q: 'Which AI answers me?', a: 'Free Gemini AI when a key is set, otherwise your local Ollama model. Answers are informational only — not medical advice.' },
    ],
  },
  '/patient': {
    title: '📊 Patient dashboard help',
    faqs: [
      { q: 'How do I add a report?', a: 'My Records tab → Scan/Upload → photo, video or PDF → Upload. Lab values are auto-checked for alerts.' },
      { q: 'How do I link my doctor?', a: 'Overview tab → My Doctors → enter their email → Add. They can then view your records.' },
      { q: 'Where is my clinical history?', a: 'The Clinical History tab — write it once in detail; your doctors read it automatically.' },
    ],
  },
  '/doctor': {
    title: '🩺 Doctor dashboard help',
    faqs: [
      { q: 'How do I see a patient?', a: 'Open Patients (/doctor/patients) → Search → Records. Only patients linked to you are visible.' },
      { q: 'Where are patient records?', a: 'Each patient has their own page: /doctor/patients/:id with Records, Lab Alerts, Vitals, Vaccines, Notes and Chat tabs.' },
      { q: 'Where are my ratings?', a: 'Ratings & Reviews page (/doctor/reviews) shows your average stars and every patient review.' },
      { q: 'Where is their clinical history?', a: 'Open the patient Records page → top card → "Clinical history (written by patient)" section.' },
    ],
  },
  '/timeline': {
    title: '📈 Timeline help',
    faqs: [
      { q: 'What shows here?', a: 'Every report, prescription and appointment on one scrollable page, newest first.' },
    ],
  },
  '/profile': {
    title: '👤 Profile help',
    faqs: [
      { q: 'How do I edit my photo?', a: 'My Profile → ✏️ Edit next to your picture: rotate, flip, zoom, brightness and contrast, then Save.' },
    ],
  },
}

function routeKey(pathname) {
  const hit = Object.keys(ROUTE_HELP).find((k) => pathname === k || pathname.startsWith(k + '/'))
  return hit || null
}

export default function NeedHelp() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const key = routeKey(pathname)
  const [tab, setTab] = useState('help')
  const [q, setQ] = useState('')

  // When the page changes, reset to that page's relevant tab.
  useEffect(() => {
    setTab(ROUTE_HELP[key]?.tab || 'help')
    setQ('')
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const faqs = [...(ROUTE_HELP[key]?.faqs || []), ...GENERAL_FAQS]
  const ql = q.trim().toLowerCase()
  const shownFaqs = faqs.filter((f) =>
    !ql || (f.q + f.a).toLowerCase().includes(ql))
  const shownDepts = DEPARTMENTS.filter((d) =>
    !ql || (d.name + d.purpose + d.how).toLowerCase().includes(ql))

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label="Need help?" title="Need help?" style={s.fab}>
        <span style={{ fontSize: 22 }}>💬</span>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Need help ?</span>
      </button>

      {open && (
        <div style={s.panel} role="dialog" aria-label="Help panel">
          <div style={s.head}>
            <b>🙋 {ROUTE_HELP[key]?.title || 'How can we help?'}</b>
            <button onClick={() => setOpen(false)} style={s.x} aria-label="Close help">✕</button>
          </div>

          <div style={s.tabs}>
            <button onClick={() => setTab('help')} style={tab === 'help' ? s.tabOn : s.tab}>❓ This page</button>
            <button onClick={() => setTab('departments')} style={tab === 'departments' ? s.tabOn : s.tab}>🏥 Departments</button>
          </div>

          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'departments' ? 'Search departments… (e.g. heart, skin)' : 'Search help… (e.g. password, medicine)'}
            style={s.search}
          />

          {tab === 'help' && (
            <div style={s.list}>
              {shownFaqs.map((f) => (
                <details key={f.q} style={s.item}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{f.q}</summary>
                  <p style={{ margin: '6px 0 0', color: '#5d6b7a', fontSize: 14 }}>{f.a}</p>
                </details>
              ))}
              {!shownFaqs.length && <p style={{ color: '#5d6b7a' }}>No matches — message us below.</p>}
            </div>
          )}

          {tab === 'departments' && (
            <div style={s.list}>
              {shownDepts.map((d) => (
                <details key={d.name} style={s.item}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>🏥 {d.name}</summary>
                  <p style={{ margin: '6px 0 0', fontSize: 14 }}><b>What it does:</b> <span style={{ color: '#334155' }}>{d.purpose}</span></p>
                  <p style={{ margin: '4px 0 0', fontSize: 14 }}><b>How it works:</b> <span style={{ color: '#334155' }}>{d.how}</span></p>
                </details>
              ))}
              {!shownDepts.length && <p style={{ color: '#5d6b7a' }}>No department matches — try e.g. heart, skin, brain.</p>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Link to="/contact" style={s.primary}>📩 Contact Us</Link>
            <Link to="/ask-ai" style={s.ghost}>🤖 Ask AI</Link>
            <Link to="/find-doctors" style={s.ghost}>🏥 Doctors</Link>
          </div>
          <p style={{ fontSize: 12, color: '#8a6d3b', margin: '10px 0 0' }}>
            🚨 Medical emergency? Call your local emergency number first.
          </p>
        </div>
      )}
    </>
  )
}

const s = {
  fab: {
    position: 'fixed', right: 18, bottom: 76, zIndex: 60,
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#101828', color: '#fff', border: '1px solid #101828',
    borderRadius: 999, padding: '11px 18px', cursor: 'pointer',
    boxShadow: '0 12px 28px -8px rgba(16,24,40,.4)',
    fontFamily: 'Inter, sans-serif',
  },
  panel: {
    position: 'fixed', right: 18, bottom: 132, zIndex: 60, width: 'min(380px, calc(100vw - 36px))',
    background: '#fff', border: '1px solid #e9edf2',
    borderRadius: 16, padding: 16, boxShadow: '0 16px 40px -12px rgba(16,24,40,.25)',
    maxHeight: 'min(64vh, 520px)', overflow: 'auto',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  x: { border: '1px solid #e9edf2', background: '#fff', borderRadius: 8, cursor: 'pointer', padding: '2px 8px' },
  tabs: { display: 'flex', gap: 6, marginBottom: 8, background: '#f1f4f8', padding: 4, borderRadius: 999 },
  tab: { flex: 1, padding: '7px 8px', cursor: 'pointer', fontSize: 13, border: 0, background: 'transparent', borderRadius: 999, fontWeight: 600, color: '#667085' },
  tabOn: { flex: 1, padding: '7px 8px', cursor: 'pointer', fontSize: 13, background: '#fff', color: '#101828', border: '1px solid #e9edf2', borderRadius: 999, fontWeight: 700, boxShadow: '0 1px 2px rgba(16,24,40,.08)' },
  search: { width: '100%', padding: '9px 12px', fontSize: 14, marginBottom: 8, borderRadius: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { border: '1px solid #e9edf2', borderRadius: 12, padding: '9px 12px', background: '#fbfcfd' },
  primary: { background: '#101828', color: '#fff', borderRadius: 999, padding: '8px 14px', textDecoration: 'none', fontWeight: 700, fontSize: 13.5 },
  ghost: { border: '1px solid #e9edf2', color: '#101828', borderRadius: 999, padding: '8px 14px', textDecoration: 'none', fontWeight: 650, fontSize: 13.5, background: '#fff' },
}
