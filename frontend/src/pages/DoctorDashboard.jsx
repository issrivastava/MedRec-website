import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { DocumentPdfButton, ExportRecordButton, SummaryDownloadButton } from '../components/PdfButtons'
import { useAuth } from '../context/AuthContext'
import { LANGS } from '../langs'
import { Avatar } from '../components/People'
import DashboardLayout from '../components/DashboardLayout'
import { kindsForCategory, kindLabel, kindIcon } from '../reportKinds'
import { calcAge, shortId } from '../utils'
import VisitNotes from '../components/VisitNotes'
import Appointments from '../components/Appointments'
import { SPECIALIZATIONS } from '../specializations'
import { LabRanges } from '../components/Alerts'
import { MyReviews } from '../components/Reviews'
import { EmergencyInbox } from '../components/EmergencyButton'
import VitalsTracker from '../components/VitalsTracker'
import VaccinationTracker from '../components/VaccinationTracker'
import ChatBox from '../components/ChatBox'
import CompareReports from '../components/CompareReports'
import RiskDashboard from '../components/RiskDashboard'
import { RxTemplates, ReferralBox, VoiceReader } from '../components/CareTools'
import { DocAIActions } from '../components/SmartUpload'

export default function DoctorDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [patients, setPatients] = useState([])
  const [selected, setSelected] = useState('')
  const [info, setInfo] = useState(null)
  const [docs, setDocs] = useState([])
  const [alerts, setAlerts] = useState([])
  const [summary, setSummary] = useState(null)
  const [addEmail, setAddEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [lang, setLang] = useState('en')
  const [appts, setAppts] = useState([])
  const [noteCount, setNoteCount] = useState(0)
  const [emgCount, setEmgCount] = useState(0)
  const [sosMsg, setSosMsg] = useState('')
  const [sosFeedback, setSosFeedback] = useState('')
  const [kindFilter, setKindFilter] = useState({ category: '', report_kind: '' })

  const loadBase = async () => {
    const [{ data: p }, { data: list }] = await Promise.all([
      api.get('/api/doctors/me'),
      api.get('/api/doctors/patients'),
    ])
    setProfile(p); setPatients(list)
    if (list.length && !selected) setSelected(list[0].patient_id)
    const { data: a } = await api.get('/api/scheduling/appointments/my').catch(() => ({ data: [] }))
    setAppts(a)
    const { data: emg } = await api.get('/api/emergency/assigned').catch(() => ({ data: [] }))
    setEmgCount(emg.filter((x) => x.status === 'active').length)
    const counts = await Promise.all(
      list.map((x) => api.get(`/api/visits/patient/${x.patient_id}`).then((r) => r.data.length).catch(() => 0))
    )
    setNoteCount(counts.reduce((t, n) => t + n, 0))
  }

  useEffect(() => { loadBase().catch(console.error) }, [])

  useEffect(() => {
    if (!selected) return
    const params = {}
    if (kindFilter.category) params.category = kindFilter.category
    if (kindFilter.report_kind) params.report_kind = kindFilter.report_kind
    Promise.all([
      api.get(`/api/doctors/patients/${selected}/info`),
      api.get(`/api/doctors/patients/${selected}/documents`, { params }),
      api.get(`/api/labs/patients/${selected}/alerts`).catch(() => ({ data: [] })),
    ]).then(([{ data: i }, { data: d }, { data: a }]) => { setInfo(i); setDocs(d); setAlerts(a) }).catch(console.error)
  }, [selected, patients, kindFilter])

  const saveProfile = async () => {
    await api.put('/api/doctors/me', profile)
    setMsg('Profile saved')
  }

  const addPatient = async (e) => {
    e.preventDefault()
    await api.post('/api/assignments', { email: addEmail })
    setAddEmail(''); loadBase()
  }

  const summarize = async (id) => {
    setSummary({ loading: true })
    try {
      const { data } = await api.post(`/api/documents/${id}/summarize`, null, { params: { language: lang } })
      setSummary(data)
    } catch (err) {
      setSummary({ error: err.response?.data?.detail || 'Could not generate summary.' })
    }
  }

  const raiseSosForPatient = async (e) => {
    e.preventDefault()
    setSosFeedback('')
    if (!selected) { setSosFeedback('Select a patient in the Patients tab first.'); return }
    try {
      await api.post('/api/emergency/alert', { message: sosMsg || null, patient_id: selected })
      setSosFeedback(`🚨 SOS raised for ${selName} — patient, emergency contact and fellow doctors notified.`)
      setSosMsg('')
      const { data: emg } = await api.get('/api/emergency/assigned').catch(() => ({ data: [] }))
      setEmgCount(emg.filter((x) => x.status === 'active').length)
    } catch (err) {
      setSosFeedback(err.response?.data?.detail || 'Could not raise SOS')
    }
  }

  const booked = appts.filter((a) => a.status === 'booked')
  const today = new Date().toISOString().slice(0, 10)
  const todays = booked.filter((a) => a.date === today)
  const firstName = user?.full_name ? user.full_name.split(' ')[0] : ''
  const selName = (patients.find((p) => p.patient_id === selected) || {}).patient_name || 'patient'

  const items = [
    { key: 'overview', label: 'Overview', icon: '🏠' },
    { key: 'emergency', label: 'Emergency', icon: '🚨', badge: emgCount },
    { key: 'patients', label: 'Patients', icon: '🧑‍🤝‍🧑', badge: patients.length },
    { key: 'risk', label: 'Risk Board', icon: '🔥' },
    { key: 'rx', label: 'Prescriptions', icon: '✍️' },
    { key: 'schedule', label: 'Schedule', icon: '📅', badge: booked.length },
    { key: 'alerts', label: 'Lab Alerts', icon: '⚠️', badge: alerts.filter((a) => !a.acknowledged).length },
    { key: 'chat', label: 'Chat', icon: '💬' },
    { key: 'care', label: 'Referrals', icon: '🔁' },
    { key: 'medicines', label: 'Medicine Description', icon: '💊', to: '/medicines' },
    { key: 'illnesses', label: 'Illness Description', icon: '🩺', to: '/illnesses' },
    { key: 'askai', label: 'Ask AI', icon: '🤖', to: '/ask-ai' },
    { key: 'reviews', label: 'My Reviews', icon: '⭐' },
  ]

  return (
    <DashboardLayout
      title={`🩺 Welcome back${firstName ? `, Dr. ${firstName}` : ''}`}
      subtitle="Your practice at a glance — patients, schedule, prescriptions and lab alerts."
      items={items} active={tab} onSelect={setTab}>

      {msg && <p style={{ color: 'green' }}>{msg}</p>}

      {tab === 'overview' && (
        <div className="rise">
          <div className="stat-grid">
            <div className="gstat g-blue"><div className="num">{patients.length}</div><div className="lbl">My patients</div><span className="big-icon">🧑‍🤝‍🧑</span></div>
            <div className="gstat g-teal"><div className="num">{booked.length}</div><div className="lbl">Booked visits</div><span className="big-icon">📅</span></div>
            <div className="gstat g-violet"><div className="num">{noteCount}</div><div className="lbl">Notes written</div><span className="big-icon">💊</span></div>
            <div className="gstat g-rose"><div className="num">{alerts.filter((a) => !a.acknowledged).length}</div><div className="lbl">Open alerts</div><span className="big-icon">⚠️</span></div>
          </div>
          <div className="cols-2">
            <section style={{ ...s.card, ...s.tintTeal }}>
              <h3 className="sec-head"><span className="tile t-teal">📅</span> Today's Schedule</h3>
              {todays.map((a) => (
                <div key={a.id} style={s.row}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar seed={a.patient_id} name={a.patient_name} size={34} />
                    <span><b>{a.start_time}</b> — {a.patient_name}{a.reason ? ` · ${a.reason}` : ''}</span>
                  </span>
                  <span className="pill pill-info">{a.status}</span>
                </div>
              ))}
              {!todays.length && <div className="empty">No appointments today. Enjoy the breather! ☕</div>}
              <div style={{ marginTop: 10 }}><button onClick={() => setTab('schedule')}>Manage schedule →</button></div>
            </section>
            <section style={{ ...s.card, ...s.tintOrange }}>
              <h3 className="sec-head"><span className="tile t-orange">👤</span> My Profile</h3>
              {profile && (
                <div style={s.grid}>
                  <select value={profile.specialization || ''} onChange={(e) => setProfile({ ...profile, specialization: e.target.value })} style={{ ...s.input, width: '100%', maxWidth: '100%' }} aria-label="Specialization">
                    <option value="">Select specialization…</option>
                    {SPECIALIZATIONS.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                  <input placeholder="License No" value={profile.license_no || ''} onChange={(e) => setProfile({ ...profile, license_no: e.target.value })} style={s.input} />
                  <input placeholder="Hospital" value={profile.hospital || ''} onChange={(e) => setProfile({ ...profile, hospital: e.target.value })} style={s.input} />
                  <input placeholder="Phone" value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} style={s.input} />
                </div>
              )}
              <div style={{ marginTop: 8 }}><button onClick={saveProfile} style={s.primaryBtn}>Save</button></div>
            </section>
          </div>
        </div>
      )}

      {tab === 'emergency' && (
        <div className="rise">
          <section style={{ ...s.card, ...s.tintRose }}>
            <h3 className="sec-head"><span className="tile t-rose">🆘</span> Raise SOS for a patient</h3>
            {!selected
              ? <div className="empty">Select a patient in the Patients tab first, then raise an SOS here.</div>
              : (
                <form onSubmit={raiseSosForPatient} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Raising for: <b>{selName}</b></span>
                  <input placeholder="What is happening? (optional)" value={sosMsg} onChange={(e) => setSosMsg(e.target.value)} style={{ ...s.input, flex: 1, minWidth: 220 }} />
                  <button type="submit" style={s.sosBtn}>🚨 Raise SOS</button>
                </form>
              )}
            {sosFeedback && <p style={{ color: sosFeedback.startsWith('🚨') ? 'green' : 'red' }}>{sosFeedback}</p>}
          </section>
          <section style={{ ...s.card, ...s.tintRose }}>
            <h3 className="sec-head"><span className="tile t-rose">🚨</span> Patient SOS Alerts</h3>
            <EmergencyInbox refreshKey={tab} />
          </section>
        </div>
      )}

      {tab === 'patients' && (
        <div className="rise">
          <section style={{ ...s.card, ...s.tintBlue }}>
            <h3 className="sec-head"><span className="tile t-blue">🧑‍🤝‍🧑</span> Assigned Patients</h3>
            <form onSubmit={addPatient} className="inline-form">
              <input placeholder="Patient email to add" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} style={s.input} />
              <button style={s.primaryBtn}>Link patient</button>
            </form>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ ...s.input, minWidth: 'min(300px,100%)', maxWidth: '100%' }}>
              <option value="">— Select patient —</option>
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_email})</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {patients.map((p) => (
                <div key={p.patient_id} style={{ ...s.patCard, borderColor: selected === p.patient_id ? '#1e3a5f' : '#e7e5e4' }}>
                  <button onClick={() => setSelected(p.patient_id)}
                    title={selected === p.patient_id ? 'Selected — write notes below' : 'Select for writing notes'}
                    style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'none', border: 0, cursor: 'pointer', padding: 0, textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <Avatar seed={p.patient_id} name={p.patient_name} size={40} />
                    <span style={{ textAlign: 'left' }}><b>{p.patient_name}</b><br /><small style={{ color: '#5d6b7a' }}>{p.patient_email}</small></span>
                  </button>
                  <Link to={`/doctor/patients/${p.patient_id}`} title="Open prescriptions, reports, vitals, vaccines, chat and more">
                    <button>📂 Records</button>
                  </Link>
                </div>
              ))}
            </div>
            <label style={{ marginLeft: 12 }}>AI language: <select value={lang} onChange={(e) => setLang(e.target.value)} style={s.input}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select></label>
            {selected && <span style={{ marginLeft: 8, display: 'inline-block', verticalAlign: 'middle' }}><ExportRecordButton patientId={selected} label="⬇ Export patient PDF" /></span>}
          </section>

          {info && (
            <div className="cols-2" style={{ alignItems: 'start' }}>
              <section style={{ ...s.card, ...s.tintGreen }}>
                <h3 className="sec-head"><span className="tile t-green">🧍</span> {info.user.full_name}
                  <Link to={`/doctor/patients/${selected}`} title="Open prescriptions, reports, vitals, vaccines, chat and more" style={{ marginLeft: 'auto' }}>
                    <button>📂 Full records</button>
                  </Link>
                </h3>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 8 }}>
                  <Avatar seed={info.user.id} name={info.user.full_name} size={56} />
                  <p style={{ margin: 0 }}>Email: {info.user.email}<br />🩸 {info.profile?.blood_group || '—'} | 🎂 {info.profile?.dob || '—'}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span className="pill pill-info" title={info.user.id}>🪪 Patient ID: {info.user.health_id || shortId(info.user.id)}</span>
                  <span className="pill pill-ok">🎂 Age: {(() => { const a = calcAge(info.profile?.dob); return a != null ? `${a} yrs` : '—' })()}</span>
                  {info.profile?.gender && <span className="pill pill-ok">👤 {info.profile.gender}</span>}
                </div>
                <p>Allergies: {info.profile?.allergies || '—'} | Chronic: {info.profile?.chronic_conditions || '—'}</p>
                <p>Emergency: {info.profile?.emergency_contact || '—'} | Phone: {info.profile?.phone || '—'}</p>
                <details style={s.historyBox}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>📋 Clinical history (written by patient)</summary>
                  <ClinicalHistoryRead profile={info.profile} />
                </details>
              </section>
              <section style={{ ...s.card, ...s.tintAmber }}>
                <h3 className="sec-head"><span className="tile t-amber">🗂️</span> Records ({docs.length})</h3>
                <div className="toolbar-row">
                  <select value={kindFilter.category} onChange={(e) => setKindFilter({ category: e.target.value, report_kind: '' })} style={s.input}>
                    <option value="">All categories</option>
                    <option value="lab">Pathology Lab</option>
                    <option value="imaging">Radiology / Imaging</option>
                    <option value="cardiology">Cardiac</option>
                    <option value="prescription">Prescription & Clinical</option>
                    <option value="other">Other</option>
                  </select>
                  <select value={kindFilter.report_kind} onChange={(e) => setKindFilter((f) => ({ ...f, report_kind: e.target.value }))} style={s.input}>
                    <option value="">All kinds (X-Ray, CBC, MRI, TSH, LFT…)</option>
                    {kindsForCategory(kindFilter.category).map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
                  </select>
                </div>
                {docs.slice(0, 8).map((d) => (
                  <div key={d.id} className="doc-row">
                    <span className={`tile ${kindIcon(d.report_kind, ['📄', 't-amber'])[1]}`}>{kindIcon(d.report_kind, ['📄', 't-amber'])[0]}</span>
                    <div className="grow">
                      <b>{d.title}</b> <span className="pill pill-info">{kindLabel(d.report_kind) || d.doc_type}</span>
                      {(d.file_size || 0) === 0
                        ? <span className="pill pill-open" style={{ marginLeft: 6 }}>⚠️ empty file</span>
                        : d.has_text
                          ? <span className="pill pill-ok" style={{ marginLeft: 6 }}>📝 text ready</span>
                          : <span className="pill" style={{ marginLeft: 6, background: '#fef3c7' }}>🖼️ image-only</span>}
                      <div style={{ fontSize: 13, color: '#5d6b7a' }}>{d.visit_date || 'Undated'} — {d.doctor_name || '—'}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <button onClick={() => summarize(d.id)} disabled={(d.file_size || 0) === 0}>AI summary</button>
                        <DocAIActions doc={d} canApply={false} />
                        <DocumentPdfButton doc={d} />
                      </div>
                    </div>
                  </div>
                ))}
                {!docs.length && <div className="empty">No records for this patient yet.</div>}
                {summary && (
                  <div style={s.summary}>
                    <b>AI report ({summary.model_used || ''}, {summary.language || lang}):</b>
                    {!summary.loading && summary.summary_text && <VoiceReader text={summary.summary_text} />}
                    {summary.loading ? <p>Generating… (~10–30s first run)</p>
                      : summary.error ? <p style={{ color: '#b91c1c' }}>⚠️ {summary.error}</p>
                        : <><p style={{ whiteSpace: 'pre-wrap' }}>{summary.summary_text}</p><SummaryDownloadButton title="MedRec summary" text={summary.summary_text} /></>}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {tab === 'rx' && (
        <div className="rise">
          <section style={{ ...s.card, ...s.tintViolet }}>
            <h3 className="sec-head"><span className="tile t-violet">📋</span> My Rx Templates (reusable + signed PDF)</h3>
            <RxTemplates />
          </section>
          <section style={{ ...s.card, ...s.tintViolet }}>
            <h3 className="sec-head"><span className="tile t-violet">✍️</span> Write E-Prescription / Visit Note</h3>
            {!selected && <div className="empty">Select a patient in the Patients tab first.</div>}
            {selected && <p>Writing for: <b>{selName}</b></p>}
            {selected && <VisitNotes role="doctor" patientId={selected} />}
          </section>
        </div>
      )}

      {tab === 'schedule' && (
        <section style={{ ...s.card, ...s.tintTeal }} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">📅</span> Availability & Appointments</h3>
          <Appointments role="doctor" />
        </section>
      )}

      {tab === 'alerts' && (
        <section style={{ ...s.card, ...s.tintRose }} className="rise">
          <h3 className="sec-head"><span className="tile t-rose">⚠️</span> Lab Alerts {selected ? `— ${selName}` : ''}</h3>
          {!selected && <div className="empty">Select a patient in the Patients tab first.</div>}
          {selected && alerts.map((a) => (
            <div key={a.id} style={s.alert}><b>{a.test_name}: {a.value} {a.unit || ''} ({a.flag})</b> — {a.message}</div>
          ))}
          {selected && !alerts.length && <p>No alerts for this patient. 🎉</p>}
          {selected && <div style={{ marginTop: 12 }}><LabRanges patientId={selected} /></div>}
        </section>
      )}
      {tab === 'reviews' && (
        <section style={{ ...s.card, ...s.tintAmber }} className="rise">
          <h3 className="sec-head"><span className="tile t-amber">⭐</span> My Reviews</h3>
          <MyReviews role="doctor" />
        </section>
      )}
      {tab === 'risk' && (
        <section style={{ ...s.card, ...s.tintRose }} className="rise">
          <h3 className="sec-head"><span className="tile t-rose">🔥</span> Patient Risk Board</h3>
          <RiskDashboard />
        </section>
      )}
      {tab === 'chat' && (
        <section style={{ ...s.card, ...s.tintTeal }} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">💬</span> Patient Chat</h3>
          {!selected && <p style={{ color: '#64748b' }}>Select a patient in Patients tab, or pick from inbox.</p>}
          <ChatBox role="doctor" patientId={selected} patients={patients} />
        </section>
      )}
      {tab === 'care' && (
        <div className="rise">
          <section style={{ ...s.card, ...s.tintBlue }}>
            <h3 className="sec-head"><span className="tile t-blue">🔁</span> Referrals</h3>
            <ReferralBox role="doctor" patientId={selected} />
          </section>
          {selected && (
            <section style={{ ...s.card, ...s.tintRose }}>
              <h3 className="sec-head"><span className="tile t-rose">❤️</span> Vitals — {selName}</h3>
              <VitalsTracker role="doctor" patientId={selected} />
            </section>
          )}
          {selected && (
            <section style={{ ...s.card, ...s.tintViolet }}>
              <h3 className="sec-head"><span className="tile t-violet">💉</span> Vaccinations — {selName}</h3>
              <VaccinationTracker role="doctor" patientId={selected} />
            </section>
          )}
          {selected && (
            <section style={{ ...s.card, ...s.tintTeal }}>
              <h3 className="sec-head"><span className="tile t-teal">🔄</span> What Changed — {selName}</h3>
              <CompareReports docs={docs} patientId={selected} />
            </section>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}

/* Read-only view of the patient's self-written clinical history. */
function ClinicalHistoryRead({ profile }) {
  if (!profile) return <p style={{ color: '#5d6b7a' }}>No clinical history written yet.</p>
  const rows = [
    ['Height / weight', [profile.height_cm && `${profile.height_cm} cm`, profile.weight_kg && `${profile.weight_kg} kg`].filter(Boolean).join(' · ')],
    ['Background', [profile.marital_status, profile.occupation].filter(Boolean).join(' · ')],
    ['Habits', [profile.smoking_status && `Smoking: ${profile.smoking_status}`, profile.alcohol_use && `Alcohol: ${profile.alcohol_use}`, profile.diet, profile.activity_level && `Activity: ${profile.activity_level}`].filter(Boolean).join(' · ')],
    ['Past illnesses', profile.past_illnesses],
    ['Surgeries / hospitalizations', profile.surgeries],
    ['Current medications', profile.current_medications],
    ['Immunizations', profile.immunizations],
    ['Family history', profile.family_history_text],
    ['Menstrual / obstetric', profile.menstrual_history],
    ['Mental health / lifestyle', profile.mental_health],
  ].filter(([, v]) => v)
  if (!rows.length) return <p style={{ color: '#5d6b7a' }}>No clinical history written yet.</p>
  return (
    <div style={{ marginTop: 8 }}>
      {rows.map(([k, v]) => (
        <p key={k} style={{ margin: '4px 0', fontSize: 14 }}><b>{k}:</b> {v}</p>
      ))}
    </div>
  )
}

const s = {  card: { border: '1px solid #e9edf2', borderRadius: 18, padding: 'clamp(12px,3vw,18px)', marginBottom: 0, background: '#fff', boxShadow: '0 1px 3px rgba(16,24,40,.06)', minWidth: 0 },
  /* Home-theme washes — spread over s.card so sections stop looking all-white. */
  tintTeal: { background: 'linear-gradient(180deg,#f0fdfa 0%,#ffffff 62%)', borderColor: '#bfe6e0' },
  tintBlue: { background: 'linear-gradient(180deg,#eff6ff 0%,#ffffff 62%)', borderColor: '#bfdbfe' },
  tintViolet: { background: 'linear-gradient(180deg,#f5f3ff 0%,#ffffff 62%)', borderColor: '#ddd6fe' },
  tintRose: { background: 'linear-gradient(180deg,#fef2f2 0%,#ffffff 62%)', borderColor: '#fecaca' },
  tintAmber: { background: 'linear-gradient(180deg,#fffbeb 0%,#ffffff 62%)', borderColor: '#fde68a' },
  tintGreen: { background: 'linear-gradient(180deg,#f0fdf4 0%,#ffffff 62%)', borderColor: '#bbf7d0' },
  tintOrange: { background: 'linear-gradient(180deg,#fff7ed 0%,#ffffff 62%)', borderColor: '#fed7aa' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 8, marginBottom: 8 },
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  patCard: { display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '2px solid #e7e5e4', borderRadius: 14, padding: '8px 14px 8px 8px', cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  doc: { borderBottom: '1px solid #eee', padding: '8px 0' },
  sosBtn: { padding: '8px 16px', background: '#8b2e3c', color: '#fff', border: '1px solid #6d2330', cursor: 'pointer', fontWeight: 700 },
  alert: { background: '#eef2f7', border: '1px solid #c9d4e2', borderRadius: 8, padding: 8, marginBottom: 6 },
  summary: { background: '#eef2f7', border: '1px solid #c9d4e2', padding: 12, borderRadius: 8, marginTop: 10 },
  historyBox: { background: '#f8f9fa', border: '1px solid #dfe3e8', borderRadius: 8, padding: 10, marginTop: 8 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
}
