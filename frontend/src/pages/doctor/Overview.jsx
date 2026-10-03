import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { AI_TIMEOUT } from '../../api'
import { Avatar } from '../../components/People'
import Appointments from '../../components/Appointments'
import { DocAIActions } from '../../components/SmartUpload'
import { DocumentPdfButton, ExportRecordButton, SummaryDownloadButton } from '../../components/PdfButtons'
import { VoiceReader } from '../../components/CareTools'
import { kindsForCategory, kindLabel, kindIcon } from '../../reportKinds'
import { calcAge } from '../../utils'
import { useDoctor } from './DoctorContext'

/* Focused doctor workspace: Appointments | Patients & details | Reports.
   Minimal classic styling — plain cards, no gradients. */
export default function Overview() {
  const { patients, selectedId, setSelected, appts, loading, reload } = useDoctor()
  const [tab, setTab] = useState('appointments')
  const [q, setQ] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [info, setInfo] = useState(null)
  const [docs, setDocs] = useState([])
  const [kindFilter, setKindFilter] = useState({ category: '', report_kind: '' })
  const [summary, setSummary] = useState(null)
  const [lang, setLang] = useState('en')

  const booked = useMemo(() => (appts || []).filter((a) => a.status === 'booked'), [appts])
  const today = new Date().toISOString().slice(0, 10)
  const todays = useMemo(() => booked.filter((a) => a.date === today), [booked, today])
  const selected = patients.find((p) => p.patient_id === selectedId) || null

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return patients
    return patients.filter((p) =>
      (p.patient_name || '').toLowerCase().includes(needle) ||
      (p.patient_email || '').toLowerCase().includes(needle))
  }, [patients, q])

  // Selected patient details + reports
  useEffect(() => {
    if (!selectedId) { setInfo(null); setDocs([]); return }
    const params = {}
    if (kindFilter.category) params.category = kindFilter.category
    if (kindFilter.report_kind) params.report_kind = kindFilter.report_kind
    Promise.all([
      api.get(`/api/doctors/patients/${selectedId}/info`).catch(() => ({ data: null })),
      api.get(`/api/doctors/patients/${selectedId}/documents`, { params }).catch(() => ({ data: [] })),
    ]).then(([{ data: i }, { data: d }]) => { setInfo(i); setDocs(d || []) }).catch(console.error)
  }, [selectedId, kindFilter])

  const linkPatient = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      await api.post('/api/assignments', { email: addEmail })
      setAddEmail('')
      setMsg('Patient linked.')
      reload()
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Could not link patient')
    }
  }

  const summarize = async (id) => {
    setSummary({ loading: true })
    try {
      const { data } = await api.post(`/api/documents/${id}/summarize`, null, { params: { language: lang }, timeout: AI_TIMEOUT })
      setSummary(data)
    } catch (err) {
      setSummary({ error: err.response?.data?.detail || 'Could not generate summary.' })
    }
  }

  if (loading) return <div className="card">Loading practice…</div>

  return (
    <div>
      <div className="stat-grid">
        <div className="gstat g-blue"><div className="num">{patients.length}</div><div className="lbl">Patients</div><div className="sub">Linked to your practice</div><span className="big-icon">🧑‍🤝‍🧑</span></div>
        <div className="gstat g-teal"><div className="num">{todays.length}</div><div className="lbl">Today</div><div className="sub">Appointments due</div><span className="big-icon">📅</span></div>
        <div className="gstat g-violet"><div className="num">{booked.length}</div><div className="lbl">Booked</div><div className="sub">Upcoming visits</div><span className="big-icon">✍️</span></div>
      </div>

      <div className="tabs">
        {[
          ['appointments', `Appointments${todays.length ? ` (${todays.length} today)` : ''}`],
          ['patients', `Patients (${patients.length})`],
          ['reports', 'Reports'],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'tab-active' : 'tab'}>{label}</button>
        ))}
      </div>

      {tab === 'appointments' && (
        <div>
          <section className="card">
            <h3>Today — {today}</h3>
            {!todays.length && <p className="muted">No appointments today.</p>}
            {todays.map((a) => (
              <div key={a.id} className="row">
                <span className="row-main">
                  <Avatar seed={a.patient_id} name={a.patient_name} size={32} />
                  <span><b>{a.start_time}</b> — {a.patient_name}{a.reason ? ` · ${a.reason}` : ''}</span>
                </span>
                <span className="pill pill-info">{a.status}</span>
              </div>
            ))}
            {selected && (
              <p style={{ marginBottom: 0 }}>
                <button onClick={() => setTab('patients')}>View {selected.patient_name} →</button>
              </p>
            )}
          </section>
          <section className="card">
            <h3>Schedule & availability</h3>
            <Appointments role="doctor" />
          </section>
        </div>
      )}

      {tab === 'patients' && (
        <div>
          <section className="card">
            <h3>Patients ({filtered.length})</h3>
            <form onSubmit={linkPatient} className="inline-form">
              <input placeholder="Patient email to link" value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)} />
              <button className="btn-primary">Link</button>
              {msg && <span className="muted">{msg}</span>}
            </form>
            <div className="toolbar-row">
              <input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!filtered.length && <p className="muted">{patients.length ? 'No matches.' : 'No patients linked yet — link one by email above.'}</p>}
            <div className="card-grid">
              {filtered.map((p) => (
                <div key={p.patient_id} className={selectedId === p.patient_id ? 'pick-card selected' : 'pick-card'}>
                  <Avatar seed={p.patient_id} name={p.patient_name} size={40} />
                  <div className="grow">
                    <b>{p.patient_name}</b><br />
                    <small className="muted">{p.patient_email}</small>
                    <div className="btn-row">
                      <button onClick={() => { setSelected(p.patient_id); setTab('reports') }}>Reports →</button>
                      <button onClick={() => setSelected(p.patient_id)}>
                        {selectedId === p.patient_id ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h3>Patient details {selected ? `— ${selected.patient_name}` : ''}</h3>
            {!selected && <p className="muted">Select a patient above to see details.</p>}
            {selected && !info && <p className="muted">Loading…</p>}
            {selected && info && (
              <div>
                <div className="detail-head">
                  <Avatar seed={info.user.id} name={info.user.full_name} size={52} />
                  <div>
                    <b>{info.user.full_name}</b><br />
                    <small className="muted">{info.user.email}</small>
                  </div>
                  <span className="btn-row" style={{ marginLeft: 'auto' }}>
                    <ExportRecordButton patientId={selectedId} label="Export PDF" />
                    <Link to={`/doctor/patients/${selectedId}`}><button>Full records →</button></Link>
                  </span>
                </div>
                <p className="muted">
                  Age {(() => { const a = calcAge(info.profile?.dob); return a != null ? `${a} yrs` : '—' })()} ·{' '}
                  {info.profile?.gender || '—'} · {info.profile?.blood_group || '—'} · {info.profile?.phone || '—'}
                </p>
                <p>Allergies: {info.profile?.allergies || '—'}<br />Chronic: {info.profile?.chronic_conditions || '—'}<br />Emergency: {info.profile?.emergency_contact || '—'}</p>
                <details>
                  <summary>Clinical history</summary>
                  <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                    {[info.profile?.past_illnesses, info.profile?.surgeries, info.profile?.current_medications].filter(Boolean).join('\n\n') || 'No clinical history written yet.'}
                  </p>
                </details>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'reports' && (
        <section className="card">
          <div className="row-head">
            <h3 style={{ margin: 0 }}>Reports{selected ? ` — ${selected.patient_name}` : ''} ({docs.length})</h3>
            {selectedId && <ExportRecordButton patientId={selectedId} label="Export PDF" />}
          </div>
          {!selectedId && <p className="muted">Select a patient in the Patients tab first.</p>}
          {selectedId && (
            <>
              <div className="toolbar-row">
                <select value={kindFilter.category}
                  onChange={(e) => setKindFilter({ category: e.target.value, report_kind: '' })}>
                  <option value="">All categories</option>
                  <option value="lab">Lab</option>
                  <option value="imaging">Imaging</option>
                  <option value="cardiology">Cardiac</option>
                  <option value="prescription">Prescription</option>
                  <option value="other">Other</option>
                </select>
                <select value={kindFilter.report_kind}
                  onChange={(e) => setKindFilter((f) => ({ ...f, report_kind: e.target.value }))}>
                  <option value="">All kinds</option>
                  {kindsForCategory(kindFilter.category).map((k) => (
                    <option key={k.key} value={k.key}>{k.icon} {k.label}</option>
                  ))}
                </select>
                <label className="muted">AI language:
                  <select value={lang} onChange={(e) => setLang(e.target.value)}>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
              {!docs.length && <p className="muted">No reports for this patient yet.</p>}
              {docs.slice(0, 20).map((d) => (
                <div key={d.id} className="doc-row">
                  <span className="doc-icon">{kindIcon(d.report_kind, ['—', ''])[0]}</span>
                  <div className="grow">
                    <b>{d.title}</b> <span className="pill pill-info">{kindLabel(d.report_kind) || d.doc_type}</span>
                    <div className="muted small">{d.visit_date || 'Undated'} — {d.doctor_name || '—'}</div>
                    <div className="btn-row">
                      <button onClick={() => summarize(d.id)} disabled={(d.file_size || 0) === 0}>AI summary</button>
                      <DocAIActions doc={d} canApply={false} />
                      <DocumentPdfButton doc={d} />
                    </div>
                  </div>
                </div>
              ))}
              {summary && (
                <div className="summary-box">
                  <b>{summary.loading ? 'AI report (working…)' : `AI report (${summary.model_used || ''})`}:</b>
                  {!summary.loading && summary.summary_text && <VoiceReader text={summary.summary_text} />}
                  {summary.loading ? <p>Generating…</p>
                    : summary.error ? <p className="error">{summary.error}</p>
                      : <><p style={{ whiteSpace: 'pre-wrap' }}>{summary.summary_text}</p>
                        <SummaryDownloadButton title="MedRec summary" text={summary.summary_text} /></>}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
