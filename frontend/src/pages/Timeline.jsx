import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import ProfileSwitcher from '../components/ProfileSwitcher'
import { useProfile } from '../context/ProfileContext'
import { kindsForCategory, kindLabel, kindIcon } from '../reportKinds'

const KIND_STYLE = {
  document: { bg: '#eef2f7', border: '#c9d4e2', icon: '📄' },
  prescription: { bg: '#fef2f2', border: '#fecaca', icon: '💊' },
  visit: { bg: '#eef2f7', border: '#c9d4e2', icon: '🩺' },
  appointment: { bg: '#f0fdf4', border: '#bbf7d0', icon: '📅' },
}

export default function Timeline() {
  const { user } = useAuth()
  const { activeId } = useProfile()
  const [params, setParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [patients, setPatients] = useState([])
  const [kind, setKind] = useState('')
  const [category, setCategory] = useState('')
  const [reportKind, setReportKind] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const selected = params.get('patient') || ''

  useEffect(() => {
    if (user?.role === 'doctor') {
      api.get('/api/doctors/patients').then(({ data }) => {
        setPatients(data)
        if (data.length && !selected) setParams({ patient: data[0].patient_id })
      }).catch(console.error)
    }
  }, [])

  useEffect(() => {
    const q = user?.role === 'doctor' ? (selected ? { patient_id: selected } : null) : {}
    if (q === null) return
    if (category) q.category = category
    if (reportKind) q.report_kind = reportKind
    api.get('/api/timeline', { params: q }).then(({ data }) => setEvents(data)).catch(console.error)
  }, [selected, patients, category, reportKind])

  let lastYear = ''
  const visible = useMemo(() => {
    const needle = (q || '').toLowerCase()
    return events.filter((e) => {
      if (kind && e.kind !== kind) return false
      if (needle && !((e.title || '') + ' ' + (e.detail || '')).toLowerCase().includes(needle)) return false
      // Per-profile view: patients filter by active profile; doctors see all
      if (user?.role === 'patient' && activeId) {
        if (e.member_id) return e.member_id === activeId
        // Self-only docs have member=null; when a family profile is active, hide self items
        return false
      }
      if (user?.role === 'patient' && !activeId) return true
      return true
    })
  }, [events, kind, q, activeId, user])

  return (
    <div style={s.wrap}>
      <h2 style={{ margin: '0 0 4px' }}>📈 Health Timeline</h2>
      <p style={{ color: '#78716c', margin: '0 0 12px' }}>Every report, prescription and appointment — newest first. Click any card to expand.</p>
      {user?.role === 'patient' && <ProfileSwitcher compact />}
      <div className="toolbar-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search timeline…" style={s.input} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={s.input}>
          <option value="">All types</option>
          <option value="document">Reports</option>
          <option value="prescription">Prescriptions</option>
          <option value="visit">Visits</option>
          <option value="appointment">Appointments</option>
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setReportKind('') }} style={s.input}>
          <option value="">All categories</option>
          <option value="lab">Pathology Lab</option>
          <option value="imaging">Radiology / Imaging</option>
          <option value="cardiology">Cardiac</option>
          <option value="prescription">Prescription & Clinical</option>
          <option value="other">Other</option>
        </select>
        <select value={reportKind} onChange={(e) => setReportKind(e.target.value)} style={s.input}>
          <option value="">All kinds (X-Ray, CBC, MRI, TSH, LFT…)</option>
          {kindsForCategory(category).map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
        </select>
      </div>
      {user?.role === 'doctor' && (
        <select value={selected} onChange={(e) => setParams({ patient: e.target.value })} style={s.input}>
          <option value="">— Select patient —</option>
          {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
        </select>
      )}
      <div style={s.line}>
        {visible.map((e, i) => {
          const year = e.date.slice(0, 4)
          const showYear = year !== lastYear
          lastYear = year
          const st = KIND_STYLE[e.kind] || KIND_STYLE.document
          const [icon] = e.report_kind ? kindIcon(e.report_kind, [st.icon, '']) : [st.icon, '']
          const key = `${e.kind}-${e.id}-${i}`
          const open = openId === key
          return (
            <div key={i}>
              {showYear && <h3 style={s.year}>{year}</h3>}
              <div className={`tl-item${open ? ' open' : ''}`} onClick={() => setOpenId(open ? null : key)}
                style={{ background: open ? undefined : st.bg, borderColor: open ? undefined : st.border }}>
                <span style={s.date}>{e.date}</span>
                <b> {icon} {e.title}</b>
                {e.report_kind && <span className="pill pill-info" style={{ marginLeft: 8 }}>{kindLabel(e.report_kind)}</span>}
                {e.member && <span style={s.member}>{e.member}</span>}
                <span style={{ float: 'right', color: '#64748b' }}>{open ? '▴' : '▾'}</span>
                {(open || !e.detail || e.detail.length <= 160) && e.detail && <p style={{ margin: '6px 0 0' }}>{e.detail}</p>}
                {!open && e.detail && e.detail.length > 160 && <p style={{ margin: '6px 0 0' }}>{e.detail.slice(0, 160)}…</p>}
                {open && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="pill pill-info">{e.kind}</span>
                    {e.category && <span className="pill pill-info">{e.category}</span>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {!visible.length && <p>No events yet. <Link to="/patient">Upload a report</Link> to start your timeline.</p>}
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: 'clamp(12px,3vw,26px) clamp(12px,3vw,30px) 40px', minWidth: 0 },
  input: { padding: 8, fontSize: 14, minWidth: 'min(280px,100%)', maxWidth: '100%', marginBottom: 12 },
  line: { borderLeft: '3px solid #c9d4e2', paddingLeft: 16, marginTop: 12 },
  year: { color: '#1a2e45', margin: '16px 0 8px' },
  card: { border: '1px solid', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' },
  date: { background: '#1e3a5f', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, marginRight: 8 },
  member: { background: '#c9d4e2', borderRadius: 10, padding: '2px 10px', fontSize: 12, marginLeft: 8 },
}
