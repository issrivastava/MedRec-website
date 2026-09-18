import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { AI_TIMEOUT, downloadDocument, downloadExportPdf, openDocumentInline } from '../../api'
import { LANGS } from '../../langs'
import { Avatar } from '../../components/People'
import { kindsForCategory, kindLabel, kindIcon } from '../../reportKinds'
import { calcAge, shortId } from '../../utils'
import VisitNotes from '../../components/VisitNotes'
import VitalsTracker from '../../components/VitalsTracker'
import VaccinationTracker from '../../components/VaccinationTracker'
import CompareReports from '../../components/CompareReports'
import ChatBox from '../../components/ChatBox'
import { LabRanges } from '../../components/Alerts'
import { DocAIActions } from '../../components/SmartUpload'
import { VoiceReader } from '../../components/CareTools'
import { useDoctor } from './DoctorContext'

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

export default function PatientRecords() {
  const { patientId } = useParams()
  const { setSelected, patients } = useDoctor()
  const [info, setInfo] = useState(null)
  const [docs, setDocs] = useState([])
  const [alerts, setAlerts] = useState([])
  const [summary, setSummary] = useState(null)
  const [lang, setLang] = useState('en')
  const [kindFilter, setKindFilter] = useState({ category: '', report_kind: '' })
  const [sub, setSub] = useState('records') // records | vitals | vaccines | notes | chat | alerts | compare
  const [err, setErr] = useState('')

  useEffect(() => {
    if (patientId) setSelected(patientId)
  }, [patientId, setSelected])

  useEffect(() => {
    if (!patientId) return
    setErr('')
    const params = {}
    if (kindFilter.category) params.category = kindFilter.category
    if (kindFilter.report_kind) params.report_kind = kindFilter.report_kind
    Promise.all([
      api.get(`/api/doctors/patients/${patientId}/info`),
      api.get(`/api/doctors/patients/${patientId}/documents`, { params }),
      api.get(`/api/labs/patients/${patientId}/alerts`).catch(() => ({ data: [] })),
    ]).then(([{ data: i }, { data: d }, { data: a }]) => { setInfo(i); setDocs(d); setAlerts(a) })
      .catch((e) => setErr(e.response?.data?.detail || 'Could not load patient records'))
  }, [patientId, kindFilter])

  const summarize = async (id) => {
    setSummary({ loading: true })
    try {
      const { data } = await api.post(`/api/documents/${id}/summarize`, null, { params: { language: lang }, timeout: AI_TIMEOUT })
      setSummary(data)
    } catch (e) {
      setSummary({ error: e.code === 'ECONNABORTED' ? 'AI is still working (cold start can take 1–2 min) — please try again in a minute.' : (e.response?.data?.detail || 'Could not generate summary.') })
    }
  }

  const name = info?.user?.full_name || (patients.find((p) => p.patient_id === patientId) || {}).patient_name || 'Patient'
  const openAlerts = alerts.filter((a) => !a.acknowledged)

  const tabs = [
    { key: 'records', label: `🗂️ Records (${docs.length})` },
    { key: 'alerts', label: `⚠️ Lab Alerts (${openAlerts.length})` },
    { key: 'vitals', label: '❤️ Vitals' },
    { key: 'vaccines', label: '💉 Vaccines' },
    { key: 'notes', label: '✍️ Notes / Rx' },
    { key: 'compare', label: '🔄 What Changed' },
    { key: 'chat', label: '💬 Chat' },
  ]

  return (
    <div className="rise">
      <p><Link to="/doctor/patients">← All patients</Link></p>
      {err && <p style={{ color: 'red' }}>{err}</p>}
      {info ? (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-green">🧍</span> {name}</h3>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <Avatar seed={info.user.id} name={info.user.full_name} size={56} />
            <p style={{ margin: 0 }}>Email: {info.user.email}<br />🩸 {info.profile?.blood_group || '—'} | 🎂 {info.profile?.dob || '—'}</p>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => downloadExportPdf(patientId)}>⬇ Export PDF</button>
              <label style={{ fontSize: 13 }}>AI lang: <select value={lang} onChange={(e) => setLang(e.target.value)} style={s.input}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select></label>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="pill pill-info">🪪 {shortId(info.user.id)}</span>
            <span className="pill pill-ok">🎂 {(() => { const a = calcAge(info.profile?.dob); return a != null ? `${a} yrs` : '—' })()}</span>
            {info.profile?.gender && <span className="pill pill-ok">👤 {info.profile.gender}</span>}
          </div>
          <p>Allergies: {info.profile?.allergies || '—'} | Chronic: {info.profile?.chronic_conditions || '—'}</p>
          <p>Emergency: {info.profile?.emergency_contact || '—'} | Phone: {info.profile?.phone || '—'}</p>
          <details style={s.historyBox}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>📋 Clinical history (written by patient)</summary>
            <ClinicalHistoryRead profile={info.profile} />
          </details>
        </section>
      ) : !err && <div className="empty">Loading patient…</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            style={sub === t.key ? s.tabActive : s.tab}
          >{t.label}</button>
        ))}
      </div>

      {sub === 'records' && (
        <section style={s.card}>
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
          {docs.slice(0, 20).map((d) => (
            <div key={d.id} className="doc-row">
              <span className={`tile ${kindIcon(d.report_kind, ['📄', 't-amber'])[1]}`}>{kindIcon(d.report_kind, ['📄', 't-amber'])[0]}</span>
              <div className="grow">
                <b>{d.title}</b> <span className="pill pill-info">{kindLabel(d.report_kind) || d.doc_type}</span>
                <div style={{ fontSize: 13, color: '#5d6b7a' }}>{d.visit_date || 'Undated'} — {d.doctor_name || '—'}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => summarize(d.id)} disabled={(d.file_size || 0) === 0}>AI summary</button>
                  <DocAIActions doc={d} canApply={false} />
                  {(d.file_mimetype || '').startsWith('video')
                    ? <button onClick={() => openDocumentInline(d.id)}>▶ Play</button>
                    : <button onClick={() => downloadDocument(d.id, d.title)}>⬇ PDF</button>}
                </div>
              </div>
            </div>
          ))}
          {!docs.length && <div className="empty">No records for this patient yet.</div>}
          {summary && (
            <div style={s.summary}>
              <b>{summary.loading ? 'AI report (working…)' : `AI report (${summary.model_used || ''}, ${summary.language || lang})`}:</b>
              {!summary.loading && summary.summary_text && <VoiceReader text={summary.summary_text} />}
              {summary.loading ? <p>Generating… (cold start can take 1–2 min — please wait, don't click again)</p>
                : summary.error ? <p style={{ color: '#b91c1c' }}>⚠️ {summary.error}</p>
                  : <p style={{ whiteSpace: 'pre-wrap' }}>{summary.summary_text}</p>}
            </div>
          )}
        </section>
      )}

      {sub === 'alerts' && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-rose">⚠️</span> Lab Alerts — {name}</h3>
          {alerts.map((a) => (
            <div key={a.id} style={s.alert}><b>{a.test_name}: {a.value} {a.unit || ''} ({a.flag})</b> — {a.message}</div>
          ))}
          {!alerts.length && <p>No alerts for this patient. 🎉</p>}
          <div style={{ marginTop: 12 }}><LabRanges patientId={patientId} /></div>
        </section>
      )}

      {sub === 'vitals' && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-rose">❤️</span> Vitals — {name}</h3>
          <VitalsTracker role="doctor" patientId={patientId} />
        </section>
      )}

      {sub === 'vaccines' && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-violet">💉</span> Vaccinations — {name}</h3>
          <VaccinationTracker role="doctor" patientId={patientId} />
        </section>
      )}

      {sub === 'notes' && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-violet">✍️</span> Visit Notes / E-Prescription — {name}</h3>
          <VisitNotes role="doctor" patientId={patientId} />
        </section>
      )}

      {sub === 'compare' && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-teal">🔄</span> What Changed — {name}</h3>
          <CompareReports docs={docs} patientId={patientId} />
        </section>
      )}

      {sub === 'chat' && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-teal">💬</span> Chat — {name}</h3>
          <ChatBox role="doctor" patientId={patientId} />
        </section>
      )}
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)', minWidth: 0 },
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  historyBox: { background: '#f8f9fa', border: '1px solid #dfe3e8', borderRadius: 8, padding: 10, marginTop: 8 },
  summary: { background: '#eef2f7', border: '1px solid #c9d4e2', padding: 12, borderRadius: 8, marginTop: 10 },
  alert: { background: '#eef2f7', border: '1px solid #c9d4e2', borderRadius: 8, padding: 8, marginBottom: 6 },
  tab: { padding: '8px 12px', cursor: 'pointer', background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 8 },
  tabActive: { padding: '8px 12px', cursor: 'pointer', background: '#1e3a5f', color: '#fff', border: '1px solid #1e3a5f', fontWeight: 700, borderRadius: 8 },
}
