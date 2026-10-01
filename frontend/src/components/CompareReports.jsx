import { useMemo, useState } from 'react'
import api from '../api'
import { kindLabel, kindIcon, isComparableDoc, isPrescriptionDoc } from '../reportKinds'
import TrendCompare from './TrendCompare'

/* What-changed-since-last-report: lab trends only. Prescriptions / MRI /
 * ECG carry no numeric values, so they are excluded by default instead of
 * showing a confusing "no overlapping values" against a lab report. */
export default function CompareReports({ docs, patientId, initialTrendIds = [], language = 'en' }) {
  const [docId, setDocId] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const comparable = useMemo(() => (docs || []).filter(isComparableDoc), [docs])
  const options = showAll ? (docs || []) : comparable
  const selected = (docs || []).find((d) => d.id === docId)
  const selectedIsRx = selected ? isPrescriptionDoc(selected) : false

  const run = async () => {
    if (!docId) return
    setBusy(true); setErr('')
    try {
      const params = { doc_id: docId }
      if (patientId) params.patient_id = patientId
      const { data } = await api.get('/api/compare/compare', { params })
      setResult(data)
      if (data.comparable === false) setErr(data.summary)
    } catch (e) {
      setErr(e.response?.data?.detail || e.message)
      setResult(null)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#475569', margin: '0 0 8px' }}>
        Lab trends only — pick two lab reports of the same kind (e.g. two CBCs).
        Prescriptions, MRI/X-Ray/ECG have no numeric values to trend and are hidden by default.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <select value={docId} onChange={(e) => setDocId(e.target.value)} style={s.input}>
          <option value="">— Pick latest lab report —</option>
          {options.map((d) => {
            const [icon] = kindIcon(d.report_kind, [null, ''])
            const lbl = d.report_kind ? kindLabel(d.report_kind) : d.doc_type
            return <option key={d.id} value={d.id}>{icon ? `${icon} ` : ''}{d.title} · {lbl} · {d.visit_date || (d.created_at || '').slice(0, 10)}</option>
          })}
        </select>
        <button onClick={run} disabled={!docId || busy} style={s.btn}>{busy ? 'Comparing…' : 'What changed?'}</button>
        <label style={{ fontSize: 13, color: '#475569' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show prescriptions & scans too
        </label>
      </div>
      {!comparable.length && !showAll && (
        <p style={{ fontSize: 13, color: '#92400e' }}>No lab reports yet — upload a CBC / LFT / thyroid report to start trends. Prescriptions live under the Prescriptions tab.</p>
      )}
      {selectedIsRx && (
        <p style={{ fontSize: 13, color: '#92400e' }}>⚠️ “{selected.title}” is a prescription — it has no lab values. Pick a lab report instead.</p>
      )}
      {err && !result?.changes?.length && <p style={{ color: '#92400e' }}>⚠️ {err}</p>}
      {result && result.comparable !== false && (
        <div style={s.card}>
          <b>{result.summary}</b>
          {result.previous && <div style={{ fontSize: 13, color: '#64748b' }}>vs {result.previous.title} ({result.previous.report_kind ? kindLabel(result.previous.report_kind) : result.previous.doc_type} · {result.previous.visit_date || 'undated'})</div>}
          {(result.changes || []).map((c, i) => (
            <div key={i} style={s.row}>
              <span><b>{c.test}</b> {c.unit ? `(${c.unit})` : ''}</span>
              <span>
                {c.before ?? '—'} → <b>{c.after ?? '—'}</b>{' '}
                {c.direction === 'up' && <span style={{ color: '#dc2626' }}>▲ +{c.delta} ({c.pct}%)</span>}
                {c.direction === 'down' && <span style={{ color: '#16a34a' }}>▼ {c.delta} ({c.pct}%)</span>}
                {c.direction === 'new' && <span style={{ color: '#7c3aed' }}>new</span>}
                {c.direction === 'same' && <span style={{ color: '#64748b' }}>same</span>}
                {c.flag_after && c.flag_after !== 'normal' && <span style={s.flag}>{c.flag_after}</span>}
              </span>
            </div>
          ))}
          {!result.changes?.length && <p>No overlapping lab values — try two reports of the same kind (e.g. two CBCs).</p>}
          {result.vitals_note && <small style={{ color: '#64748b' }}>{result.vitals_note}</small>}
        </div>
      )}
      <TrendCompare docs={docs} patientId={patientId} initialIds={initialTrendIds} language={language} />
    </div>
  )
}

const s = {
  input: { padding: 8, fontSize: 14, minWidth: 220 },
  btn: { padding: '8px 14px', background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer' },
  card: { border: '1px solid #ccfbf1', background: '#f0fdfa', borderRadius: 10, padding: 12 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid #ccfbf1', fontSize: 14, flexWrap: 'wrap' },
  flag: { background: '#fee2e2', color: '#b91c1c', borderRadius: 6, padding: '0 6px', marginLeft: 6, fontSize: 12 },
}
