import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { AI_TIMEOUT } from '../api'
import { DocumentPdfButton, ExportRecordButton, SummaryDownloadButton, BlobPdfButton } from '../components/PdfButtons'
import { useAuth } from '../context/AuthContext'
import { LANGS } from '../langs'
import { Avatar } from '../components/People'
import DashboardLayout from '../components/DashboardLayout'
import { useProfile } from '../context/ProfileContext'
import { useLang } from '../i18n.jsx'
import VisitNotes from '../components/VisitNotes'
import Appointments from '../components/Appointments'
import MyClinicalHistory from '../components/MyClinicalHistory'
import StructuredRecords from '../components/StructuredRecords'
import ReportAnalytics from '../components/ReportAnalytics'
import { kindsForCategory, kindLabel, kindIcon, docTypeForKind, categoryForKind, isPrescriptionDoc, KIND_TO_CATEGORY, KIND_META } from '../reportKinds'
import { AlertsPanel } from '../components/Alerts'
import { calcAge, shortId } from '../utils'
import { MyReviews } from '../components/Reviews'
import { EmergencyButton } from '../components/EmergencyButton'
import VitalsTracker from '../components/VitalsTracker'
import VaccinationTracker from '../components/VaccinationTracker'
import { ShareManager, ConsentManager } from '../components/Sharing'
import ChatBox from '../components/ChatBox'
import ConnectById from '../components/ConnectById'
import MyIdCard from '../components/MyIdCard'
import CompareReports from '../components/CompareReports'
import SmartUpload, { DocAIActions } from '../components/SmartUpload'
import CameraCapture from '../components/CameraCapture'
import { RecordCard, CountdownWidgets, Milestones, Dropzone, ToastHost, toast, Skeleton, EmptyState, FileRail, PreviewDrawer } from '../components/HealthUX'

