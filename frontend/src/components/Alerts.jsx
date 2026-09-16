import { useEffect, useState } from 'react'
import api from '../api'

/* Health alerts: patient acknowledges; doctor views + sets approved ranges. */
export function AlertsPanel() {
  const [alerts, setAlerts] = useState([])
  const load = async () => {
    const { data } = await api.get('/api/labs/alerts/my')
    setAlerts(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const open = alerts.filter((a) => !a.acknowledged)

  if (!alerts.length) return <p>No health alerts — lab values look fine. 🎉</p>
  return (
    <div>
      {open.length > 0 && <p style={{ color: '#115e59', fontWeight: 700 }}>⚠ {open.length} value(s) need attention — consider a checkup.</p>}
      {alerts.map((a) => (
        <div key={a.id} style={{ ...s.alert, opacity: a.acknowledged ? 0.6 : 1 }}>
          <span className={`pill ${a.flag === 'high' ? 'pill-high' : 'pill-low'}`}>{a.flag.toUpperCase()}</span>{' '}
          <b>{a.test_name}: {a.value} {a.unit || ''}</b>
          <p style={{ margin: '4px 0' }}>{a.message}</p>
          <small>{a.created_at.slice(0, 10)}</small>
          {!a.acknowledged && <div><button onClick={async () => { await api.patch(`/api/labs/alerts/${a.id}`); load() }}>Mark reviewed</button></div>}
        </div>
      ))}
    </div>
  )
}

export function LabRanges({ patientId }) {
  const [ranges, setRanges] = useState([])
  const [defs, setDefs] = useState([])
  const [form, setForm] = useState({ test_key: 'hemoglobin', min_value: '', max_value: '', unit: '' })

  const load = async () => {
    const [{ data: r }, { data: d }] = await Promise.all([
      api.get('/api/labs/lab-ranges', { params: { patient_id: patientId } }),
      api.get('/api/labs/lab-ranges/defaults'),
    ])
    setRanges(r); setDefs(d)
  }
  useEffect(() => { if (patientId) load().catch(console.error) }, [patientId])

  const save = async (e) => {
    e.preventDefault()
    await api.post('/api/labs/lab-ranges', {
      test_key: form.test_key, patient_id: patientId,
      min_value: form.min_value === '' ? null : +form.min_value,
      max_value: form.max_value === '' ? null : +form.max_value,
      unit: form.unit || undefined,
    })
    load()
  }

  return (
    <div>
      <b>Approved ranges for this patient</b>
      {ranges.map((r) => (
        <div key={r.id} style={s.row}><span>{r.display_name}: {r.min_value}–{r.max_value} {r.unit || ''} {r.patient_id ? '(custom)' : '(default)'}</span></div>
      ))}
      <form onSubmit={save} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={form.test_key} onChange={(e) => setForm({ ...form, test_key: e.target.value })} style={s.input}>
          {defs.map((d) => <option key={d.test_key} value={d.test_key}>{d.display_name}</option>)}
        </select>
        <input placeholder="Min" value={form.min_value} onChange={(e) => setForm({ ...form, min_value: e.target.value })} style={{ ...s.input, width: 80 }} />
        <input placeholder="Max" value={form.max_value} onChange={(e) => setForm({ ...form, max_value: e.target.value })} style={{ ...s.input, width: 80 }} />
        <input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ ...s.input, width: 90 }} />
        <button style={s.btn}>Set</button>
      </form>
    </div>
  )
}

const s = {
  alert: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 6, padding: 10, marginBottom: 8 },
  row: { borderBottom: '1px solid #eee', padding: '6px 0' },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer' },
}
