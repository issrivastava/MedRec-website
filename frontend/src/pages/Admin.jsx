import { useEffect, useState } from 'react'
import api from '../api'

export default function Admin() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [msgs, setMsgs] = useState([])
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')

  const load = async () => {
    const [{ data: st }, { data: u }, { data: m }] = await Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/users', { params: { q: q || undefined, role: role || undefined } }),
      api.get('/api/admin/contact'),
    ])
    setStats(st); setUsers(u); setMsgs(m)
  }
  useEffect(() => { load().catch(console.error) }, [])

  const setUserRole = async (id, r) => {
    await api.patch(`/api/admin/users/${id}/role?role=${r}`)
    load()
  }
  const delUser = async (id) => {
    if (!confirm('Delete this user and all their data?')) return
    await api.delete(`/api/admin/users/${id}`)
    load()
  }

  return (
    <div style={s.wrap}>
      <h2>Admin Panel</h2>
      {stats && (
        <div style={s.grid}>
          {[['Users', stats.users_total], ['Patients', stats.patients], ['Doctors', stats.doctors],
            ['Documents', stats.documents], ['Booked appts', stats.appointments_booked],
            ['Visit notes', stats.visit_notes], ['Reviews', stats.reviews || 0], ['Contact msgs', stats.contact_messages]].map(([k, v]) => (
            <div key={k} style={s.stat}><div style={s.num}>{v}</div><div>{k}</div></div>
          ))}
        </div>
      )}

      <section style={s.card}>
        <h3>Users</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input placeholder="Search name/email" value={q} onChange={(e) => setQ(e.target.value)} style={s.input} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={s.input}>
            <option value="">All roles</option><option value="patient">Patients</option>
            <option value="doctor">Doctors</option><option value="admin">Admins</option>
          </select>
          <button onClick={load} style={s.btn}>Search</button>
        </div>
        {users.map((u) => (
          <div key={u.id} style={s.row}>
            <span><b>{u.full_name}</b> · {u.email} · <i>{u.role}</i></span>
            <span style={{ display: 'flex', gap: 6 }}>
              <select value={u.role} onChange={(e) => setUserRole(u.id, e.target.value)}>
                <option value="patient">patient</option><option value="doctor">doctor</option><option value="admin">admin</option>
              </select>
              <button onClick={() => delUser(u.id)}>Delete</button>
            </span>
          </div>
        ))}
      </section>

      <section style={s.card}>
        <h3>Contact messages ({msgs.length})</h3>
        {msgs.map((m) => (
          <div key={m.id} style={s.msg}>
            <b>{m.subject || '(no subject)'}</b> — {m.name} ({m.email}) <small>{m.created_at.slice(0, 10)}</small>
            <p style={{ margin: '4px 0' }}>{m.message}</p>
            <button onClick={async () => { await api.delete(`/api/admin/contact/${m.id}`); load() }}>Delete</button>
          </div>
        ))}
        {!msgs.length && <p>No messages.</p>}
      </section>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 },
  stat: { background: '#fff', border: '1px solid #99f6e4', borderRadius: 8, padding: 14, textAlign: 'center' },
  num: { fontSize: 28, fontWeight: 800, color: '#0f766e' },
  card: { border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16, background: '#fff' },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' },
  msg: { borderBottom: '1px solid #eee', padding: '8px 0' },
}
