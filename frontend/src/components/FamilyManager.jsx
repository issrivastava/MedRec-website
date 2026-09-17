import { useEffect, useState } from 'react'
import api from '../api'

/* Patient family profiles: CRUD + notify parent of current list. */
export default function FamilyManager({ onChange }) {
  const [members, setMembers] = useState([])
  const [form, setForm] = useState({ name: '', relation: '', dob: '', gender: '', blood_group: '', phone: '', allergies: '', chronic_conditions: '', notes: '' })
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data } = await api.get('/api/family')
    setMembers(data)
    onChange && onChange(data)
  }
  useEffect(() => { load().catch(console.error) }, [])

  const reset = () => setForm({ name: '', relation: '', dob: '', gender: '', blood_group: '', phone: '', allergies: '', chronic_conditions: '', notes: '' })

  const submit = async (e) => {
    e.preventDefault()
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || undefined]))
    if (editing) {
      await api.put(`/api/family/${editing}`, { ...payload, name: payload.name || 'Member' })
    } else {
      await api.post('/api/family', payload)
    }
    reset()
    setEditing(null)
    load()
  }

  const startEdit = (m) => {
    setEditing(m.id)
    setForm({ name: m.name || '', relation: m.relation || '', dob: m.dob || '', gender: m.gender || '', blood_group: m.blood_group || '', phone: m.phone || '', allergies: m.allergies || '', chronic_conditions: m.chronic_conditions || '', notes: m.notes || '' })
  }

  return (
    <div>
      <form onSubmit={submit} style={s.form}>
        <div style={s.grid}>
          <input placeholder="Name*" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={s.input} />
          <input placeholder="Relation (son, mother…)" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} style={s.input} />
          <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} style={s.input} title="Date of birth" />
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} style={s.input}>
            <option value="">Gender…</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
          </select>
          <input placeholder="Blood group" value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} style={s.input} />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={s.input} />
          <input placeholder="Allergies" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} style={s.input} />
          <input placeholder="Chronic conditions" value={form.chronic_conditions} onChange={(e) => setForm({ ...form, chronic_conditions: e.target.value })} style={s.input} />
        </div>
        <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={s.input} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={s.btn}>{editing ? 'Save' : 'Add member'}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); reset() }}>Cancel</button>}
        </div>
      </form>
      {members.map((m) => (
        <div key={m.id} style={s.row}>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <b>{m.name}</b> {m.relation ? `(${m.relation})` : ''} {m.blood_group || ''}
            {(m.allergies || m.chronic_conditions) && (
              <small style={{ display: 'block', color: '#5d6b7a' }}>
                {[m.allergies && `Allergies: ${m.allergies}`, m.chronic_conditions && `Chronic: ${m.chronic_conditions}`].filter(Boolean).join(' · ')}
              </small>
            )}
          </span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => startEdit(m)}>Edit</button>
            <button onClick={async () => { await api.delete(`/api/family/${m.id}`); load() }}>Remove</button>
          </span>
        </div>
      ))}
      {!members.length && <p>No family members yet — add kids, parents or elders you manage.</p>}
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, minWidth: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 8 },
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', alignSelf: 'flex-start', maxWidth: '100%' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #eee', padding: '8px 0' },
}
