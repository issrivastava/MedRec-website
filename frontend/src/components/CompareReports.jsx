import { useState } from 'react'
import api from '../api'

/* What-changed-since-last-report: pick a doc, see lab deltas vs previous. */
export default function CompareReports({ docs, patientId }) {
  const [docId, setDocId] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!docId) return
    setBusy(true)
    try {
      const params = { doc_id: docId }
      if (patientId) params.patient_id = patientId
      const { data } = await api.get('/api/compare/compare', { params })
      setResult(data)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={docId} onChange={(e) => setDocId(e.target.value)} style={s.input}>
          <option value="">— Pick latest report —</option>
          {(docs || []).map((d) => <option key={d.id} value={d.id}>{d.title} · {d.visit_date || d.created_at.slice(0, 10)}</option>)}
        </select>
        <button onClick={run} disabled={!docId || busy} style={s.btn}>{busy ? 'Comparing…' : 'What changed?'}</button>
      </div>
      {result && (
        <div style={s.card}>
          <b>{result.summary}</b>
          {result.previous && <div style={{ fontSize: 13, color: '#64748b' }}>vs {result.previous.title} ({result.previous.visit_date || 'undated'})</div>}
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
          {!result.changes?.length && <p>No overlapping lab values to compare.</p>}
          {result.vitals_note && <small style={{ color: '#64748b' }}>{result.vitals_note}</small>}
        </div>
      )}
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