export default function PatientDashboard() {
  const { user } = useAuth()
  const { activeId, activeName, setActive } = useProfile()
  const { t } = useLang()
  const [tab, setTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [docs, setDocs] = useState([])
  const [docStats, setDocStats] = useState(null) // file-manager sidebar counts
  const [filter, setFilter] = useState({ q: '', doctor_name: '', doc_type: '', category: '', report_kind: '', group_by: 'date', member: '' })
  const [upload, setUpload] = useState({ title: '', doc_type: 'report', category: '', report_kind: '', doctor_name: '', hospital: '', visit_date: '', notes: '', family_member_id: '' })
  const [file, setFile] = useState(null)
  const [summary, setSummary] = useState(null)
  const [overall, setOverall] = useState(null)
  const [overallBusy, setOverallBusy] = useState(false)
  const [links, setLinks] = useState([])
  const [linkEmail, setLinkEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [lang, setLang] = useState('en')
  const [stats, setStats] = useState({ appts: [], alerts: 0, notes: 0 })
  const [notesList, setNotesList] = useState([])
  const [vaccines, setVaccines] = useState([])
  const [vitalsCount, setVitalsCount] = useState(0)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [drawerDoc, setDrawerDoc] = useState(null)
  const [sortBy, setSortBy] = useState('date')
  const [selected, setSelected] = useState(new Set())
  const [trendIds, setTrendIds] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [camMode, setCamMode] = useState(null) // null | 'photo' | 'video'
  const fileRef = useRef(null)

  // "/" focuses record search (global shortcut)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
        e.preventDefault()
        setTab('records')
        setTimeout(() => document.getElementById('records-search')?.focus(), 50)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Local preview URL for the picked photo/video (revoked when replaced)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  // Onboarding: first-run checklist until the account has records + a doctor.
  const [onboardDismissed, setOnboardDismissed] = useState(() => {
    try { return localStorage.getItem('medrec_onboarded') === '1' } catch { return false }
  })
  const showOnboarding = !onboardDismissed && docs.length === 0 && links.length === 0
  const dismissOnboarding = () => {
    setOnboardDismissed(true)
    try { localStorage.setItem('medrec_onboarded', '1') } catch { /* ignore */ }
  }

  const load = async (searchQ) => {
    setDocsLoading(true)
    try {
    const [{ data: p }, { data: d }, { data: l }] = await Promise.all([
      api.get('/api/patients/me'),
      api.get('/api/documents', { params: { group_by: filter.group_by === 'doctor' ? 'doctor' : 'date', q: searchQ || undefined } }),
      api.get('/api/assignments/my'),
    ])
    setProfile(p); setDocs(d); setLinks(l)
    api.get('/api/documents/stats').then(({ data }) => setDocStats(data)).catch(() => {})
    const [{ data: a }, { data: al }, { data: n }, { data: v }] = await Promise.all([
      api.get('/api/scheduling/appointments/my').catch(() => ({ data: [] })),
      api.get('/api/labs/alerts/my').catch(() => ({ data: [] })),
      api.get('/api/visits/my').catch(() => ({ data: [] })),
      api.get('/api/wellness/vaccinations').catch(() => ({ data: [] })),
    ])
    setStats({ appts: a, alerts: al.filter((x) => !x.acknowledged).length, notes: n.length })
    setNotesList(n)
    setVaccines(Array.isArray(v) ? v : (v?.vaccinations || []))
    api.get('/api/wellness/vitals/summary').then(({ data }) => {
      const latest = data?.latest || {}
      setVitalsCount(Object.keys(latest).length)
    }).catch(() => {})
    } finally {
      setDocsLoading(false)
    }
  }

  useEffect(() => { load().catch(console.error) }, [])

  // Deep-link: /patient#chat opens the chat tab (used by the navbar Chat link)
  const [chatUnread, setChatUnread] = useState(0)
  useEffect(() => {
    try {
      if (window.location.hash === '#chat') {
        setTab('chat')
        window.history.replaceState(null, '', window.location.pathname)
      }
    } catch { /* ignore */ }
    const fetchChat = () => api.get('/api/messages/unread-count').then(({ data }) => setChatUnread(data.unread || 0)).catch(() => {})
    fetchChat()
    const t = setInterval(fetchChat, 30000)
    return () => clearInterval(t)
  }, [])

  // server-side full-text search (title + hospital + doctor + notes + OCR).
  // Tracks which query the current list came from so the client filter below
  // doesn't hide OCR matches, and restores the full list when cleared.
  const [serverQ, setServerQ] = useState('')
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

  // Family profiles were removed from this dashboard — always show the
  // patient's own records (a stale family selection in storage must not
  // silently filter everything with no UI to switch back).
  useEffect(() => { setActive('') }, [setActive])

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

  // File-manager rail: picking a kind filters to it (category derived from
  // the taxonomy so kind+category can never disagree); picking again clears.
  const pickKind = (kind) => {
    if (!kind) {
      setFilter((f) => ({ ...f, report_kind: '', category: '', doc_type: '' }))
    } else {
      setFilter((f) => ({ ...f, report_kind: kind, category: KIND_TO_CATEGORY[kind] || f.category, doc_type: '' }))
    }
    setSelected(new Set())
  }

  const clearFilters = () => {
    setFilter({ q: '', doctor_name: '', doc_type: '', category: '', report_kind: '', group_by: filter.group_by, member: '' })
    setSelected(new Set())
  }
  const filtersActive = !!(filter.q || filter.doctor_name || filter.doc_type || filter.category || filter.report_kind || filter.member)

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortBy === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else arr.sort((a, b) => ((b.visit_date || b.created_at || '') > (a.visit_date || a.created_at || '') ? 1 : -1))
    return arr
  }, [filtered, sortBy])

  const toggleSelect = (id) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const bulkDelete = async () => {
    if (!selected.size) return
    if (!window.confirm(`Delete ${selected.size} selected file(s)? This cannot be undone.`)) return
    let ok = 0
    for (const id of selected) {
      try { await api.delete(`/api/documents/${id}`); ok += 1 } catch { /* keep going */ }
    }
    setSelected(new Set())
    toast(`🗑 Deleted ${ok} file(s)`, ok ? 'ok' : 'err')
    load()
  }

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
    if (f) classifyFile(f)
  }

  const dropFile = (f) => {
    if (!f) return
    setFile(f)
    classifyFile(f)
  }

  const classifyFile = (f) => {
    // smart upload: auto-suggest title/category/kind from filename
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

  const onKindChange = (kind) => {
    if (!kind) { setUpload((u) => ({ ...u, report_kind: '' })); return }
    setUpload((u) => ({
      ...u,
      report_kind: kind,
      category: categoryForKind(kind) || u.category,
      doc_type: docTypeForKind(kind) || u.doc_type,
    }))
  }

  const fixLabels = async () => {
    try {
      const { data } = await api.post('/api/documents/fix-labels')
      setMsg(data.fixed ? `✅ Fixed ${data.fixed}/${data.total} mislabelled file(s) — e.g. prescriptions saved as reports.` : `✅ All ${data.total} file(s) already labelled correctly.`)
      load()
    } catch (err) {
      setMsg(`Fix failed: ${err.response?.data?.detail || err.message}`)
    }
  }

  // In-page camera capture (photo snap or video clip) — works on any device.
  const onCameraFile = (f) => {
    setFile(f)
    setCamMode(null)
    classifyFile(f)
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
      toast('✅ Uploaded — lab values auto-checked', 'ok')
      setFile(null); setUpload({ title: '', doc_type: 'report', category: '', report_kind: '', doctor_name: '', hospital: '', visit_date: '', notes: '', family_member_id: activeId || '' })
      load()
    } catch (err) {
      const m = `Upload failed: ${err.response?.data?.detail || err.message}`
      setMsg(m)
      toast(`❌ ${m}`, 'err')
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
    if (overallBusy) return
    setOverallBusy(true)
    setOverall(null)
    try {
      const { data } = await api.get('/api/documents/patient/overall-summary', { params: { language: lang }, timeout: AI_TIMEOUT })
      setOverall(data)
    } catch (err) {
      setOverall({ summary_text: err.code === 'ECONNABORTED' ? 'AI is still working (cold start can take 1–2 min) — please try again in a minute.' : `Could not generate overall summary: ${err.response?.data?.detail || err.message}`, model_used: 'error', documents_used: 0 })
    } finally {
      setOverallBusy(false)
    }
  }

  const linkDoctor = async (e) => {
    e.preventDefault()
    await api.post('/api/assignments', { email: linkEmail })
    setLinkEmail(''); load()
  }

  const items = [
    { key: 'overview', label: t('tab.overview'), icon: '🏠', section: t('sec.mycare') },
    { key: 'upload', label: t('tab.upload'), icon: '📤', to: '/upload', section: t('sec.mycare') },
    { key: 'records', label: t('tab.records'), icon: '🗂️', badge: docs.length, section: t('sec.mycare') },
    { key: 'trends', label: t('tab.trends'), icon: '📊', section: t('sec.mycare') },
    { key: 'rx', label: t('tab.rx'), icon: '💊', badge: stats.notes, section: t('sec.mycare') },
    { key: 'appts', label: t('tab.appts'), icon: '📅', badge: upcoming.length, section: t('sec.mycare') },
    { key: 'vitals', label: t('tab.vitals'), icon: '❤️', section: t('sec.mycare') },
    { key: 'vaccines', label: t('tab.vaccines'), icon: '💉', section: t('sec.mycare') },
    { key: 'share', label: t('tab.share'), icon: '🔗', section: t('sec.doctorsChat') },
    { key: 'chat', label: t('tab.chat'), icon: '💬', badge: chatUnread, section: t('sec.doctorsChat') },
    { key: 'reviews', label: t('tab.reviews'), icon: '⭐', section: t('sec.doctorsChat') },
    { key: 'info', label: t('tab.info'), icon: '🧍', section: t('sec.doctorsChat') },
    { key: 'history', label: t('tab.history'), icon: '📋', section: t('sec.doctorsChat') },
    { key: 'medicines', label: t('tab.medicines'), icon: '💊', to: '/medicines', section: t('sec.discover') },
    { key: 'illnesses', label: t('tab.illnesses'), icon: '🩺', to: '/illnesses', section: t('sec.discover') },
    { key: 'finddoctors', label: t('tab.finddoctors'), icon: '🏥', to: '/find-doctors', section: t('sec.discover') },
    { key: 'askai', label: t('tab.askai'), icon: '🤖', to: '/ask-ai', section: t('sec.discover') },
  ]

  return (
    <DashboardLayout
      title={`${t('dash.welcome')}${firstName ? `, ${firstName}` : ''}`}
      subtitle={t('dash.subtitle')}
      meta={
        <>
          <span className="pill pill-ok">📄 {docs.length} documents</span>
          {upcoming.length > 0 && <span className="pill pill-low">📅 {upcoming.length} upcoming</span>}
          {stats.alerts > 0 && <span className="pill pill-high">⚠️ {stats.alerts} open alerts</span>}
        </>
      }
      items={items} active={tab} onSelect={setTab} sideTitle="PATIENT" tone="dash-patient">

      {msg && <p style={{ color: 'green' }}>{msg}</p>}

      {tab === 'overview' && (
        <div className="rise">
          <section style={{ ...s.card, ...s.tintRose }}>
            <h3 className="sec-head"><span className="tile t-rose">🆘</span> {t('sec.sos')}</h3>
            <p className="sec-sub">
              One tap alerts all your linked doctors and texts your emergency contact
              {profile?.emergency_contact ? <> (<b>{profile.emergency_contact}</b>)</> : ' — set one in My Info'}.
            </p>
            <EmergencyButton />
          </section>
          {showOnboarding && (
            <section style={{ ...s.card, ...s.tintTeal, borderLeft: '4px solid #0d9488' }}>
              <h3 className="sec-head"><span className="tile t-teal">🚀</span> {t('onboard.title')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <OnboardRow done={docs.length > 0} text={t('onboard.s1')} action={() => setTab('records')} actionLabel="Upload →" />
                <OnboardRow done={links.length > 0} text={t('onboard.s2')} action={() => document.getElementById('my-doctors')?.scrollIntoView({ behavior: 'smooth' })} actionLabel="Link →" />
                <OnboardRow done={upcoming.length > 0} text={t('onboard.s3')} action={() => setTab('appts')} actionLabel="Book →" />
              </div>
              <button onClick={dismissOnboarding} style={{ ...s.linkBtn, marginTop: 8 }}>{t('onboard.dismiss')}</button>
            </section>
          )}
          <div className="stat-grid">
            <div className="gstat g-orange" role="link" tabIndex={0} title="Open My Records"
              onClick={() => setTab('records')} onKeyDown={(e) => e.key === 'Enter' && setTab('records')}
              style={{ cursor: 'pointer' }}><div className="num">{docs.length}</div><div className="lbl">{t('tile.documents')}</div><div className="sub">{t('tile.documentsSub')}</div><span className="big-icon">📄</span></div>
            <div className="gstat g-teal" role="link" tabIndex={0} title="Open Appointments"
              onClick={() => setTab('appts')} onKeyDown={(e) => e.key === 'Enter' && setTab('appts')}
              style={{ cursor: 'pointer' }}><div className="num">{upcoming.length}</div><div className="lbl">{t('tile.visits')}</div><div className="sub">{t('tile.visitsSub')}</div><span className="big-icon">📅</span></div>
            <div className="gstat g-rose" role="link" tabIndex={0} title="Jump to Health Alerts"
              onClick={() => document.getElementById('health-alerts')?.scrollIntoView({ behavior: 'smooth' })}
              onKeyDown={(e) => e.key === 'Enter' && document.getElementById('health-alerts')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ cursor: 'pointer' }}><div className="num">{stats.alerts}</div><div className="lbl">{t('tile.alerts')}</div><div className="sub">{t('tile.alertsSub')}</div><span className="big-icon">⚠️</span></div>
            <div className="gstat g-violet" role="link" tabIndex={0} title="Open Prescriptions"
              onClick={() => setTab('rx')} onKeyDown={(e) => e.key === 'Enter' && setTab('rx')}
              style={{ cursor: 'pointer' }}><div className="num">{stats.notes}</div><div className="lbl">{t('tile.notes')}</div><div className="sub">{t('tile.notesSub')}</div><span className="big-icon">💊</span></div>
          </div>

          <CountdownWidgets appointments={stats.appts} vaccinations={vaccines} notes={notesList} />
          <Milestones docs={docs} vitalsCount={vitalsCount} apptsKept={stats.appts.filter((a) => a.status === 'completed').length} />

          <div className="cols-2">
            <section style={{ ...s.card, ...s.tintRose }} id="health-alerts">
              <h3 className="sec-head"><span className="tile t-rose">⚠️</span> {t('sec.alerts')}</h3>
              <AlertsPanel />
            </section>
            <section style={{ ...s.card, ...s.tintTeal }}>
              <h3 className="sec-head"><span className="tile t-teal">🔔</span> {t('sec.comingUp')}</h3>
              {upcoming.slice(0, 3).map((a) => (
                <div key={a.id} style={s.row}><span><b>{a.date}</b> at {a.start_time} — Dr. {a.doctor_name}</span><span className="pill pill-ok">{a.status}</span></div>
              ))}
              {!upcoming.length && <div className="empty">No upcoming visits — <button onClick={() => setTab('appts')} style={s.linkBtn}>book one</button>.</div>}
              <div className="quick-actions">
                <button onClick={() => setTab('records')} style={s.primaryBtn}>＋ Upload report</button>
                <ExportRecordButton />
              </div>
            </section>
          </div>

          <section style={{ ...s.card, ...s.tintBlue }} id="my-doctors">
            <h3 className="sec-head"><span className="tile t-blue">👨‍⚕️</span> {t('sec.doctors')}</h3>
            <MyIdCard user={user} compact />
            <ConnectById role="patient" onLinked={load} />
            <form onSubmit={linkDoctor} className="inline-form">
              <input placeholder="Doctor email (legacy)" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} style={s.input} />
              <button style={s.primaryBtn}>Add</button>
            </form>
            <div className="doc-chip-row">
              {links.map((l) => (
                <span key={l.id} style={s.docChip}>
                  <Avatar seed={l.doctor_id} name={l.doctor_name} size={34} />
                  <span><b>Dr. {l.doctor_name}</b><br /><small style={{ color: '#5d6b7a' }}>{l.doctor_email}{l.doctor_health_id ? ` · 🪪 ${l.doctor_health_id}` : ''}</small></span>
                </span>
              ))}
              {!links.length && <span style={{ color: '#78716c' }}>No doctors linked yet — paste their AH-XXXX ID above.</span>}
            </div>
          </section>
        </div>
      )}

      {tab === 'records' && (
        <div className="rise">
          <div className="cols-2" style={{ alignItems: 'start' }}>
            <section style={{ ...s.card, ...s.tintOrange }}>
              <h3 className="sec-head"><span className="tile t-orange">📤</span> Scan / Upload</h3>
              <div style={{ marginBottom: 10 }}>
                <Dropzone accept="image/*,video/*,.pdf,.doc,.docx,.csv,.txt" onFile={dropFile} />
              </div>
              <form onSubmit={doUpload} style={s.form}>
                <input placeholder="Title* e.g. CBC Report Jan, Chest X-Ray" value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} style={s.input} />
                <div className="form-grid">
                  <select value={upload.doc_type} onChange={(e) => setUpload({ ...upload, doc_type: e.target.value })} style={s.input} title="Type — auto-set from Kind">
                    <option value="report">Report (ECG, Echo, clinical…)</option><option value="prescription">Prescription</option>
                    <option value="lab">Lab</option><option value="scan">Scan / Imaging</option><option value="other">Other</option>
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
                  <select value={upload.report_kind} onChange={(e) => onKindChange(e.target.value)} style={s.input} title="Report kind — picking a Kind auto-sets Category + Type">
                    <option value="">Kind: auto-detect from title</option>
                    {kindsForCategory(upload.category).map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
                  </select>
                </div>
                {upload.report_kind && (
                  <p style={{ fontSize: 12, color: '#0a6e63', margin: 0 }}>
                    Will save as: <b>{kindLabel(upload.report_kind)}</b> · {categoryForKind(upload.report_kind)} · {docTypeForKind(upload.report_kind)}
                  </p>
                )}
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
                  <button type="button" onClick={() => setCamMode('photo')}>📷 Take photo</button>
                  <button type="button" onClick={() => setCamMode('video')}>🎥 Record video</button>
                </div>
                <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.csv,.txt" onChange={pickFile} hidden />
                {camMode && (
                  <CameraCapture
                    initialMode={camMode}
                    onCapture={onCameraFile}
                    onClose={() => setCamMode(null)}
                  />
                )}
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
                  Photos & PDFs up to 15 MB · videos up to 100 MB. The camera works
                  on phones and computers — snap a photo or record a clip right here.
                  AI text summaries work best with clear photos/PDFs.
                </p>
                <button style={s.primaryBtn}>Upload</button>
              </form>
              <div style={{ marginTop: 12 }}>
                <SmartUpload meta={upload} activeId={activeId} onUploaded={load} notify={setMsg} />
              </div>
            </section>

            <section style={{ ...s.card, ...s.tintViolet }}>
              <h3 className="sec-head"><span className="tile t-violet">🤖</span> AI Health Overview</h3>
              <p style={{ fontSize: 13, color: '#5d6b7a', margin: '0 0 10px' }}>
                One plain-language summary across your recent reports — no settings, just Generate.
              </p>
              <label>Summary language: <select value={lang} onChange={(e) => setLang(e.target.value)} style={s.input}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select></label>
              <div style={{ marginTop: 8 }}><button onClick={loadOverall} style={s.primaryBtn} disabled={overallBusy}>{overallBusy ? 'Generating… please wait' : 'Generate overall summary'}</button></div>
              {overallBusy && <div style={s.summary}><b>Overall (working…)</b><p>Reading your reports… the first run can take 1–2 min. Please wait, don't click again.</p></div>}
              {overall && (
                <div style={s.summary}>
                  <b>Overall health summary{overall.documents_used ? ` (${overall.documents_used} docs)` : ''}:</b>
                  <VoiceReader text={overall.summary_text} />
                  <p style={{ whiteSpace: 'pre-wrap' }}>{overall.summary_text}</p>
                  {overall.model_used !== 'error' && (
                    <BlobPdfButton
                      idleLabel="⬇ Download PDF"
                      filename="overall-summary.pdf"
                      title="Download this summary as a PDF"
                      fetchPdf={() => api.post('/api/documents/patient/overall-summary/pdf',
                        { text: overall.summary_text, language: lang }, { responseType: 'blob' })}
                    />
                  )}
                </div>
              )}
              {summary && (
                <div style={s.summary}>
                  <b>{summary.loading ? 'AI report (working…)' : `AI report (${summary.model_used || ''}${summary.model_used === 'offline-extractive-fallback' ? ' — offline, start Ollama for full AI' : ''}, ${summary.language || lang})`}:</b>
                  {!summary.loading && summary.summary_text && <VoiceReader text={summary.summary_text} />}
                  {summary.loading ? <p>Generating with Ollama… (cold start can take 1–2 min — please wait, don't click again)</p>
                    : summary.error ? <p style={{ color: '#b91c1c' }}>⚠️ {summary.error}</p>
                      : <><p style={{ whiteSpace: 'pre-wrap' }}>{summary.summary_text}</p><SummaryDownloadButton title={`MedRec summary`} text={summary.summary_text} /></>}
                </div>
              )}
            </section>
          </div>

          <section style={{ ...s.card, ...s.tintAmber }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="sec-head" style={{ margin: 0 }}><span className="tile t-amber">🗂️</span> Documents — showing {sorted.length} of {docs.length}</h3>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={s.input} title="Sort within each strip">
                  <option value="date">Newest first</option>
                  <option value="title">Title A–Z</option>
                </select>
                <button onClick={fixLabels} title="Re-label files stored as generic Report (e.g. prescriptions) using title + filename">🏷️ Fix labels</button>
                <ExportRecordButton label="⬇ Export record PDF" />
              </span>
            </div>
            <div className="file-manager">
              <FileRail stats={docStats} activeKind={filter.report_kind} onPick={pickKind} />
              <div className="file-main">
            <div className="sticky-bar">
            <div className="toolbar-row" style={{ marginBottom: 0 }}>
              <input id="records-search" placeholder="Search — title, hospital, doctor, OCR…  ( / )" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={s.input} />
              <input placeholder="Filter by doctor" value={filter.doctor_name} onChange={(e) => setFilter({ ...filter, doctor_name: e.target.value })} style={s.input} />
              {filtersActive && <button onClick={clearFilters} style={s.linkBtn}>✕ Clear filters</button>}
            </div>
            </div>
            {selected.size > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
                <b>{selected.size} selected</b>
                <button onClick={bulkDelete}>🗑 Delete selected</button>
                <button
                  onClick={() => { setTrendIds([...selected]); setSelected(new Set()); setTab('trends'); toast('📈 Opened trends with your selection — review ticks, then Generate', 'ok') }}
                  disabled={selected.size < 2}
                  title={selected.size < 2 ? 'Tick at least 2 reports for trends' : 'Graph + AI explanation for the selected reports'}>
                  📈 Trends + AI explanation
                </button>
                <button onClick={() => setSelected(new Set())} style={s.linkBtn}>Clear selection</button>
              </div>
            )}
            {docsLoading ? <Skeleton rows={4} /> : (
              <div className="record-grid">
                {sorted.map((d) => (
                  <FileCard
                    key={d.id} d={d} icon={iconFor(d)[0]}
                    checked={selected.has(d.id)} onToggle={() => toggleSelect(d.id)}
                    onPreview={setDrawerDoc} onSummarize={summarize}
                    onApplied={load} toast={toast} reload={load}
                  />
                ))}
              </div>
            )}
            <PreviewDrawer doc={drawerDoc} onClose={() => setDrawerDoc(null)}
              onSummarize={(id) => { setDrawerDoc(null); summarize(id) }}
              onDelete={async (id) => { await api.delete(`/api/documents/${id}`); setDrawerDoc(null); toast('🗑 Deleted', 'ok'); load() }} />
            {!sorted.length && !docsLoading && (
              docs.length
                ? <EmptyState icon="🔍" title="Filters hide everything" hint={`No match among ${docs.length} file(s).`} action={<button onClick={clearFilters} style={s.linkBtn}>✕ Clear filters</button>} />
                : <EmptyState icon="📭" title="No documents yet" hint="Scan your first report, prescription, MRI or ECG above to get started." action={<button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>＋ Upload</button>} />
            )}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === 'trends' && (
        <div className="rise">
          <section style={{ ...s.card, ...s.tintBlue }}>
            <h3 className="sec-head"><span className="tile t-blue">📊</span> Trends & Analysis — {activeName}</h3>
            <ReportAnalytics docs={filtered} />
          </section>
          <section style={{ ...s.card, ...s.tintTeal }}>
            <h3 className="sec-head"><span className="tile t-teal">🔄</span> What Changed Since Last Report</h3>
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 10px' }}>
              Pick two lab reports for a side-by-side diff, or tick 2+ reports below for graphs + AI explanation.
              {trendIds.length >= 2 && <> Pre-selected <b>{trendIds.length}</b> from My Records — <button onClick={() => setTrendIds([])} style={s.linkBtn}>clear</button>.</>}
            </p>
            <CompareReports docs={docs} initialTrendIds={trendIds} language={lang} />
          </section>
        </div>
      )}

      {tab === 'rx' && (
        <section style={{ ...s.card, ...s.tintGreen }} className="rise">
          <h3 className="sec-head"><span className="tile t-green">💊</span> Doctor Notes & E-Prescriptions</h3>
          <VisitNotes role="patient" />
        </section>
      )}

      {tab === 'appts' && (
        <section style={{ ...s.card, ...s.tintTeal }} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">📅</span> Appointments</h3>
          <div className="empty" style={{ textAlign: 'left', marginBottom: 12 }}>
            🏥 Need a hospital specialist?{' '}
            <Link to="/find-doctors" style={{ fontWeight: 700 }}>Find Bombay, Apollo & Fortis doctors available for appointment →</Link>
          </div>
          <Appointments role="patient" doctors={links} />
        </section>
      )}

      {tab === 'vitals' && (
        <section style={{ ...s.card, ...s.tintRose }} className="rise">
          <h3 className="sec-head"><span className="tile t-rose">❤️</span> Vitals Tracker</h3>
          <VitalsTracker role="patient" />
        </section>
      )}

      {tab === 'vaccines' && (
        <section style={{ ...s.card, ...s.tintViolet }} className="rise">
          <h3 className="sec-head"><span className="tile t-violet">💉</span> Vaccination Tracker</h3>
          <VaccinationTracker role="patient" />
        </section>
      )}

      {tab === 'share' && (
        <div className="rise">
          <section style={{ ...s.card, ...s.tintBlue }}>
            <h3 className="sec-head"><span className="tile t-blue">🔗</span> Secure Share + QR</h3>
            <ShareManager />
          </section>
          <section style={{ ...s.card, ...s.tintAmber }}>
            <h3 className="sec-head"><span className="tile t-amber">🔐</span> Granular Consent — what doctors see</h3>
            <ConsentManager doctors={links} />
          </section>
        </div>
      )}

      {tab === 'chat' && (
        <section style={{ ...s.card, ...s.tintTeal }} className="rise">
          <h3 className="sec-head"><span className="tile t-teal">💬</span> Chat With Doctor</h3>
          {!links.length && (
            <div className="empty" style={{ textAlign: 'left', marginBottom: 12 }}>
              👨‍⚕️ No doctors linked yet — chat unlocks after you connect.
              Go to <button onClick={() => setTab('overview')} style={s.linkBtn}>Overview → My Doctors</button> and
              add your doctor with their 🪪 AH-XXXX ID.
            </div>
          )}
          <ChatBox role="patient" doctors={links} />
        </section>
      )}

      {tab === 'reviews' && (
        <section style={{ ...s.card, ...s.tintAmber }} className="rise">
          <h3 className="sec-head"><span className="tile t-amber">⭐</span> My Reviews</h3>
          <MyReviews role="patient" doctors={links} />
        </section>
      )}

      {tab === 'info' && (
        <section style={{ ...s.card, ...s.tintOrange }} className="rise">
          <h3 className="sec-head"><span className="tile t-orange">🧍</span> My Info</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="pill pill-info" title={user?.id}>🪪 Patient ID: {user?.health_id || shortId(user?.id)}</span>
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
      )}

      {tab === 'history' && (
        <section style={{ ...s.card, ...s.tintViolet }} className="rise">
          <h3 className="sec-head"><span className="tile t-violet">📋</span> Clinical History</h3>
          <p style={{ fontSize: 13, color: '#5d6b7a', margin: '0 0 10px' }}>
            Write your full clinical history in detail — conditions, surgeries, medicines,
            lifestyle and heredity. Your assigned doctors read this when treating you.
          </p>
          <MyClinicalHistory />
          <StructuredRecords />
        </section>
      )}
      <ToastHost />
    </DashboardLayout>
  )
}

function OnboardRow({ done, text, action, actionLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18 }}>{done ? '✅' : '⬜'}</span>
      <span style={{ flex: 1, textDecoration: done ? 'line-through' : 'none', color: done ? '#5d6b7a' : 'inherit' }}>{text}</span>
      {!done && <button onClick={action} style={{ whiteSpace: 'nowrap' }}>{actionLabel}</button>}
    </div>
  )
}

