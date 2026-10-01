import { useEffect, useState } from 'react'
import api from '../api'

export default function StaffDirectory() {
  const [q, setQ] = useState('')
  const [phone, setPhone] = useState('')
  const [condition, setCondition] = useState('')
  const [results, setResults] = useState([])
  const [count, setCount] = useState(0)
  const [dups, setDups] = useState(null)
  const [doctors, setDoctors] = useState([])
  const [dept, setDept] = useState('')
  const [reg, setReg] = useState({ full_name: '', email: '', phone: '', gender: '', address: '', emergency_contact: '', abha_id: '', abha_address: '' })

  const search = async () => {
    const { data } = await api.get('/api/directory/patients/search', { params: { q: q || undefined, phone: phone || undefined, condition: condition || undefined } })
    setResults(data.results)
    setCount(data.count)
  }
  const loadDoctors = async () => {
    const { data } = await api.get('/api/directory/doctors', { params: dept ? { department: dept } : {} })
    setDoctors(data)
  }
  useEffect(() => { search().catch(console.error); loadDoctors().catch(console.error) }, [])

  const archive = async (id, archived) => {
    await api.patch(`/api/directory/patients/${id}/archive`, { archived })
    search()
  }
  const loadDups = async () => {
    const { data } = await api.get('/api/directory/patients/duplicates')
    setDups(data)
  }
  const register = async (e) => {
    e.preventDefault()
    const { data } = await api.post('/api/directory/patients/register', reg)
    alert(`Registered ${data.full_name} (${data.health_id})${data.generated_password ? ` — temp password: ${data.generated_password}` : ''}`)
    setReg({ full_name: '', email: '', phone: '', gender: '', address: '', emergency_contact: '', abha_id: '', abha_address: '' })
    search()
  }

  return (
    <div style={s.wrap}>
      <h2>Front Desk — Patient Directory</h2>
      <section style={s.card}>
        <h3>Search &amp; filter (name / phone / condition)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} style={s.input} />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={s.input} />
          <input placeholder="Condition (e.g. diabetes)" value={condition} onChange={(e) => setCondition(e.target.value)} style={s.input} />
          <button onClick={search} style={s.btn}>Search</button>
          <button onClick={loadDups} style={s.btn2}>Find duplicates</button>
        </div>
        <div style={{ marginTop: 8 }}>{count} patient(s)</div>
        {results.map((p) => (
          <div key={p.id} style={s.row}>
            <span><b>{p.full_name}</b> · {p.health_id} · {p.phone || 'no phone'}{p.profile?.chronic_conditions ? ` · ${p.profile.chronic_conditions}` : ''}{p.is_archived ? ' · 📦 archived' : ''}</span>
            <button onClick={() => archive(p.id, !p.is_archived)}>{p.is_archived ? 'Restore' : 'Archive'}</button>
          </div>
        ))}
      </section>
      {dups && (
        <section style={s.card}>
          <h3>Possible duplicates ({dups.count})</h3>
          {dups.groups.map((g, i) => (
            <div key={i} style={{ marginBottom: 8, borderBottom: '1px solid #eee', paddingBottom: 6 }}>
              <small>{g.reason}: {g.phone || g.name}</small>
              {g.patients.map((p) => <div key={p.id}>• {p.full_name} · {p.health_id} · {p.phone} · {p.email}</div>)}
            </div>
          ))}
          {!dups.groups.length && <p>No duplicates found.</p>}
        </section>
      )}
      <section style={s.card}>
        <h3>Register patient (walk-in)</h3>
        <form onSubmit={register} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input required placeholder="Full name" value={reg.full_name} onChange={(e) => setReg({ ...reg, full_name: e.target.value })} style={s.input} />
          <input required placeholder="Email" type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} style={s.input} />
          <input placeholder="Phone" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} style={s.input} />
          <input placeholder="Gender" value={reg.gender} onChange={(e) => setReg({ ...reg, gender: e.target.value })} style={s.input} />
          <input placeholder="Address" value={reg.address} onChange={(e) => setReg({ ...reg, address: e.target.value })} style={s.input} />
          <input placeholder="Emergency contact" value={reg.emergency_contact} onChange={(e) => setReg({ ...reg, emergency_contact: e.target.value })} style={s.input} />
          <input placeholder="ABHA ID" value={reg.abha_id} onChange={(e) => setReg({ ...reg, abha_id: e.target.value })} style={s.input} />
          <input placeholder="ABHA address" value={reg.abha_address} onChange={(e) => setReg({ ...reg, abha_address: e.target.value })} style={s.input} />
          <button type="submit" style={s.btn}>Register</button>
        </form>
      </section>
      <section style={s.card}>
        <h3>Doctor directory (department)</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="Department (e.g. Cardiology)" value={dept} onChange={(e) => setDept(e.target.value)} style={s.input} />
          <button onClick={loadDoctors} style={s.btn}>Filter</button>
        </div>
        {doctors.map((d) => (
          <div key={d.id} style={s.row}><span><b>{d.full_name}</b>{d.department ? ` · ${d.department}` : ''}{d.specialization ? ` · ${d.specialization}` : ''} · {d.health_id}</span></div>
        ))}
      </section>
    </div>
  )
}

const s = {
  wrap: { maxWidth: 950, margin: '0 auto', padding: 16 },
  card: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' },
  input: { border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px' },
  btn: { border: '1px solid #0d9488', borderRadius: 6, padding: '6px 12px', background: '#0d9488', color: '#fff', cursor: 'pointer' },
  btn2: { border: '1px solid #6b7280', borderRadius: 6, padding: '6px 12px', background: '#fff', cursor: 'pointer' },
}
