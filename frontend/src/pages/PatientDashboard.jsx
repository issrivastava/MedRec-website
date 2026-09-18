import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { AI_TIMEOUT, downloadDocument, downloadExportPdf, openDocumentInline } from '../api'
import { useAuth } from '../context/AuthContext'
import { LANGS } from '../langs'
import { Avatar } from '../components/People'
import DashboardLayout from '../components/DashboardLayout'
import ProfileSwitcher from '../components/ProfileSwitcher'
import { useProfile } from '../context/ProfileContext'
import VisitNotes from '../components/VisitNotes'
import Appointments from '../components/Appointments'
import FamilyManager from '../components/FamilyManager'
import MyClinicalHistory from '../components/MyClinicalHistory'
import ReportAnalytics from '../components/ReportAnalytics'
import { kindsForCategory, kindLabel, kindIcon } from '../reportKinds'
import { AlertsPanel } from '../components/Alerts'
import { calcAge, shortId } from '../utils'
import { MyReviews } from '../components/Reviews'
import { EmergencyButton } from '../components/EmergencyButton'
import VitalsTracker from '../components/VitalsTracker'
import VaccinationTracker from '../components/VaccinationTracker'
import { ShareManager, ConsentManager } from '../components/Sharing'
import ChatBox from '../components/ChatBox'
import CompareReports from '../components/CompareReports'
import { SecondOpinionBox } from '../components/CareTools'
import { VoiceReader } from '../components/CareTools'
import SmartUpload, { ModelPicker, DocAIActions } from '../components/SmartUpload'

