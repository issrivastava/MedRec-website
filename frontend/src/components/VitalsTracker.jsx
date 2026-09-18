import { useEffect, useState } from 'react'
import api from '../api'

const TYPES = [
  ['bp', 'BP (mmHg)'], ['sugar', 'Sugar (mg/dL)'], ['weight', 'Weight (kg)'],
  ['bmi', 'BMI'], ['temp', 'Temp (°F)'], ['spo2', 'SpO2 (%)'], ['pulse', 'Pulse (bpm)'],
]

/* Vitals tracker: log + latest + mini trend bars (no chart lib needed). */
export default function VitalsTracker({ patientId, role }) {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [form, setForm] = useState({ vital_type: 'bp', systolic: '', diastolic: '', value: '', measured_at: '' })

  const load = async () => {
    const params = patientId && role === 'doctor' ? { patient_id: patientId } : {}
    const [{ data }, { data: s }] = await Promise.all([
      api.get('/api/wellness/vitals', { params }),
      api.get('/api/wellness/vitals/summary', { params }).catch(() => ({ data: null })),
    ])
    setRows(data); setSummary(s)
  }
  useEffect(() => { load().catch(console.error) }, [patientId])

  const add = async (e) => {
    e.preventDefault()
    const payload = { vital_type: form.vital_type, measured_at: form.measured_at || undefined }
    if (form.vital_type === 'bp') payload.systolic = +form.systolic, payload.diastolic = +form.diastolic
    else payload.value = +form.value
    await api.post('/api/wellness/vitals', payload)
    setForm({ vital_type: 'bp', systolic: '', diastolic: '', value: '', measured_at: '' })
    load()
  }

  const trend = (key) => {
    const pts = summary?.trends?.[key] || []
    if (!pts.length) return null
    const vals = pts.map((p) => p.value ?? p.systolic ?? 0).filter(Boolean)
    const max = Math.max(...vals, 1)
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36, marginTop: 6 }}>
        {pts.slice(-20).map((p, i) => {
          const v = p.value ?? p.systolic ?? 0
          return <div key={i} title={`${p.date}: ${p.value ?? `${p.systolic}/${p.diastolic}`}`} style={{ width: 8, height: Math.max(4, (v / max) * 34), background: '#0e7490', borderRadius: 2 }} />
        })}
      </div>
    )
  }

  return (
    <div>
      {summary?.hints?.map((h, i) => <div key={i} style={s.hint}>{h}</div>)}
      {summary && (
        <div style={s.grid}>
          {Object.entries(summary.latest || {}).map(([k, v]) => (
            <div key={k} style={s.card}>
              <b style={{ textTransform: 'uppercase', fontSize: 12 }}>{k}</b>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {k === 'bp' ? `${v.systolic}/${v.diastolic}` : v.value} <small style={{ fontWeight: 400 }}>{v.unit}</small>
              </div>
              <small style={{ color: '#64748b' }}>{v.date}</small>
              {trend(k)}
            </div>
          ))}
          {!Object.keys(summary.latest || {}).length && <p>No vitals yet — log your first reading below.</p>}
        </div>
      )}
      {role !== 'doctor' && (
        <form onSubmit={add} style={s.form}>
          <b>Log vital</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={form.vital_type} onChange={(e) => setForm({ ...form, vital_type: e.target.value })} style={s.input}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {form.vital_type === 'bp' ? (<>
              <input placeholder="Systolic" type="number" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} required style={s.input} />
              <input placeholder="Diastolic" type="number" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} required style={s.input} />
            </>) : (
              <input placeholder="Value" type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required style={s.input} />
            )}
            <input type="date" value={form.measured_at} onChange={(e) => setForm({ ...form, measured_at: e.target.value })} style={s.input} />
            <button style={s.btn}>Save</button>
          </div>
        </form>
      )}
      <details style={{ marginTop: 8 }}>
        <summary>History ({rows.length})</summary>
        {rows.slice(0, 30).map((r) => (
          <div key={r.id} style={s.row}>
            <span><b>{r.vital_type}</b> — {r.vital_type === 'bp' ? `${r.systolic}/${r.diastolic} ${r.unit}` : `${r.value} ${r.unit || ''}`} · {r.measured_at}</span>
            {role !== 'doctor' && <button onClick={async () => { await api.delete(`/api/wellness/vitals/${r.id}`); load() }}>Delete</button>}
          </div>
        ))}
      </details>
    </div>
  )
}

const s = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 10 },
  card: { border: '1px solid #cffafe', background: '#ecfeff', borderRadius: 10, padding: 10 },
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#0e7490', color: '#fff', border: 0, cursor: 'pointer' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 14 },
  hint: { background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 10px', marginBottom: 6, fontSize: 13 },
}
