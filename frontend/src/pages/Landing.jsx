import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PhotoFrame, PHOTOS } from '../components/People'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  { icon: '📱', title: 'Scan & store reports', text: 'Snap prescriptions, labs and scans. Everything lives in one secure place.' },
  { icon: '🤖', title: 'AI summaries', text: 'Plain-language findings, medicines and follow-ups from every upload.' },
  { icon: '🗂️', title: 'Organized by visit', text: 'Auto-grouped by month and doctor, with search and filters.' },
  { icon: '💊', title: 'E-prescriptions', text: 'Doctors send prescriptions and visit notes back with dosage schedules.' },
  { icon: '📅', title: 'Appointments', text: 'Weekly availability, one-click booking, instant notifications.' },
  { icon: '📈', title: 'Health timeline', text: 'Every report, prescription and visit on one scrollable timeline.' },
  { icon: '⚠️', title: 'Lab alerts', text: 'Abnormal values auto-flagged with a gentle checkup nudge.' },
  { icon: '👪', title: 'Family profiles', text: 'Kids, parents and elders — each with their own records.' },
  { icon: '🌐', title: '8 languages', text: 'Summaries in English, Marathi, Tamil, Telugu and more.' },
  { icon: '💊', title: 'Medicine guide', text: 'Uses, dosage and side effects with Tata 1mg links.' },
  { icon: '🩺', title: 'Illness guide', text: 'Symptoms, causes, treatment and prevention — free.' },
  { icon: '💬', title: 'Ask AI', text: 'Health and app doubts explained in simple words.' },
]

const STEPS = [
  { n: '1', title: 'Sign in with Google', text: 'Pick patient or doctor — your account is created automatically.' },
  { n: '2', title: 'Build your record', text: 'Fill your info, scan reports, link your doctor.' },
  { n: '3', title: 'Get AI clarity', text: 'One tap turns any document into plain language.' },
  { n: '4', title: 'Doctors take over', text: 'Your doctor reviews everything in one click.' },
]

const FAQS = [
  { q: 'Is my medical data private?', a: 'Yes. Doctors only see patients explicitly assigned to them, and every view notifies the patient. We never sell your data.' },
  { q: 'Do I need to install anything for the AI?', a: 'No. The AI runs on our servers — your document text is never sent to third-party AI services.' },
  { q: 'Can the AI diagnose me?', a: 'No, and it is designed not to. Summaries are informational only — always discuss them with your doctor.' },
  { q: 'Is MedRec free?', a: 'Yes — records, AI summaries, appointments and timeline are free for patients and doctors.' },
]

export default function Landing() {
  const { user } = useAuth()
  const [openFaq, setOpenFaq] = useState(null)
  const dashboard = user ? (user.role === 'doctor' ? '/doctor' : '/patient') : null

  return (
    <div>
      {/* HERO */}
      <header>
        <div className="hero-grid">
          <div>
            <span className="hero-badge"><span className="hero-badge-dot">✦</span> Free for patients & doctors</span>
            <h1 className="hero-h1">Your medical records, <span className="accent">finally organized.</span></h1>
            <p className="hero-sub">
              Patients keep every report and prescription in one place.
              Doctors review assigned patients in one click.
              AI explains it all in plain words.
            </p>
            <div className="hero-actions">
              {user ? (
                <Link to={dashboard} className="btn-hero-primary">Go to my Dashboard →</Link>
              ) : (
                <>
                  <Link to="/login" className="btn-hero-primary">Get started free →</Link>
                  <Link to="/login" className="btn-hero-secondary">Find doctors</Link>
                </>
              )}
            </div>
            <div className="hero-proof">
              <span className="hero-proof-item">✓ No credit card</span>
              <span className="hero-proof-item">✓ 8 languages</span>
              <span className="hero-proof-item">✓ Private by design</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-visual-card">
              <div className="hero-photo">
                <PhotoFrame src={PHOTOS.heroDoctor} alt="Doctor reviewing records on a tablet" style={{ border: 0, height: '100%' }} />
              </div>
              {/* Product preview — what MedRec actually does with your uploads */}
              <div className="hero-mock" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <b>✦ AI summary — your lab report</b><span className="pill pill-ok">plain words</span>
                </div>
                <p style={{ fontSize: 13.5, color: '#344054', margin: '8px 0 0', lineHeight: 1.6 }}>
                  Hemoglobin slightly low — add iron-rich foods, recheck in 4 weeks.
                  Everything else looks normal.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <span className="pill pill-info">🗂️ Auto-organized by visit</span>
                   <span className="pill pill-info">🌐 8 languages</span>
                </div>
              </div>
              <div className="hero-mock" style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <span><b style={{ fontSize: 19 }}>24</b><br /><small style={{ color: '#667085' }}>Reports kept</small></span>
                  <span><b style={{ fontSize: 19 }}>6</b><br /><small style={{ color: '#667085' }}>Prescriptions</small></span>
                  <span><b style={{ fontSize: 19 }}>1</b><br /><small style={{ color: '#667085' }}>Health timeline</small></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* FEATURES */}
      <section className="landing-section">
        <p className="kicker">Everything in one place</p>
        <h2 className="h2-min">What you can do with MedRec</h2>
        <p className="sub-min">Twelve essentials, zero clutter. Built for real clinic workflows.</p>
        <div className="feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feat-card">
              <span className="tile">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PHOTO BAND */}
      <section style={{ position: 'relative', minHeight: 320, display: 'flex', alignItems: 'center', overflow: 'hidden', background: '#101828', borderRadius: 24, margin: '0 clamp(14px,3vw,28px)', maxWidth: 1280 - 56 }}>
        <PhotoFrame src={PHOTOS.careTeam} alt="Medical team" style={{ position: 'absolute', inset: 0 }} />
        <div className="band-overlay" style={{ borderRadius: 24 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, letterSpacing: '-0.03em' }}>Care, connected.</h2>
          <p style={{ margin: '0 0 18px', color: '#e8eef5', fontSize: 'clamp(15px,2vw,17px)' }}>Patients, doctors and families — finally looking at the same record.</p>
          {!user && <Link to="/login" className="btn-hero-primary" style={{ background: '#fff', color: '#101828', borderColor: '#fff' }}>Join with Google →</Link>}
        </div>
      </section>

      {/* STEPS */}
      <section className="landing-section">
        <p className="kicker">Get started in minutes</p>
        <h2 className="h2-min">How it works</h2>
        <p className="sub-min">Four steps and your health history is organized forever.</p>
        <div className="steps-min">
          {STEPS.map((st) => (
            <div key={st.n} className="step-min">
              <div className="step-n">{st.n}</div>
              <div><b>{st.title}</b><p style={{ margin: '6px 0 0', color: '#667085', fontSize: 14 }}>{st.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="landing-section" style={{ paddingTop: 0 }}>
        <p className="kicker">Good to know</p>
        <h2 className="h2-min">Frequently asked questions</h2>
        <div className="faq-grid">
          {FAQS.map((f, i) => (
            <div key={f.q} className="faq-min">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q} <span style={{ background: '#f1f4f8', borderRadius: '50%', minWidth: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p style={{ margin: 0, padding: '0 18px 16px', color: '#667085', fontSize: 14 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="cta-card">
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2>Stop losing prescriptions in drawers.</h2>
            <p>Join MedRec free — your health history, organized forever.</p>
            {!user && <Link to="/login" className="cta-white-btn">Get started with Google →</Link>}
          </div>
        </div>
      </section>
    </div>
  )
}