export default function PatientDashboard() {
  const { user } = useAuth()
  const { activeId, activeName } = useProfile()
  const [tab, setTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [docs, setDocs] = useState([])
  const [filter, setFilter] = useState({ q: '', doctor_name: '', doc_type: '', category: '', report_kind: '', group_by: 'date', member: '' })
  const [upload, setUpload] = useState({ title: '', doc_type: 'report', category: '', report_kind: '', doctor_name: '', hospital: '', visit_date: '', notes: '', family_member_id: '' })
  const [file, setFile] = useState(null)
  const [summary, setSummary] = useState(null)
  const [overall, setOverall] = useState(null)
  const [links, setLinks] = useState([])
  const [linkEmail, setLinkEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [lang, setLang] = useState('en')
  const [family, setFamily] = useState([])
  const [stats, setStats] = useState({ appts: [], alerts: 0, notes: 0 })
  const photoRef = useRef(null)
  const videoRef = useRef(null)
  const fileRef = useRef(null)

  // Local preview URL for the picked photo/video (revoked when replaced)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const load = async (searchQ) => {
    const [{ data: p }, { data: d }, { data: l }, { data: f }] = await Promise.all([
      api.get('/api/patients/me'),
      api.get('/api/documents', { params: { group_by: filter.group_by === 'doctor' ? 'doctor' : 'date', q: searchQ || undefined } }),
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

  // server-side full-text search (title + hospital + doctor + notes + OCR).
  // Tracks which query the current list came from so the client filter below
  // doesn't hide OCR matches, and restores the full list when cleared.
  const [serverQ, setServerQ] = useState('')
  const [aiStatus, setAiStatus] = useState(null)
  useEffect(() => {
    api.get('/api/documents/ai-status').then(({ data }) => setAiStatus(data)).catch(() => {})
  }, [])
  useEffect(() => {
    const q = filter.q || ''
    if (q.length >= 2) {
      const t = setTimeout(() => {
        api.get('/api/documents', { params: { q } }).then(({ data }) => { setDocs(data); setServerQ(q) }).catch(() => {})
      }, 400)
      return () => clearTimeout(t)
    }
    if (serverQ) {
      // search cleared -> restore full list
      api.get('/api/documents', { params: { group_by: filter.group_by === 'doctor' ? 'doctor' : 'date' } })
        .then(({ data }) => { setDocs(data); setServerQ('') }).catch(() => setServerQ(''))
    }
  }, [filter.q])

  // Active profile drives the record filter + upload attribution
  useEffect(() => {
    setFilter((f) => ({ ...f, member: activeId || '' }))
    setUpload((u) => ({ ...u, family_member_id: activeId || '' }))
  }, [activeId])

  const filtered = useMemo(() => {
    // When the list already came from a server search for the same query,
    // the server (which also searches OCR text) has filtered — don't re-hide.
    const skipQ = serverQ && serverQ === (filter.q || '')
    return docs.filter((d) => {
      if (!skipQ && filter.q && !(d.title + (d.hospital || '') + (d.notes || '') + (d.doctor_name || '') + (d.report_kind || '') + (d.category || '')).toLowerCase().includes(filter.q.toLowerCase())) return false
      if (filter.doctor_name && !(d.doctor_name || '').toLowerCase().includes(filter.doctor_name.toLowerCase())) return false
      if (filter.doc_type && d.doc_type !== filter.doc_type) return false
      if (filter.category && (d.category || '') !== filter.category) return false
      if (filter.report_kind && (d.report_kind || '') !== filter.report_kind) return false
      if (filter.member === 'mine' && d.family_member_id) return false
      if (filter.member && filter.member !== 'mine' && d.family_member_id !== filter.member) return false
      return true
    })
  }, [docs, filter, serverQ])

  const clearFilters = () => {
    setFilter({ q: '', doctor_name: '', doc_type: '', category: '', report_kind: '', group_by: filter.group_by, member: '' })
  }
  const filtersActive = !!(filter.q || filter.doctor_name || filter.doc_type || filter.category || filter.report_kind || filter.member)

  const grouped = useMemo(() => {
    if (filter.group_by === 'doctor') {
      const g = {}
      filtered.forEach((d) => { const k = d.doctor_name || 'Unknown doctor'; (g[k] ||= []).push(d) })
      return g
    }
    if (filter.group_by === 'kind') {
      const g = {}
      filtered.forEach((d) => { const k = kindLabel(d.report_kind) || d.doc_type || 'Other'; (g[k] ||= []).push(d) })
      return Object.fromEntries(Object.entries(g).sort())
    }
    const g = {}
    filtered.forEach((d) => { const k = d.visit_date ? d.visit_date.slice(0, 7) : 'Undated'; (g[k] ||= []).push(d) })
    return Object.fromEntries(Object.entries(g).sort().reverse())
  }, [filtered, filter.group_by])

  const memberName = (id) => (family.find((m) => m.id === id) || {}).name
  const typeIcon = { report: ['📄', 't-blue'], prescription: ['🧾', 't-violet'], lab: ['🧪', 't-teal'], scan: ['🩻', 't-amber'], other: ['📁', 't-orange'] }
  const iconFor = (d) => ((d.file_mimetype || '').startsWith('video/')
    ? ['🎥', 't-rose']
    : kindIcon(d.report_kind, typeIcon[d.doc_type] || typeIcon.other))
  const upcoming = stats.appts.filter((a) => a.status === 'booked')
  const firstName = user?.full_name ? user.full_name.split(' ')[0] : ''

  const saveProfile = async () => {
    await api.put('/api/patients/me', profile)
    setMsg('Profile saved')
  }

  const pickFile = (e) => {
    const f = e.target.files[0] || null
    setFile(f)
    e.target.value = ''
    // smart upload: auto-suggest title/category/kind from filename
    if (f) {
      const fd = new FormData()
      fd.append('title', upload.title || '')
      fd.append('filename', f.name || '')
      api.post('/api/documents/auto-classify', fd).then(({ data }) => {
        setUpload((u) => ({
          ...u,
          title: u.title || data.suggested_title || '',
          category: u.category || data.suggested_category || '',
          report_kind: u.report_kind || data.suggested_kind || '',
          doc_type: u.doc_type === 'report' && data.suggested_doc_type ? data.suggested_doc_type : u.doc_type,
        }))
        if (data.possible_duplicates?.length) setMsg(`⚠️ Possible duplicate: ${data.possible_duplicates[0].title}`)
        else setMsg(`✨ Smart detect: ${data.suggested_kind || data.suggested_doc_type || 'report'} (${data.confidence} confidence)`)
      }).catch(() => {})
    }
  }
  const isVideoFile = (file?.type || '').startsWith('video/')

  const doUpload = async (e) => {
    e.preventDefault()
    if (!file) return setMsg('Choose a file — photo, video or PDF')
    if (file.size === 0) return setMsg('⚠️ That file is empty (0 bytes) — please pick the real file again.')
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(upload).forEach(([k, v]) => { if (v) fd.append(k, v) })
    if (!upload.title) return setMsg('Title is required')
    try {
      await api.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMsg('Uploaded — lab values auto-checked for alerts')
      setFile(null); setUpload({ title: '', doc_type: 'report', category: '', report_kind: '', doctor_name: '', hospital: '', visit_date: '', notes: '', family_member_id: activeId || '' })
      load()
    } catch (err) {
      setMsg(`Upload failed: ${err.response?.data?.detail || err.message}`)
    }
  }

  const summarize = async (id) => {
    setSummary({ loading: true })
    try {
      const { data } = await api.post(`/api/documents/${id}/summarize`, null, { params: { language: lang }, timeout: AI_TIMEOUT })
      setSummary(data)
    } catch (err) {
      setSummary({ error: err.code === 'ECONNABORTED' ? 'AI is still working (cold start can take 1–2 min) — please try again in a minute.' : (err.response?.data?.detail || 'Could not generate summary. Check that Ollama is running (`ollama serve`) and the file has readable text.') })
    }
  }

  const loadOverall = async () => {
    setOverall(null)
    try {
      const { data } = await api.get('/api/documents/patient/overall-summary', { params: { language: lang }, timeout: AI_TIMEOUT })
      setOverall(data)
    } catch (err) {
      setOverall({ summary_text: err.code === 'ECONNABORTED' ? 'AI is still working (cold start can take 1–2 min) — please try again in a minute.' : `Could not generate overall summary: ${err.response?.data?.detail || err.message}`, model_used: 'error', documents_used: 0 })
    }
  }

  const linkDoctor = async (e) => {
    e.preventDefault()
    await api.post('/api/assignments', { email: linkEmail })
    setLinkEmail(''); load()
  }

  const items = [
    { key: 'overview', label: 'Overview', icon: '🏠' },
    { key: 'records', label: 'My Records', icon: '🗂️', badge: docs.length },
    { key: 'analytics', label: 'Analysis', icon: '📊' },
    { key: 'compare', label: 'What Changed', icon: '🔄' },
    { key: 'rx', label: 'Prescriptions', icon: '💊', badge: stats.notes },
    { key: 'appts', label: 'Appointments', icon: '📅', badge: upcoming.length },
    { key: 'vitals', label: 'Vitals', icon: '❤️' },
    { key: 'vaccines', label: 'Vaccines', icon: '💉' },
    { key: 'share', label: 'Share & QR', icon: '🔗' },
    { key: 'chat', label: 'Chat Doctor', icon: '💬' },
    { key: 'opinions', label: '2nd Opinion', icon: '🧠' },
    { key: 'reviews', label: 'My Reviews', icon: '⭐' },
    { key: 'family', label: 'Family & Info', icon: '👪' },
    { key: 'history', label: 'Clinical History', icon: '📋' },
    { key: 'medicines', label: 'Medicine Description', icon: '💊', to: '/medicines' },
    { key: 'diseases', label: 'Disease Description', icon: '🩺', to: '/diseases' },
    { key: 'finddoctors', label: 'Find Doctors', icon: '🏥', to: '/find-doctors' },
    { key: 'askai', label: 'Ask AI', icon: '🤖', to: '/ask-ai' },
    { key: 'timeline', label: 'Timeline', icon: '📈', to: '/timeline' },
  ]

  return (
    <DashboardLayout
      title={`👋 Welcome back${firstName ? `, ${firstName}` : ''}`}
      subtitle={`Your health command center — now viewing: ${activeName}. Switch profiles anytime.`}
      items={items} active={tab} onSelect={setTab}>

      {msg && <p style={{ color: 'green' }}>{msg}</p>}
      <ProfileSwitcher />

      {tab === 'overview' && (
        <div className="rise">
          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-rose">🆘</span> Emergency SOS</h3>
            <p style={{ fontSize: 13, color: '#5d6b7a', margin: '0 0 10px' }}>
              One tap alerts all your linked doctors and texts your emergency contact
              {profile?.emergency_contact ? <> (<b>{profile.emergency_contact}</b>)</> : ' — set one in Family & Info'}.
            </p>
            <EmergencyButton />
          </section>
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
            <form onSubmit={linkDoctor} className="inline-form">
              <input placeholder="Doctor email to link" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} style={s.input} />
              <button style={s.primaryBtn}>Add</button>
            </form>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {links.map((l) => (
                <span key={l.id} style={s.docChip}>
                  <Avatar seed={l.doctor_id} name={l.doctor_name} size={34} />
                  <span><b>Dr. {l.doctor_name}</b><br /><small style={{ color: '#5d6b7a' }}>{l.doctor_email}</small></span>
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
                <input placeholder="Title* e.g. CBC Report Jan, Chest X-Ray" value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} style={s.input} />
                <div className="form-grid">
                  <select value={upload.doc_type} onChange={(e) => setUpload({ ...upload, doc_type: e.target.value })} style={s.input} title="Legacy type">
                    <option value="report">Report</option><option value="prescription">Prescription</option>
                    <option value="lab">Lab</option><option value="scan">Scan</option><option value="other">Other</option>
                  </select>
                  <select value={upload.family_member_id} onChange={(e) => setUpload({ ...upload, family_member_id: e.target.value })} style={s.input}>
                    <option value="">Belongs to: Me</option>
                    {family.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <select value={upload.category} onChange={(e) => setUpload({ ...upload, category: e.target.value, report_kind: '' })} style={s.input} title="Report category">
                    <option value="">Category: auto-detect</option>
                    <option value="lab">Pathology Lab (CBC, TSH, LFT…)</option>
                    <option value="imaging">Radiology / Imaging (X-Ray, MRI…)</option>
                    <option value="cardiology">Cardiac (ECG, Echo…)</option>
                    <option value="prescription">Prescription & Clinical</option>
                    <option value="other">Other</option>
                  </select>
                  <select value={upload.report_kind} onChange={(e) => setUpload({ ...upload, report_kind: e.target.value })} style={s.input} title="Report kind">
                    <option value="">Kind: auto-detect from title</option>
                    {kindsForCategory(upload.category).map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <input placeholder="Doctor name" value={upload.doctor_name} onChange={(e) => setUpload({ ...upload, doctor_name: e.target.value })} style={s.input} />
                  <input placeholder="Hospital" value={upload.hospital} onChange={(e) => setUpload({ ...upload, hospital: e.target.value })} style={s.input} />
                </div>
                <div className="form-grid">
                  <input type="date" value={upload.visit_date} onChange={(e) => setUpload({ ...upload, visit_date: e.target.value })} style={s.input} />
                  <input placeholder="Notes" value={upload.notes} onChange={(e) => setUpload({ ...upload, notes: e.target.value })} style={s.input} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => fileRef.current?.click()}>📁 Choose file</button>
                  <button type="button" onClick={() => photoRef.current?.click()}>📷 Take photo</button>
                  <button type="button" onClick={() => videoRef.current?.click()}>🎥 Record video</button>
                </div>
                <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.txt" onChange={pickFile} hidden />
                <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={pickFile} hidden />
                <input ref={videoRef} type="file" accept="video/*" capture="environment" onChange={pickFile} hidden />
                {file && (
                  <div style={s.preview}>
                    {isVideoFile && previewUrl
                      ? <video src={previewUrl} controls style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />
                      : previewUrl && <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />}
                    <div style={{ fontSize: 13, color: '#5d6b7a', marginTop: 4 }}>
                      📎 {file.name} ({(file.size / 1048576).toFixed(1)} MB)
                      {' '}<button type="button" onClick={() => setFile(null)} style={s.linkBtn}>remove</button>
                    </div>
                  </div>
                )}
                <p style={{ fontSize: 12, color: '#5d6b7a', margin: 0 }}>
                  Photos & PDFs up to 15 MB · videos up to 100 MB. AI text summaries work best
                  with clear photos/PDFs — videos are stored for you & your doctor to watch.
                </p>
                <button style={s.primaryBtn}>Upload</button>
              </form>
              <div style={{ marginTop: 12 }}>
                <SmartUpload meta={upload} activeId={activeId} onUploaded={load} notify={setMsg} />
              </div>
            </section>

            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-violet">🤖</span> AI Health Overview</h3>
              <ModelPicker />
              {aiStatus && (
                <div style={{ fontSize: 12, marginBottom: 8, color: aiStatus.ollama_ok ? '#166534' : '#b91c1c' }}>
                  {aiStatus.ollama_ok ? `🟢 Ollama ready (${aiStatus.ollama_detail})` : `🔴 ${aiStatus.ollama_detail}`}
                  {!aiStatus.tesseract_ok && <div style={{ color: '#92400e' }}>⚠️ {aiStatus.tesseract_detail}</div>}
                </div>
              )}
              <label>Summary language: <select value={lang} onChange={(e) => setLang(e.target.value)} style={s.input}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select></label>
              <div style={{ marginTop: 8 }}><button onClick={loadOverall} style={s.primaryBtn}>Generate overall summary</button></div>
              {overall && <div style={s.summary}><b>Overall ({overall.model_used}, {overall.documents_used} docs):</b><VoiceReader text={overall.summary_text} /><p style={{ whiteSpace: 'pre-wrap' }}>{overall.summary_text}</p></div>}
              {summary && (
                <div style={s.summary}>
                  <b>{summary.loading ? 'AI report (working…)' : `AI report (${summary.model_used || ''}${summary.model_used === 'offline-extractive-fallback' ? ' — offline, start Ollama for full AI' : ''}, ${summary.language || lang})`}:</b>
                  {!summary.loading && summary.summary_text && <VoiceReader text={summary.summary_text} />}
                  {summary.loading ? <p>Generating with Ollama… (cold start can take 1–2 min — please wait, don't click again)</p>
                    : summary.error ? <p style={{ color: '#b91c1c' }}>⚠️ {summary.error}</p>
                      : <p style={{ whiteSpace: 'pre-wrap' }}>{summary.summary_text}</p>}
                </div>
              )}
            </section>
          </div>

          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-amber">🗂️</span> Documents — showing {filtered.length} of {docs.length}</h3>
            <div className="toolbar-row">
              <input placeholder="Full-text search — title, hospital, doctor, OCR text…" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={s.input} />
              <input placeholder="Filter by doctor" value={filter.doctor_name} onChange={(e) => setFilter({ ...filter, doctor_name: e.target.value })} style={s.input} />
              <select value={filter.doc_type} onChange={(e) => setFilter({ ...filter, doc_type: e.target.value })} style={s.input}>
                <option value="">All types</option><option value="report">Report</option><option value="prescription">Prescription</option>
                <option value="lab">Lab</option><option value="scan">Scan</option><option value="other">Other</option>
              </select>
              <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value, report_kind: '' })} style={s.input}>
                <option value="">All categories</option>
                <option value="lab">Pathology Lab</option>
                <option value="imaging">Radiology / Imaging</option>
                <option value="cardiology">Cardiac</option>
                <option value="prescription">Prescription & Clinical</option>
                <option value="other">Other</option>
              </select>
              <select value={filter.report_kind} onChange={(e) => setFilter({ ...filter, report_kind: e.target.value })} style={s.input}>
                <option value="">All kinds (X-Ray, CBC, MRI, TSH, LFT…)</option>
                {kindsForCategory(filter.category).map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
              </select>
              <select value={filter.group_by} onChange={(e) => setFilter({ ...filter, group_by: e.target.value })} style={s.input}>
                <option value="date">Date-wise</option><option value="doctor">Doctor-wise</option>
                <option value="kind">Report-kind-wise</option>
              </select>
              <select value={filter.member} onChange={(e) => setFilter({ ...filter, member: e.target.value })} style={s.input}>
                <option value="">Everyone</option><option value="mine">Mine only</option>
                {family.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {filtersActive && <button onClick={clearFilters} style={s.linkBtn}>✕ Clear filters</button>}
            </div>
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} style={{ marginBottom: 14 }}>
                <h4 style={{ background: '#c9d4e2', padding: 6, borderRadius: 6 }}>{group} ({items.length})</h4>
                {items.map((d) => (
                  <div key={d.id} className="doc-row">
                    <span className={`tile ${iconFor(d)[1]}`}>{iconFor(d)[0]}</span>
                    <div className="grow">
                      <b>{d.title}</b>{' '}
                      <span className="pill pill-info">{kindLabel(d.report_kind) || d.doc_type}</span>
                      {d.category && <span className="pill" style={{ background: '#eef2f7', marginLeft: 6 }}>{d.category}</span>}
                      {(d.file_size || 0) === 0
                        ? <span className="pill pill-open" style={{ marginLeft: 6 }} title="File stored 0 bytes — delete and re-upload">⚠️ empty file</span>
                        : d.has_text
                          ? <span className="pill pill-ok" style={{ marginLeft: 6 }} title={`${d.ocr_chars} text chars extracted`}>📝 text ready</span>
                          : <span className="pill" style={{ marginLeft: 6, background: '#fef3c7' }} title="No readable text — photo/scan needs Tesseract, or re-upload a clear PDF">🖼️ image-only</span>}
                      <div style={{ fontSize: 13, color: '#5d6b7a' }}>{d.visit_date || 'Undated'} — {d.doctor_name || '—'}{d.family_member_id && memberName(d.family_member_id) ? ` · 👪 ${memberName(d.family_member_id)}` : ''}</div>
                      <div className="doc-actions">
                        <button onClick={() => summarize(d.id)} disabled={(d.file_size || 0) === 0} title={(d.file_size || 0) === 0 ? 'Empty file — re-upload first' : 'Generate AI summary'}>AI summary</button>
                        <DocAIActions doc={d} onApplied={load} />
                        {(d.file_mimetype || '').startsWith('video/')
                          ? <button onClick={() => openDocumentInline(d.id)}>▶ Play</button>
                          : <button onClick={() => downloadDocument(d.id, d.title)}>⬇ PDF</button>}
                        <button onClick={async () => { await api.delete(`/api/documents/${d.id}`); load() }}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!Object.keys(grouped).length && (
              <div className="empty">
                {docs.length
                  ? <>🔍 Filters hide all {docs.length} document(s) — <button onClick={clearFilters} style={s.linkBtn}>clear filters</button> to show everything.</>
                  : <>📭 No documents here yet — scan your first report above to get started.</>}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'analytics' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-blue">📊</span> Report Analysis — {activeName}</h3>
          <ReportAnalytics docs={filtered} />
        </section>
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
          <div className="empty" style={{ textAlign: 'left', marginBottom: 12 }}>
            🏥 Need a hospital specialist?{' '}
            <Link to="/find-doctors" style={{ fontWeight: 700 }}>Find Bombay, Apollo & Fortis doctors available for appointment →</Link>
          </div>
          <Appointments role="patient" doctors={links} />
        </section>
      )}

      {tab === 'compare' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">🔄</span> What Changed Since Last Report</h3>
          <CompareReports docs={docs} />
        </section>
      )}

      {tab === 'vitals' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-rose">❤️</span> Vitals Tracker</h3>
          <VitalsTracker role="patient" />
        </section>
      )}

      {tab === 'vaccines' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-violet">💉</span> Vaccination Tracker</h3>
          <VaccinationTracker role="patient" />
        </section>
      )}

      {tab === 'share' && (
        <div className="rise">
          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-blue">🔗</span> Secure Share + QR</h3>
            <ShareManager />
          </section>
          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-amber">🔐</span> Granular Consent — what doctors see</h3>
            <ConsentManager doctors={links} />
          </section>
        </div>
      )}

      {tab === 'chat' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">💬</span> Chat With Doctor</h3>
          <ChatBox role="patient" />
        </section>
      )}

      {tab === 'opinions' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-violet">🧠</span> Second Opinions</h3>
          <SecondOpinionBox role="patient" doctors={links} />
        </section>
      )}

      {tab === 'reviews' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-amber">⭐</span> My Reviews</h3>
          <MyReviews role="patient" doctors={links} />
        </section>
      )}

      {tab === 'family' && (
        <div className="rise cols-2" style={{ alignItems: 'start' }}>
          <section style={s.card}>
            <h3 className="sec-head"><span className="tile t-orange">🧍</span> My Info</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="pill pill-info" title={user?.id}>🪪 Patient ID: {shortId(user?.id)}</span>
              <span className="pill pill-ok">🎂 Age: {(() => { const a = calcAge(profile?.dob); return a != null ? `${a} yrs` : 'set DOB ↓' })()}</span>
              {profile?.gender && <span className="pill pill-ok">👤 {profile.gender}</span>}
              {profile?.blood_group && <span className="pill pill-ok">🩸 {profile.blood_group}</span>}
            </div>
            {profile && (
              <div className="form-grid">
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

      {tab === 'history' && (
        <section style={s.card} className="rise">
          <h3 className="sec-head"><span className="tile t-violet">📋</span> Clinical History</h3>
          <p style={{ fontSize: 13, color: '#5d6b7a', margin: '0 0 10px' }}>
            Write your full clinical history in detail — conditions, surgeries, medicines,
            lifestyle and heredity. Your assigned doctors read this when treating you.
          </p>
          <MyClinicalHistory />
        </section>
      )}
    </DashboardLayout>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)', minWidth: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  preview: { border: '1px dashed #c9d4e2', borderRadius: 8, padding: 8, background: '#f8f9fa' },  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  primaryBtn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-start' },
  linkBtn: { background: 'none', border: 0, color: '#152a45', cursor: 'pointer', padding: 0, fontWeight: 700, boxShadow: 'none' },
  doc: { borderBottom: '1px solid #eee', padding: '8px 0' },
  summary: { background: '#eef2f7', border: '1px solid #c9d4e2', padding: 12, borderRadius: 8, marginTop: 10 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' },
  chip: { display: 'inline-block', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 999, padding: '4px 12px', fontWeight: 600 },
  docChip: { display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e7e5e4', borderRadius: 14, padding: '8px 14px 8px 8px', boxShadow: '0 1px 3px rgba(15,118,110,.08)' },
}
