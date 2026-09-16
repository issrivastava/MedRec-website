import { useEffect, useState } from 'react'
import api, { downloadDocument, downloadExportPdf } from '../api'
import { useAuth } from '../context/AuthContext'
import { LANGS } from '../langs'
import { Avatar } from '../components/People'
import DashboardLayout from '../components/DashboardLayout'
import VisitNotes from '../components/VisitNotes'
import Appointments from '../components/Appointments'
import { LabRanges } from '../components/Alerts'
import { DoctorReviews } from '../components/Reviews'

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
  const [myRating, setMyRating] = useState(null)

  const loadBase = async () => {
    const [{ data: p }, { data: list }] = await Promise.all([
      api.get('/api/doctors/me'),
      api.get('/api/doctors/patients'),
    ])
    setProfile(p); setPatients(list)
    if (list.length && !selected) setSelected(list[0].patient_id)
    const { data: a } = await api.get('/api/scheduling/appointments/my').catch(() => ({ data: [] }))
    setAppts(a)
    const { data: rt } = await api.get(`/api/reviews/doctor/${user.id}/rating`).catch(() => ({ data: null }))
    setMyRating(rt)
    const counts = await Promise.all(
      list.map((x) => api.get(`/api/visits/patient/${x.patient_id}`).then((r) => r.data.length).catch(() => 0))
    )
    setNoteCount(counts.reduce((t, n) => t + n, 0))
  }

  useEffect(() => { loadBase().catch(console.error) }, [])

  useEffect(() => {
    if (!selected) return
    Promise.all([
      api.get(`/api/doctors/patients/${selected}/info`),
      api.get(`/api/doctors/patients/${selected}/documents`),
      api.get(`/api/labs/patients/${selected}/alerts`).catch(() => ({ data: [] })),
    ]).then(([{ data: i }, { data: d }, { data: a }]) => { setInfo(i); setDocs(d); setAlerts(a) }).catch(console.error)
  }, [selected, patients])

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
    const { data } = await api.post(`/api/documents/${id}/summarize`, null, { params: { language: lang } })
    setSummary(data)
  }

  const booked = appts.filter((a) => a.status === 'booked')
  const today = new Date().toISOString().slice(0, 10)
  const todays = booked.filter((a) => a.date === today)
  const firstName = user?.full_name ? user.full_name.split(' ')[0] : ''
  const selName = (patients.find((p) => p.patient_id === selected) || {}).patient_name || 'patient'

  const items = [
    { key: 'overview', label: 'Overview', icon: '🏠' },
    { key: 'patients', label: 'Patients', icon: '🧑‍🤝‍🧑', badge: patients.length },
    { key: 'rx', label: 'Prescriptions', icon: '✍️' },
    { key: 'schedule', label: 'Schedule', icon: '📅', badge: booked.length },
    { key: 'alerts', label: 'Lab Alerts', icon: '⚠️', badge: alerts.filter((a) => !a.acknowledged).length },
    { key: 'reviews', label: 'Reviews', icon: '⭐' },
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
            <div className="gstat g-amber"><div className="num">{myRating?.average ?? '—'}</div><div className="lbl">My rating ({myRating?.count || 0})</div><span className="big-icon">⭐</span></div>
          </div>
          <div className="cols-2">
            <section style={s.card}>
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
            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-orange">👤</span> My Profile</h3>
              {profile && (
                <div style={s.grid}>
                  <input placeholder="Specialization" value={profile.specialization || ''} onChange={(e) => setProfile({ ...profile, specialization: e.target.value })} style={s.input} />
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

      {tab === 'patients' && (
        <div className="rise">
          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-blue">🧑‍🤝‍🧑</span> Assigned Patients</h3>
            <form onSubmit={addPatient} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input placeholder="Patient email to add" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} style={s.input} />
              <button style={s.primaryBtn}>Link patient</button>
            </form>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ ...s.input, minWidth: 300 }}>
              <option value="">— Select patient —</option>
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_email})</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {patients.map((p) => (
                <button key={p.patient_id} onClick={() => setSelected(p.patient_id)}
                  style={{ ...s.patCard, borderColor: selected === p.patient_id ? '#0f766e' : '#e7e5e4' }}>
                  <Avatar seed={p.patient_id} name={p.patient_name} size={40} />
                  <span style={{ textAlign: 'left' }}><b>{p.patient_name}</b><br /><small style={{ color: '#5f6f6a' }}>{p.patient_email}</small></span>
                </button>
              ))}
            </div>
            <label style={{ marginLeft: 12 }}>AI language: <select value={lang} onChange={(e) => setLang(e.target.value)} style={s.input}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select></label>
            {selected && <button onClick={() => downloadExportPdf(selected)} style={{ marginLeft: 8 }}>⬇ Export patient PDF</button>}
          </section>

          {info && (
            <div className="cols-2" style={{ alignItems: 'start' }}>
              <section style={s.card}>
                <h3 className="sec-head"><span className="tile t-green">🧍</span> {info.user.full_name}</h3>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 8 }}>
                  <Avatar seed={info.user.id} name={info.user.full_name} size={56} />
                  <p style={{ margin: 0 }}>Email: {info.user.email}<br />🩸 {info.profile?.blood_group || '—'} | 🎂 {info.profile?.dob || '—'}</p>
                </div>
                <p>Allergies: {info.profile?.allergies || '—'} | Chronic: {info.profile?.chronic_conditions || '—'}</p>
                <p>Emergency: {info.profile?.emergency_contact || '—'} | Phone: {info.profile?.phone || '—'}</p>
              </section>
              <section style={s.card}>
                <h3 className="sec-head"><span className="tile t-amber">🗂️</span> Records ({docs.length})</h3>
                {docs.slice(0, 5).map((d) => (
                  <div key={d.id} className="doc-row">
                    <span className="tile t-amber">📄</span>
                    <div className="grow">
                      <b>{d.title}</b> <span className="pill pill-info">{d.doc_type}</span>
                      <div style={{ fontSize: 13, color: '#5f6f6a' }}>{d.visit_date || 'Undated'} — {d.doctor_name || '—'}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button onClick={() => summarize(d.id)}>AI summary</button>
                        <button onClick={() => downloadDocument(d.id, d.title)}>View</button>
                      </div>
                    </div>
                  </div>
                ))}
                {!docs.length && <div className="empty">No records for this patient yet.</div>}
                {summary && (
                  <div style={s.summary}>
                    <b>AI report ({summary.model_used || ''}, {summary.language || lang}):</b>
                    {summary.loading ? <p>Generating…</p> : <p style={{ whiteSpace: 'pre-wrap' }}>{summary.summary_text}</p>}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {tab === 'rx' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-violet">✍️</span> Write E-Prescription / Visit Note</h3>
          {!selected && <div className="empty">Select a patient in the Patients tab first.</div>}
          {selected && <p>Writing for: <b>{selName}</b></p>}
          {selected && <VisitNotes role="doctor" patientId={selected} />}
        </section>
      )}

      {tab === 'schedule' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">📅</span> Availability & Appointments</h3>
          <Appointments role="doctor" />
        </section>
      )}

      {tab === 'alerts' && (
        <section style={s.card} className="rise">
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
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-amber">⭐</span> Patient Reviews</h3>
          <DoctorReviews doctorId={user.id} refreshKey={tab} />
        </section>
      )}
    </DashboardLayout>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #0f766e', borderRadius: 12, padding: 18, marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 },
  input: { padding: 8, fontSize: 14 },
  patCard: { display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '2px solid #e7e5e4', borderRadius: 14, padding: '8px 14px 8px 8px', cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', background: 'linear-gradient(90deg,#14b8a6,#0f766e)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  doc: { borderBottom: '1px solid #eee', padding: '8px 0' },
  alert: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: 8, marginBottom: 6 },
  summary: { background: '#f0fdfa', border: '1px solid #99f6e4', padding: 12, borderRadius: 8, marginTop: 10 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
}
