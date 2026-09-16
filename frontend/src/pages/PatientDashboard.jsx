import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { downloadDocument, downloadExportPdf } from '../api'
import { useAuth } from '../context/AuthContext'
import { LANGS } from '../langs'
import { Avatar } from '../components/People'
import DashboardLayout from '../components/DashboardLayout'
import VisitNotes from '../components/VisitNotes'
import Appointments from '../components/Appointments'
import FamilyManager from '../components/FamilyManager'
import { AlertsPanel } from '../components/Alerts'
import { PatientReviews } from '../components/Reviews'

export default function PatientDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [docs, setDocs] = useState([])
  const [filter, setFilter] = useState({ q: '', doctor_name: '', doc_type: '', group_by: 'date', member: '' })
  const [upload, setUpload] = useState({ title: '', doc_type: 'report', doctor_name: '', hospital: '', visit_date: '', notes: '', family_member_id: '' })
  const [file, setFile] = useState(null)
  const [summary, setSummary] = useState(null)
  const [overall, setOverall] = useState(null)
  const [links, setLinks] = useState([])
  const [linkEmail, setLinkEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [lang, setLang] = useState('en')
  const [family, setFamily] = useState([])
  const [stats, setStats] = useState({ appts: [], alerts: 0, notes: 0 })

  const load = async () => {
    const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
      api.get('/api/patients/me'),
      api.get('/api/documents', { params: { group_by: filter.group_by === 'doctor' ? 'doctor' : 'date' } }),
      api.get('/api/assignments/my'),
      api.get('/api/family').catch(() => ({ data: [] })),
    ])
    setProfile(p); setDocs(d); setLinks(l); setFamily(f)
    const [{ data: a }, { data: al }, { data: n }] = await Promise.all([
      api.get('/api/scheduling/appointments/my').catch(() => ({ data: [] })),
      api.get('/api/labs/alerts/my').catch(() => ({ data: [] })),
      api.get('/api/visits/my').catch(() => ({ data: [] })),
    ])
    setStats({ appts: a, alerts: al.filter((x) => !x.acknowledged).length, notes: n.length })
  }

  useEffect(() => { load().catch(console.error) }, [])

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (filter.q && !(d.title + (d.hospital || '') + (d.notes || '')).toLowerCase().includes(filter.q.toLowerCase())) return false
      if (filter.doctor_name && !(d.doctor_name || '').toLowerCase().includes(filter.doctor_name.toLowerCase())) return false
      if (filter.doc_type && d.doc_type !== filter.doc_type) return false
      if (filter.member === 'mine' && d.family_member_id) return false
      if (filter.member && filter.member !== 'mine' && d.family_member_id !== filter.member) return false
      return true
    })
  }, [docs, filter])

  const grouped = useMemo(() => {
    if (filter.group_by === 'doctor') {
      const g = {}
      filtered.forEach((d) => { const k = d.doctor_name || 'Unknown doctor'; (g[k] ||= []).push(d) })
      return g
    }
    const g = {}
    filtered.forEach((d) => { const k = d.visit_date ? d.visit_date.slice(0, 7) : 'Undated'; (g[k] ||= []).push(d) })
    return Object.fromEntries(Object.entries(g).sort().reverse())
  }, [filtered, filter.group_by])

  const memberName = (id) => (family.find((m) => m.id === id) || {}).name
  const typeIcon = { report: ['📄', 't-blue'], prescription: ['🧾', 't-violet'], lab: ['🧪', 't-teal'], scan: ['🩻', 't-amber'], other: ['📁', 't-orange'] }
  const upcoming = stats.appts.filter((a) => a.status === 'booked')
  const firstName = user?.full_name ? user.full_name.split(' ')[0] : ''

  const saveProfile = async () => {
    await api.put('/api/patients/me', profile)
    setMsg('Profile saved')
  }

  const doUpload = async (e) => {
    e.preventDefault()
    if (!file) return setMsg('Choose a file (scan/photo/PDF)')
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(upload).forEach(([k, v]) => { if (v) fd.append(k, v) })
    if (!upload.title) return setMsg('Title is required')
    await api.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    setMsg('Uploaded — lab values auto-checked for alerts')
    setFile(null); setUpload({ title: '', doc_type: 'report', doctor_name: '', hospital: '', visit_date: '', notes: '', family_member_id: '' })
    load()
  }

  const summarize = async (id) => {
    setSummary({ loading: true })
    const { data } = await api.post(`/api/documents/${id}/summarize`, null, { params: { language: lang } })
    setSummary(data)
  }

  const loadOverall = async () => {
    const { data } = await api.get('/api/documents/patient/overall-summary', { params: { language: lang } })
    setOverall(data)
  }

  const linkDoctor = async (e) => {
    e.preventDefault()
    await api.post('/api/assignments', { email: linkEmail })
    setLinkEmail(''); load()
  }

  const items = [
    { key: 'overview', label: 'Overview', icon: '🏠' },
    { key: 'records', label: 'My Records', icon: '🗂️', badge: docs.length },
    { key: 'rx', label: 'Prescriptions', icon: '💊', badge: stats.notes },
    { key: 'appts', label: 'Appointments', icon: '📅', badge: upcoming.length },
    { key: 'reviews', label: 'Add Your Review', icon: '⭐' },
    { key: 'family', label: 'Family & Info', icon: '👪' },
    { key: 'timeline', label: 'Timeline', icon: '📈', to: '/timeline' },
  ]

  return (
    <DashboardLayout
      title={`👋 Welcome back${firstName ? `, ${firstName}` : ''}`}
      subtitle="Your health command center — records, visits, alerts and family in one place."
      items={items} active={tab} onSelect={setTab}>

      {msg && <p style={{ color: 'green' }}>{msg}</p>}

      {tab === 'overview' && (
        <div className="rise">
          <div className="stat-grid">
            <div className="gstat g-orange"><div className="num">{docs.length}</div><div className="lbl">Documents</div><span className="big-icon">📄</span></div>
            <div className="gstat g-teal"><div className="num">{upcoming.length}</div><div className="lbl">Upcoming visits</div><span className="big-icon">📅</span></div>
            <div className="gstat g-rose"><div className="num">{stats.alerts}</div><div className="lbl">Open alerts</div><span className="big-icon">⚠️</span></div>
            <div className="gstat g-violet"><div className="num">{stats.notes}</div><div className="lbl">Doctor notes</div><span className="big-icon">💊</span></div>
            <div className="gstat g-amber"><div className="num">{family.length}</div><div className="lbl">Family members</div><span className="big-icon">👪</span></div>
          </div>

          <div className="cols-2">
            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-rose">⚠️</span> Health Alerts</h3>
              <AlertsPanel />
            </section>
            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-teal">🔔</span> Coming Up</h3>
              {upcoming.slice(0, 3).map((a) => (
                <div key={a.id} style={s.row}><span><b>{a.date}</b> at {a.start_time} — Dr. {a.doctor_name}</span><span className="pill pill-ok">{a.status}</span></div>
              ))}
              {!upcoming.length && <div className="empty">No upcoming visits — <button onClick={() => setTab('appts')} style={s.linkBtn}>book one</button>.</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={() => setTab('records')} style={s.primaryBtn}>＋ Upload report</button>
                <button onClick={() => downloadExportPdf()}>⬇ Export PDF</button>
                <Link to="/timeline"><button>📈 Timeline</button></Link>
              </div>
            </section>
          </div>

          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-blue">👨‍⚕️</span> My Doctors</h3>
            <form onSubmit={linkDoctor} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input placeholder="Doctor email to link" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} style={s.input} />
              <button style={s.primaryBtn}>Add</button>
            </form>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {links.map((l) => (
                <span key={l.id} style={s.docChip}>
                  <Avatar seed={l.doctor_id} name={l.doctor_name} size={34} />
                  <span><b>Dr. {l.doctor_name}</b><br /><small style={{ color: '#5f6f6a' }}>{l.doctor_email}</small></span>
                </span>
              ))}
              {!links.length && <span style={{ color: '#78716c' }}>No doctors linked yet.</span>}
            </div>
          </section>
        </div>
      )}

      {tab === 'records' && (
        <div className="rise">
          <div className="cols-2" style={{ alignItems: 'start' }}>
            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-orange">📤</span> Scan / Upload</h3>
              <form onSubmit={doUpload} style={s.form}>
                <input placeholder="Title*" value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} style={s.input} />
                <div style={s.grid2}>
                  <select value={upload.doc_type} onChange={(e) => setUpload({ ...upload, doc_type: e.target.value })} style={s.input}>
                    <option value="report">Report</option><option value="prescription">Prescription</option>
                    <option value="lab">Lab</option><option value="scan">Scan</option><option value="other">Other</option>
                  </select>
                  <select value={upload.family_member_id} onChange={(e) => setUpload({ ...upload, family_member_id: e.target.value })} style={s.input}>
                    <option value="">Belongs to: Me</option>
                    {family.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div style={s.grid2}>
                  <input placeholder="Doctor name" value={upload.doctor_name} onChange={(e) => setUpload({ ...upload, doctor_name: e.target.value })} style={s.input} />
                  <input placeholder="Hospital" value={upload.hospital} onChange={(e) => setUpload({ ...upload, hospital: e.target.value })} style={s.input} />
                </div>
                <div style={s.grid2}>
                  <input type="date" value={upload.visit_date} onChange={(e) => setUpload({ ...upload, visit_date: e.target.value })} style={s.input} />
                  <input placeholder="Notes" value={upload.notes} onChange={(e) => setUpload({ ...upload, notes: e.target.value })} style={s.input} />
                </div>
                <input type="file" accept="image/*,.pdf" capture="environment" onChange={(e) => setFile(e.target.files[0])} />
                <button style={s.primaryBtn}>Upload</button>
              </form>
            </section>

            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-violet">🤖</span> AI Health Overview</h3>
              <label>Summary language: <select value={lang} onChange={(e) => setLang(e.target.value)} style={s.input}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select></label>
              <div style={{ marginTop: 8 }}><button onClick={loadOverall} style={s.primaryBtn}>Generate overall summary</button></div>
              {overall && <div style={s.summary}><b>Overall ({overall.model_used}, {overall.documents_used} docs):</b><p style={{ whiteSpace: 'pre-wrap' }}>{overall.summary_text}</p></div>}
              {summary && (
                <div style={s.summary}>
                  <b>AI report ({summary.model_used || ''}, {summary.language || lang}):</b>
                  {summary.loading ? <p>Generating with Ollama…</p> : <p style={{ whiteSpace: 'pre-wrap' }}>{summary.summary_text}</p>}
                </div>
              )}
            </section>
          </div>

          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-amber">🗂️</span> Documents</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input placeholder="Search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={s.input} />
              <input placeholder="Filter by doctor" value={filter.doctor_name} onChange={(e) => setFilter({ ...filter, doctor_name: e.target.value })} style={s.input} />
              <select value={filter.doc_type} onChange={(e) => setFilter({ ...filter, doc_type: e.target.value })} style={s.input}>
                <option value="">All types</option><option value="report">Report</option><option value="prescription">Prescription</option>
                <option value="lab">Lab</option><option value="scan">Scan</option><option value="other">Other</option>
              </select>
              <select value={filter.group_by} onChange={(e) => setFilter({ ...filter, group_by: e.target.value })} style={s.input}>
                <option value="date">Date-wise</option><option value="doctor">Doctor-wise</option>
              </select>
              <select value={filter.member} onChange={(e) => setFilter({ ...filter, member: e.target.value })} style={s.input}>
                <option value="">Everyone</option><option value="mine">Mine only</option>
                {family.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} style={{ marginBottom: 14 }}>
                <h4 style={{ background: '#ccfbf1', padding: 6, borderRadius: 6 }}>{group} ({items.length})</h4>
                {items.map((d) => (
                  <div key={d.id} className="doc-row">
                    <span className={`tile ${(typeIcon[d.doc_type] || typeIcon.other)[1]}`}>{(typeIcon[d.doc_type] || typeIcon.other)[0]}</span>
                    <div className="grow">
                      <b>{d.title}</b> <span className="pill pill-info">{d.doc_type}</span>
                      <div style={{ fontSize: 13, color: '#5f6f6a' }}>{d.visit_date || 'Undated'} — {d.doctor_name || '—'}{d.family_member_id && memberName(d.family_member_id) ? ` · 👪 ${memberName(d.family_member_id)}` : ''}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button onClick={() => summarize(d.id)}>AI summary</button>
                        <button onClick={() => downloadDocument(d.id, d.title)}>View</button>
                        <button onClick={async () => { await api.delete(`/api/documents/${d.id}`); load() }}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!Object.keys(grouped).length && (
              <div className="empty">📭 No documents here yet — scan your first report above to get started.</div>
            )}
          </section>
        </div>
      )}

      {tab === 'rx' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-green">💊</span> Doctor Notes & E-Prescriptions</h3>
          <VisitNotes role="patient" />
        </section>
      )}

      {tab === 'appts' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">📅</span> Appointments</h3>
          <Appointments role="patient" doctors={links} />
        </section>
      )}

      {tab === 'reviews' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-amber">⭐</span> Rate Your Doctors</h3>
          <PatientReviews doctors={links} />
        </section>
      )}

      {tab === 'family' && (
        <div className="rise cols-2" style={{ alignItems: 'start' }}>
          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-orange">🧍</span> My Info</h3>
            {profile && (
              <div style={s.grid2}>
                <input placeholder="Phone" value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} style={s.input} />
                <input placeholder="DOB (YYYY-MM-DD)" value={profile.dob || ''} onChange={(e) => setProfile({ ...profile, dob: e.target.value })} style={s.input} />
                <input placeholder="Gender" value={profile.gender || ''} onChange={(e) => setProfile({ ...profile, gender: e.target.value })} style={s.input} />
                <input placeholder="Blood group" value={profile.blood_group || ''} onChange={(e) => setProfile({ ...profile, blood_group: e.target.value })} style={s.input} />
                <input placeholder="Address" value={profile.address || ''} onChange={(e) => setProfile({ ...profile, address: e.target.value })} style={s.input} />
                <input placeholder="Allergies" value={profile.allergies || ''} onChange={(e) => setProfile({ ...profile, allergies: e.target.value })} style={s.input} />
                <input placeholder="Chronic conditions" value={profile.chronic_conditions || ''} onChange={(e) => setProfile({ ...profile, chronic_conditions: e.target.value })} style={s.input} />
                <input placeholder="Emergency contact" value={profile.emergency_contact || ''} onChange={(e) => setProfile({ ...profile, emergency_contact: e.target.value })} style={s.input} />
              </div>
            )}
            <div style={{ marginTop: 8 }}><button onClick={saveProfile} style={s.primaryBtn}>Save info</button></div>
          </section>
          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-amber">👪</span> Family Profiles</h3>
            <FamilyManager onChange={setFamily} />
          </section>
        </div>
      )}
    </DashboardLayout>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #0f766e', borderRadius: 12, padding: 18, marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  input: { padding: 8, fontSize: 14 },
  primaryBtn: { padding: '8px 16px', background: 'linear-gradient(90deg,#14b8a6,#0f766e)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-start' },
  linkBtn: { background: 'none', border: 0, color: '#115e59', cursor: 'pointer', padding: 0, fontWeight: 700, boxShadow: 'none' },
  doc: { borderBottom: '1px solid #eee', padding: '8px 0' },
  summary: { background: '#f0fdfa', border: '1px solid #99f6e4', padding: 12, borderRadius: 8, marginTop: 10 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' },
  chip: { display: 'inline-block', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 999, padding: '4px 12px', fontWeight: 600 },
  docChip: { display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e7e5e4', borderRadius: 14, padding: '8px 14px 8px 8px', boxShadow: '0 1px 3px rgba(15,118,110,.08)' },
}
