import { useEffect, useState } from 'react'
import api from '../api'

/* Patient family profiles: CRUD + notify parent of current list. */
export default function FamilyManager({ onChange }) {
  const [members, setMembers] = useState([])
  const [form, setForm] = useState({ name: '', relation: '', dob: '', gender: '', blood_group: '', phone: '', allergies: '', chronic_conditions: '' })
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data } = await api.get('/api/family')
    setMembers(data)
    onChange && onChange(data)
  }
  useEffect(() => { load().catch(console.error) }, [])

  const submit = async (e) => {
    e.preventDefault()
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || undefined]))
    if (editing) {
      await api.put(`/api/family/${editing}`, { ...payload, name: payload.name || 'Member' })
    } else {
      await api.post('/api/family', payload)
    }
    setForm({ name: '', relation: '', dob: '', gender: '', blood_group: '', phone: '', allergies: '', chronic_conditions: '' })
    setEditing(null)
    load()
  }

  return (
    <div>
      <form onSubmit={submit} style={s.form}>
        <div style={s.grid}>
          <input placeholder="Name*" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={s.input} />
          <input placeholder="Relation (son, mother…)" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} style={s.input} />
          <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} style={s.input} />
          <input placeholder="Blood group" value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} style={s.input} />
        </div>
        <button style={s.btn}>{editing ? 'Save' : 'Add member'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', relation: '', dob: '', gender: '', blood_group: '', phone: '', allergies: '', chronic_conditions: '' }) }}>Cancel</button>}
      </form>
      {members.map((m) => (
        <div key={m.id} style={s.row}>
          <span><b>{m.name}</b> {m.relation ? `(${m.relation})` : ''} {m.blood_group || ''}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setEditing(m.id); setForm({ name: m.name || '', relation: m.relation || '', dob: m.dob || '', gender: m.gender || '', blood_group: m.blood_group || '', phone: m.phone || '', allergies: m.allergies || '', chronic_conditions: m.chronic_conditions || '' }) }}>Edit</button>
            <button onClick={async () => { await api.delete(`/api/family/${m.id}`); load() }}>Remove</button>
          </span>
        </div>
      ))}
      {!members.length && <p>No family members yet — add kids, parents or elders you manage.</p>}
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer', alignSelf: 'flex-start' },
  row: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '8px 0' },
}
