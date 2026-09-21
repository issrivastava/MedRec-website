import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PhotoFrame, PHOTOS } from '../components/People'
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
  { icon: '💊', tile: 't-green', title: 'Medicine descriptions', text: 'Search any medicine for uses, dosage and side effects — free drug data with Tata 1mg links.' },
  { icon: '🩺', tile: 't-rose', title: 'Disease descriptions', text: 'Look up any condition — symptoms, causes, diagnosis, treatment and prevention, free.' },
  { icon: '🤖', tile: 't-violet', title: 'Ask AI doubts', text: 'Chat with free Gemini AI — health and app doubts explained in simple words.' },
]

const STEPS = [
  { n: '1', title: 'Sign in with Google', text: 'Pick patient or doctor on login — your account is created automatically.' },
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
  const dashboard = user ? (user.role === 'doctor' ? '/doctor' : '/patient') : null

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
                  <Link to="/login" style={s.primary}>Login / Sign up with Google →</Link>
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

          {/* Product visual — classic framed photo + info cards */}
          <div style={s.visual} className="hero-visual">
            <div className="hero-chips">
              <div className="hero-photo">
                <PhotoFrame src={PHOTOS.heroDoctor} alt="Doctor reviewing records on a tablet"
                  style={{ border: 0, height: '100%' }} />
              </div>
              <div className="hero-chip">Appointment booked — Tue 10:00</div>
              <div className="hero-chip">AI summary ready in Hindi</div>
            </div>
            <div className="hero-mock" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>Blood Test — Jan</b><span className="pill pill-ok">lab</span>
              </div>
              <div style={{ fontSize: 13, color: '#5d6b7a', marginTop: 4 }}>Dr. Sharma · City Hospital</div>
            </div>
          </div>
        </div>
      </header>

      {/* FEATURES */}
      <section className="landing-section">
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
        <div className="band-overlay">
          <h2 style={s.bandH}>Care, connected.</h2>
          <p style={s.bandP}>Patients, doctors and families — finally looking at the same record.</p>
          {!user && <Link to="/login" style={s.primary}>Join with Google →</Link>}
        </div>
      </section>

      {/* STEPS */}
      <section className="landing-section" style={{ background: '#eef2f7', borderTop: '1px solid #c9d4e2', borderBottom: '1px solid #c9d4e2' }}>
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
      <section className="landing-section">
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

      {/* CTA */}
      <section style={{ background: '#1a2e45', color: '#fff', borderTop: '4px solid #8a6d3b' }}>
        <div className="cta-band">
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 30, fontFamily: 'Georgia, serif', color: '#fff' }}>Stop losing prescriptions in drawers.</h2>
            <p style={{ margin: '0 0 18px', color: '#c9d4e2' }}>Join MedRec free — your health history, organized forever.</p>
            {!user && <Link to="/login" style={s.ctaBtn}>Get started with Google →</Link>}
          </div>
        </div>
      </section>
    </div>
  )
}

const s = {
  hero: { background: '#ffffff', color: '#1a2e45', borderBottom: '1px solid #dfe3e8' },
  badge: { background: '#eef2f7', border: '1px solid #1a2e45', borderRadius: 4, padding: '5px 16px', fontSize: 13, fontWeight: 700, color: '#1a2e45' },
  h1: { fontSize: 'clamp(28px,4.5vw,52px)', margin: '18px 0 12px', letterSpacing: '0', lineHeight: 1.15, color: '#1a2e45', fontFamily: 'Georgia, serif', fontWeight: 700 },
  sub: { fontSize: 'clamp(15px,2vw,18px)', margin: '0 0 26px', color: '#5d6b7a', maxWidth: 560 },
  primary: { padding: '13px 26px', background: '#1a2e45', color: '#fff', fontWeight: 700, borderRadius: 4, textDecoration: 'none', border: '1px solid #1a2e45', display: 'inline-block' },
  secondary: { padding: '13px 26px', border: '1px solid #1a2e45', color: '#1a2e45', fontWeight: 700, borderRadius: 4, textDecoration: 'none', background: '#fff', display: 'inline-block' },
  welcome: { display: 'flex', gap: 14, alignItems: 'center', marginTop: 28, background: '#f8f9fa', border: '1px solid #dfe3e8', borderLeft: '4px solid #1a2e45', borderRadius: 4, padding: '14px 18px', flexWrap: 'wrap', maxWidth: '100%' },
  welcomeIcon: { fontSize: 40 },
  welcomeTitle: { fontSize: 24, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1a2e45' },
  welcomeSub: { color: '#5d6b7a', fontSize: 14 },
  visual: { paddingRight: 12, minWidth: 0, maxWidth: '100%' },
  band: { position: 'relative', minHeight: 340, display: 'flex', alignItems: 'center', overflow: 'hidden', background: '#1a2e45' },
  bandH: { margin: '0 0 8px', fontSize: 'clamp(26px,4vw,36px)', fontFamily: 'Georgia, serif', color: '#fff' },
  bandP: { margin: '0 0 18px', color: '#e8eef5', fontSize: 'clamp(15px,2vw,18px)' },
  section: { width: '100%', padding: '52px 48px', background: '#fff' },
  kicker: { color: '#8a6d3b', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', margin: '0 0 6px' },
  h2: { fontSize: 30, margin: '0 0 26px', color: '#1a2e45', letterSpacing: '0', fontFamily: 'Georgia, serif' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 16 },
  card: { border: '1px solid #dfe3e8', borderRadius: 4, padding: 22, background: '#fff', boxShadow: 'none' },
  quote: { border: '1px solid #d6c9a8', borderLeft: '4px solid #8a6d3b', borderRadius: 4, padding: 22, background: '#fff' },
  iconTile: { width: 44, height: 44, fontSize: 22 },
  cardH: { margin: '12px 0 6px', color: '#1a2e45', fontSize: 18, fontFamily: 'Georgia, serif' },
  cardP: { margin: 0, color: '#5d6b7a' },
  steps: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(230px,100%),1fr))', gap: 14 },
  step: { display: 'flex', gap: 12, background: '#fff', borderRadius: 4, padding: 18, border: '1px solid #dfe3e8', position: 'relative' },
  stepN: { background: '#1a2e45', color: '#fff', fontWeight: 700, borderRadius: 4, minWidth: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  stepArrow: { display: 'none' },
  faq: { border: '1px solid #dfe3e8', borderRadius: 4, background: '#fff', overflow: 'hidden', borderLeft: '4px solid #1a2e45' },
  faqQ: { width: '100%', textAlign: 'left', border: 0, background: 'none', padding: '15px 18px', fontSize: 16, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'none', gap: 12 },
  faqIcon: { background: '#eef2f7', border: '1px solid #c9d4e2', borderRadius: '50%', minWidth: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1a2e45', fontWeight: 700 },
  faqA: { margin: 0, padding: '0 18px 16px', color: '#5d6b7a' },
  cta: { background: '#1a2e45', color: '#fff', padding: '56px 48px', display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' },
  ctaBtn: { padding: '14px 30px', background: '#fff', color: '#1a2e45', fontWeight: 700, borderRadius: 4, textDecoration: 'none', border: '1px solid #fff', fontSize: 17, display: 'inline-block', maxWidth: '100%' },
}
