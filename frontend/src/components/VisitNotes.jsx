import { useEffect, useState } from 'react'
import api from '../api'

/* Doctor e-prescriptions / visit notes.
   Patient view: list mine. Doctor view: composer + list for selected patient. */
export default function VisitNotes({ role, patientId }) {
  const [notes, setNotes] = useState([])
  const [form, setForm] = useState({ note_type: 'prescription', title: '', content: '', medicines: '', visit_date: '', follow_up_date: '' })

  const load = async () => {
    const url = role === 'doctor' ? `/api/visits/patient/${patientId}` : '/api/visits/my'
    const { data } = await api.get(url)
    setNotes(data)
  }
  useEffect(() => { if (role === 'patient' || patientId) load().catch(console.error) }, [patientId])

  const create = async (e) => {
    e.preventDefault()
    const medicines = form.medicines.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, dosage, frequency, duration] = l.split('|').map((s) => (s || '').trim())
      return { name, dosage, frequency, duration }
    })
    await api.post('/api/visits', { ...form, patient_id: patientId, medicines,
      title: form.title || undefined, visit_date: form.visit_date || undefined,
      follow_up_date: form.follow_up_date || undefined })
    setForm({ note_type: 'prescription', title: '', content: '', medicines: '', visit_date: '', follow_up_date: '' })
    load()
  }

  return (
    <div>
      {role === 'doctor' && patientId && (
        <form onSubmit={create} style={s.form}>
          <select value={form.note_type} onChange={(e) => setForm({ ...form, note_type: e.target.value })} style={s.input}>
            <option value="prescription">E-Prescription</option>
            <option value="note">Visit note</option>
          </select>
          <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={s.input} />
          <textarea placeholder="Advice / findings" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required rows={3} style={s.input} />
          <textarea placeholder="Medicines — one per line: Name | Dosage | Frequency | Duration" value={form.medicines} onChange={(e) => setForm({ ...form, medicines: e.target.value })} rows={3} style={s.input} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} style={s.input} />
            <input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} style={s.input} title="Follow-up date" />
          </div>
          <button style={s.btn}>Send to patient</button>
        </form>
      )}
      {notes.map((n) => (
        <div key={n.id} style={s.note}>
          <b>[{n.note_type}] {n.title || '(no title)'}</b> <small>— Dr. {n.doctor_name} · {n.visit_date || n.created_at.slice(0, 10)}</small>
          <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{n.content}</p>
          {(n.medicines || []).map((m, i) => (
            <div key={i} style={s.med}>💊 <b>{m.name}</b>{m.dosage ? ` — ${m.dosage}` : ''}{m.frequency ? ` · ${m.frequency}` : ''}{m.duration ? ` × ${m.duration}` : ''}</div>
          ))}
          {n.follow_up_date && <div>Follow-up: {n.follow_up_date}</div>}
        </div>
      ))}
      {!notes.length && <p>No notes yet.</p>}
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  input: { padding: 8, fontSize: 14, fontFamily: 'inherit' },
  btn: { padding: '8px 14px', background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer', alignSelf: 'flex-start' },
  note: { border: '1px solid #f1f5f4', borderLeft: '4px solid #16a34a', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: '#fff' },
  med: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', margin: '4px 0', fontSize: 14 },
}