/* Compact file card for the single date-wise list: one kind pill +
   Preview/PDF/Delete actions; AI actions live behind ⋯. Categories only
   filter via the sidebar rail — never auto-shuffled. */
function FileCard({ d, icon, checked, onToggle, onPreview, onSummarize, onApplied, toast, reload }) {
  const [more, setMore] = useState(false)
  const kindMeta = d.report_kind && KIND_META[d.report_kind]
  return (
    <div className={`slide-card${checked ? ' picked' : ''}`}>
      <label className="slide-check">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${d.title}`} />
      </label>
      <div className="slide-top" onClick={() => onPreview(d)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onPreview(d)} title="Open preview">
        <span className="record-ico">{icon || '📄'}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="record-title">{d.title}</p>
          <p className="record-meta">{d.visit_date || 'Undated'}</p>
          {kindMeta && <span className="badge badge-info">{kindMeta.icon} {kindMeta.label}</span>}
        </div>
      </div>
      <div className="slide-actions">
        <button type="button" onClick={() => onPreview(d)} title="Preview">👁</button>
        <DocumentPdfButton doc={d} />
        <button type="button" onClick={() => setMore((m) => !m)} title="More actions" aria-expanded={more}>⋯</button>
      </div>
      {more && (
        <div className="slide-more">
          {onSummarize && <button type="button" onClick={() => onSummarize(d.id)}>✦ AI Summary</button>}
          <DocAIActions doc={d} onApplied={onApplied} />
          <button type="button" onClick={async () => { await api.delete(`/api/documents/${d.id}`); toast('🗑 Deleted', 'ok'); reload() }}>Delete</button>
        </div>
      )}
    </div>
  )
}

const s = {
  card: { border: '1px solid #e9edf2', borderRadius: 18, padding: 'clamp(14px,3vw,20px)', marginBottom: 0, background: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,.05)', minWidth: 0 },
  /* Home-theme washes — spread over s.card so sections stop looking all-white. */
  tintTeal: { background: 'linear-gradient(180deg,#f0fdfa 0%,#ffffff 62%)', borderColor: '#bfe6e0' },
  tintBlue: { background: 'linear-gradient(180deg,#eff6ff 0%,#ffffff 62%)', borderColor: '#bfdbfe' },
  tintViolet: { background: 'linear-gradient(180deg,#f5f3ff 0%,#ffffff 62%)', borderColor: '#ddd6fe' },
  tintRose: { background: 'linear-gradient(180deg,#fef2f2 0%,#ffffff 62%)', borderColor: '#fecaca' },
  tintAmber: { background: 'linear-gradient(180deg,#fffbeb 0%,#ffffff 62%)', borderColor: '#fde68a' },
  tintGreen: { background: 'linear-gradient(180deg,#f0fdf4 0%,#ffffff 62%)', borderColor: '#bbf7d0' },
  tintOrange: { background: 'linear-gradient(180deg,#fff7ed 0%,#ffffff 62%)', borderColor: '#fed7aa' },
  form: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  preview: { border: '1px dashed #d6dce4', borderRadius: 12, padding: 8, background: '#fbfcfd' },
  input: { padding: '10px 12px', fontSize: 14, minWidth: 0, maxWidth: '100%', borderRadius: 12 },
  primaryBtn: { padding: '9px 18px', background: '#101828', color: '#fff', border: '1px solid #101828', cursor: 'pointer', fontWeight: 650, alignSelf: 'flex-start', borderRadius: 12 },
  linkBtn: { background: 'none', border: 0, color: '#0a6e63', cursor: 'pointer', padding: 0, fontWeight: 700, boxShadow: 'none' },
  doc: { borderBottom: '1px solid #f0f3f7', padding: '8px 0' },
  summary: { background: '#fbfcfd', border: '1px solid #e9edf2', padding: 14, borderRadius: 12, marginTop: 10 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #f0f3f7', padding: '10px 0', flexWrap: 'wrap' },
  chip: { display: 'inline-block', background: '#eff8ff', border: '1px solid #b2ddff', borderRadius: 999, padding: '4px 12px', fontWeight: 600 },
  docChip: { display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e9edf2', borderRadius: 14, padding: '8px 14px 8px 8px', boxShadow: '0 1px 2px rgba(16,24,40,.05)' },
}
