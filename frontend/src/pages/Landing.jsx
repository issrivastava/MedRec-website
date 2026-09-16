import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { Avatar, PhotoFrame, PHOTOS } from '../components/People'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  { icon: '📱', tile: 't-teal', title: 'Scan & store reports', text: 'Snap prescriptions, lab reports and scans with your phone camera. Everything lives in one secure place.' },
  { icon: '🤖', tile: 't-violet', title: 'AI-generated summaries', text: 'Local Ollama AI turns every upload into plain language — findings, medicines and follow-ups.' },
  { icon: '🗂️', tile: 't-amber', title: 'Date-wise & doctor-wise', text: 'Reports auto-grouped by visit month and doctor, with search and type filters.' },
  { icon: '💊', tile: 't-green', title: 'E-prescriptions', text: 'Doctors send prescriptions and visit notes back to you, with dosage schedules and follow-up dates.' },
  { icon: '📅', tile: 't-blue', title: 'Appointments', text: 'Set weekly availability, book in one click, and both sides get notified of changes.' },
  { icon: '📈', tile: 't-rose', title: 'Health timeline', text: 'Every report, prescription and visit plotted on one scrollable timeline.' },
  { icon: '⚠️', tile: 't-amber', title: 'Lab alerts', text: 'Abnormal values auto-flagged against doctor-approved ranges, with a checkup nudge.' },
  { icon: '👪', tile: 't-teal', title: 'Family profiles', text: 'Manage kids, parents and elders — each with their own records — from one account.' },
  { icon: '🌐', tile: 't-violet', title: 'AI in your language', text: 'Summaries in English, Hindi, Hinglish, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam.' },
]

const STEPS = [
  { n: '1', title: 'Create your account', text: 'Register free as a patient or doctor, then log in.' },
  { n: '2', title: 'Build your record', text: 'Fill your info page, scan reports, link your doctor by email.' },
  { n: '3', title: 'Get AI clarity', text: 'One tap turns any document into a summary you can actually understand.' },
  { n: '4', title: 'Doctors take over', text: 'Your doctor picks you from their dropdown and reviews everything.' },
]

const FAQS = [
  { q: 'Is my medical data private?', a: 'Yes. Doctors can only open records of patients explicitly assigned to them, and every view notifies the patient. We never sell your data.' },
  { q: 'Do I need to install anything for the AI?', a: 'No. The AI runs on our servers via a self-hosted local model — your document text is never sent to third-party AI services.' },
  { q: 'Can the AI diagnose me?', a: 'No, and it is designed not to. Summaries are informational only — always discuss them with your doctor.' },
  { q: 'Is MedRec free?', a: 'Yes, the core product — records, AI summaries, appointments and timeline — is free for patients and doctors.' },
]

