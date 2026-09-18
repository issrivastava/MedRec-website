import { useEffect, useState } from 'react'
import api from '../api'

const COMMON = ['BCG', 'Hepatitis B', 'OPV / IPV (Polio)', 'DPT', 'MMR', 'Typhoid', 'COVID-19', 'Influenza', 'Tetanus (Td/Tdap)', 'HPV']

/* Vaccination tracker: schedule + due badges + mark given. */
export default function VaccinationTracker({ patientId, role }) {
  const [rows, setRows] = useState([])
  const [due, setDue] = useState(null)
  const [form, setForm] = useState({ vaccine_name: '', dose_no: 1, due_date: '', given_date: '', provider: '' })

  const load = async () => {
    const params = patientId && role === 'doctor' ? { patient_id: patientId } : {}
    const [{ data }, { data: d }] = await Promise.all([
      api.get('/api/wellness/vaccinations', { params }),
      api.get('/api/wellness/vaccinations/due', { params }).catch(() => ({ data: null })),
    ])
    setRows(data); setDue(d)
  }
  useEffect(() => { load().catch(console.error) }, [patientId])

  const add = async (e) => {
    e.preventDefault()
    await api.post('/api/wellness/vaccinations', {
      ...form, dose_no: +form.dose_no || 1,
      due_date: form.due_date || undefined, given_date: form.given_date || undefined,
      status: form.given_date ? 'given' : 'due',
    })
    setForm({ vaccine_name: '', dose_no: 1, due_date: '', given_date: '', provider: '' })
    load()
  }

  const markGiven = async (v) => {
    await api.patch(`/api/wellness/vaccinations/${v.id}`, { ...v, status: 'given', given_date: new Date().toISOString().slice(0, 10) })
    load()
  }

  return (
    <div>
      {due && due.due_count > 0 && <div style={s.due}>⏰ {due.due_count} vaccination(s) due — {due.due.map((d) => d.vaccine).join(', ')}</div>}
      {role !== 'doctor' && (
        <form onSubmit={add} style={s.form}>
          <b>Add vaccination</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input list="vac-list" placeholder="Vaccine name" value={form.vaccine_name} onChange={(e) => setForm({ ...form, vaccine_name: e.target.value })} required style={s.input} />
            <datalist id="vac-list">{COMMON.map((c) => <option key={c} value={c} />)}</datalist>
            <input type="number" min={1} max={10} value={form.dose_no} onChange={(e) => setForm({ ...form, dose_no: e.target.value })} title="Dose no" style={{ ...s.input, width: 70 }} />
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} title="Due date" style={s.input} />
            <input type="date" value={form.given_date} onChange={(e) => setForm({ ...form, given_date: e.target.value })} title="Given date (optional)" style={s.input} />
            <input placeholder="Provider/hospital" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} style={s.input} />
            <button style={s.btn}>Save</button>
          </div>
        </form>
      )}
      {rows.map((v) => (
        <div key={v.id} style={s.row}>
          <span>💉 <b>{v.vaccine_name}</b> · Dose {v.dose_no} · <span style={v.status === 'given' ? { color: '#16a34a' } : { color: '#b45309', fontWeight: 700 }}>{v.status}</span>
            {v.due_date ? ` · due ${v.due_date}` : ''}{v.given_date ? ` · given ${v.given_date}` : ''}{v.provider ? ` · ${v.provider}` : ''}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            {role !== 'doctor' && v.status !== 'given' && <button onClick={() => markGiven(v)}>Mark given</button>}
            {role !== 'doctor' && <button onClick={async () => { await api.delete(`/api/wellness/vaccinations/${v.id}`); load() }}>Delete</button>}
          </span>
        </div>
      ))}
      {!rows.length && <p>No vaccinations tracked yet.</p>}
    </div>
  )
}

const s = {
  due: { background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontWeight: 600 },
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#7c3aed', color: '#fff', border: 0, cursor: 'pointer' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, border: '1px solid #f1f5f4', borderRadius: 10, padding: '8px 12px', marginBottom: 6, flexWrap: 'wrap', background: '#fff', fontSize: 14 },
}