export default function Landing() {
  const { user } = useAuth()
  const [openFaq, setOpenFaq] = useState(null)
  const [reviews, setReviews] = useState([])
  const dashboard = user ? (user.role === 'doctor' ? '/doctor' : '/patient') : null

  useEffect(() => {
    api.get('/api/reviews/recent').then(({ data }) => setReviews(data)).catch(() => {})
  }, [])

  return (
    <div>
      {/* HERO — split across the screen */}
      <header style={s.hero}>
        <div className="hero-grid">
          <div>
            <span style={s.badge}>✨ Free for patients & doctors</span>
            <h1 style={s.h1}>Your medical records, finally organized</h1>
            <p style={s.sub}>
              Patients scan and keep every report and prescription. Doctors review
              assigned patients in one click. Local AI explains it all in plain words.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {user ? (
                <Link to={dashboard} style={s.primary}>Go to my Dashboard →</Link>
              ) : (
                <>
                  <Link to="/login" style={s.primary}>Login to my account →</Link>
                  <Link to="/register" style={s.secondary}>Create free account</Link>
                </>
              )}
            </div>
            <div style={s.welcome}>
              <span style={s.welcomeIcon}>🩺</span>
              <div>
                <div style={s.welcomeTitle}>Welcome to MedRec!</div>
                <div style={s.welcomeSub}>Your health history — organized, explained, and always with you.</div>
              </div>
            </div>
          </div>

          {/* Product visual — real care photography + floating app cards */}
          <div style={s.visual}>
            <div style={{ position: 'relative' }}>
              <PhotoFrame src={PHOTOS.heroDoctor} alt="Doctor reviewing records on a tablet"
                style={{ borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,.35)', border: '4px solid rgba(255,255,255,.5)', height: 380 }} />
              <div className="hero-chip float-b" style={{ position: 'absolute', left: -24, bottom: 64 }}>📅 Appointment booked — Tue 10:00</div>
              <div className="hero-chip float-c" style={{ position: 'absolute', right: -16, top: 40 }}>🤖 AI summary ready in Hindi</div>
            </div>
            <div className="hero-mock float-a" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>📄 Blood Test — Jan</b><span className="pill pill-ok">lab</span>
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Dr. Sharma · City Hospital</div>
            </div>
          </div>
        </div>
      </header>

      {/* FEATURES */}
      <section style={s.section}>
        <span className="kicker-rule" />
        <p style={s.kicker}>EVERYTHING IN ONE PLACE</p>
        <h2 style={s.h2}>What you can do with MedRec</h2>
        <div style={s.grid}>
          {FEATURES.map((f) => (
            <div key={f.title} className="feat-card" style={s.card}>
              <span className={`tile ${f.tile}`} style={s.iconTile}>{f.icon}</span>
              <h3 style={s.cardH}>{f.title}</h3>
              <p style={s.cardP}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PHOTO BAND */}
      <section style={s.band}>
        <PhotoFrame src={PHOTOS.careTeam} alt="Medical team"
          style={{ position: 'absolute', inset: 0 }} />
        <div style={s.bandOverlay}>
          <h2 style={s.bandH}>Care, connected.</h2>
          <p style={s.bandP}>Patients, doctors and families — finally looking at the same record.</p>
          {!user && <Link to="/register" style={s.primary}>Join free →</Link>}
        </div>
      </section>

      {/* STEPS */}
      <section style={{ ...s.section, background: '#f0fdfa', borderTop: '1px solid #99f6e4', borderBottom: '1px solid #99f6e4' }}>
        <span className="kicker-rule" />
        <p style={s.kicker}>GET STARTED IN MINUTES</p>
        <h2 style={s.h2}>How it works</h2>
        <div style={s.steps}>
          {STEPS.map((st, i) => (
            <div key={st.n} style={s.step}>
              <div style={s.stepN}>{st.n}</div>
              <div><b>{st.title}</b><p style={s.cardP}>{st.text}</p></div>
              {i < STEPS.length - 1 && <div style={s.stepArrow}>→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={s.section}>
        <span className="kicker-rule" />
        <p style={s.kicker}>GOOD TO KNOW</p>
        <h2 style={s.h2}>Frequently asked questions</h2>
        <div className="faq-grid">
          {FAQS.map((f, i) => (
            <div key={f.q} style={s.faq}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={s.faqQ}>
                {f.q} <span style={s.faqIcon}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p style={s.faqA}>{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      {reviews.length > 0 && (
        <section style={{ ...s.section, background: '#fffbeb', borderTop: '1px solid #fde68a', borderBottom: '1px solid #fde68a' }}>
          <span className="kicker-rule" />
          <p style={s.kicker}>PATIENT STORIES</p>
          <h2 style={s.h2}>Loved by patients & doctors</h2>
          <div style={s.grid}>
            {reviews.map((r) => (
              <div key={r.id} className="feat-card" style={s.quote}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar seed={r.patient_id} name={r.patient_name} size={44} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.patient_name}</div>
                    <div style={{ fontSize: 12, color: '#5f6f6a' }}>for Dr. {r.doctor_name}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', color: '#d97706', letterSpacing: 2 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                </div>
                <p style={{ ...s.cardP, marginTop: 10, fontStyle: 'italic' }}>"{r.comment || 'Great experience with my doctor.'}"</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section style={{ background: '#134e4a', color: '#fff' }}>
        <div className="cta-band">
          <h2 style={{ margin: '0 0 8px', fontSize: 32 }}>Stop losing prescriptions in drawers.</h2>
          <p style={{ margin: '0 0 18px', color: '#ccfbf1' }}>Join MedRec free — your health history, organized forever.</p>
          {!user && <Link to="/register" style={s.ctaBtn}>Get started — it's free →</Link>}
        </div>
        <div style={s.ctaCard}>
          <div style={s.ctaRow}><span>📄 Reports digitized</span><b>1,240+</b></div>
          <div style={s.ctaRow}><span>🤖 AI summaries</span><b>860+</b></div>
          <div style={s.ctaRow}><span>👨‍⚕️ Doctors on board</span><b>120+</b></div>
        </div>
      </section>
    </div>
  )
}

const s = {
  hero: { background: 'linear-gradient(120deg,#134e4a 0%,#0f766e 55%,#14b8a6 130%)', color: '#fff' },
  heroGrid: { display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 48, padding: '72px 48px 64px', alignItems: 'center', width: '100%' },
  badge: { background: 'rgba(255,255,255,.16)', border: '1px solid #fcd34d', borderRadius: 999, padding: '5px 16px', fontSize: 13, fontWeight: 700 },
  h1: { fontSize: 'clamp(34px,4.5vw,56px)', margin: '18px 0 12px', letterSpacing: '-0.02em', lineHeight: 1.1 },
  sub: { fontSize: 18, margin: '0 0 26px', color: '#ccfbf1', maxWidth: 560 },
  primary: { padding: '13px 26px', background: '#fff', color: '#115e59', fontWeight: 800, borderRadius: 10, textDecoration: 'none', boxShadow: '0 6px 20px rgba(0,0,0,.25)' },
  secondary: { padding: '13px 26px', border: '2px solid #fff', color: '#fff', fontWeight: 700, borderRadius: 10, textDecoration: 'none' },
  welcome: { display: 'inline-flex', gap: 14, alignItems: 'center', marginTop: 28, background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.4)', borderRadius: 16, padding: '14px 26px' },
  welcomeIcon: { fontSize: 40 },
  welcomeTitle: { fontSize: 26, fontWeight: 800 },
  welcomeSub: { color: '#ccfbf1', fontSize: 14 },
  visual: { paddingRight: 12 },
  band: { position: 'relative', minHeight: 340, display: 'flex', alignItems: 'center', overflow: 'hidden' },
  bandOverlay: { position: 'relative', background: 'linear-gradient(90deg,rgba(8,47,43,.88),rgba(8,47,43,.35))', color: '#fff', padding: '60px 48px', width: '100%' },
  bandH: { margin: '0 0 8px', fontSize: 38 },
  bandP: { margin: '0 0 18px', color: '#ccfbf1', fontSize: 18 },
  section: { width: '100%', padding: '52px 48px' },
  kicker: { color: '#0f766e', fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', margin: '0 0 6px' },
  h2: { fontSize: 32, margin: '0 0 26px', color: '#134e4a', letterSpacing: '-0.01em' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 },
  card: { border: '1px solid #f1f5f4', borderRadius: 14, padding: 22, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
  quote: { border: '1px solid #fde68a', borderLeft: '4px solid #d97706', borderRadius: 14, padding: 22, background: '#fff' },
  iconTile: { width: 48, height: 48, fontSize: 24 },
  cardH: { margin: '12px 0 6px', color: '#134e4a', fontSize: 18 },
  cardP: { margin: 0, color: '#5f6f6a' },
  steps: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14 },
  step: { display: 'flex', gap: 12, background: '#fff', borderRadius: 14, padding: 18, border: '1px solid #99f6e4', position: 'relative' },
  stepN: { background: 'linear-gradient(135deg,#14b8a6,#0f766e)', color: '#fff', fontWeight: 800, borderRadius: 12, minWidth: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  stepArrow: { display: 'none' },
  faq: { border: '1px solid #e7e5e4', borderRadius: 12, background: '#fff', overflow: 'hidden', borderLeft: '4px solid #0f766e' },
  faqQ: { width: '100%', textAlign: 'left', border: 0, background: 'none', padding: '15px 18px', fontSize: 16, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'none', gap: 12 },
  faqIcon: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '50%', minWidth: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e', fontWeight: 800 },
  faqA: { margin: 0, padding: '0 18px 16px', color: '#5f6f6a' },
  cta: { background: '#134e4a', color: '#fff', padding: '56px 48px', display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' },
  ctaBtn: { padding: '14px 30px', background: 'linear-gradient(90deg,#fbbf24,#d97706)', color: '#fff', fontWeight: 800, borderRadius: 10, textDecoration: 'none', boxShadow: '0 6px 20px rgba(0,0,0,.3)', fontSize: 17 },
  ctaCard: { background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 16, padding: 20, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 },
  ctaRow: { display: 'flex', justifyContent: 'space-between', gap: 24, borderBottom: '1px solid rgba(255,255,255,.15)', paddingBottom: 10 },
}
