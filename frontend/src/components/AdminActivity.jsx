import { useEffect, useState } from 'react'
import api from '../api'

/* Admin: new-feature usage + announcements broadcast. */
export default function AdminActivity() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ title: '', body: '', audience: 'all' })
  const [ann, setAnn] = useState([])
  const load = async () => {
    const [{ data: a }] = await Promise.all([api.get('/api/admin/activity')])
    setData(a)
    const { data: an } = await api.get('/api/care/announcements').catch(() => ({ data: [] }))
    setAnn(an)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const send = async (e) => {
    e.preventDefault()
    await api.post('/api/care/announcements', form)
    setForm({ title: '', body: '', audience: 'all' }); load()
  }
  if (!data) return <p>Loading activity…</p>
  return (
    <div>
      <div style={s.grid}>
        {[['Vitals', data.vitals], ['Vaccinations', data.vaccinations], ['Share links', data.share_links],
          ['Chat msgs', data.messages], ['Referrals', data.referrals],
          ['Active SOS', data.active_sos], ['Unacked alerts', data.unacked_alerts]].map(([k, v]) => (
          <div key={k} style={s.stat}><div style={s.num}>{v}</div><div>{k}</div></div>
        ))}
      </div>
      <section style={s.card}>
        <h3>Broadcast announcement</h3>
        <form onSubmit={send} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required style={s.input} />
          <input placeholder="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required style={{ ...s.input, minWidth: 240 }} />
          <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} style={s.input}>
            <option value="all">Everyone</option><option value="patients">Patients</option><option value="doctors">Doctors</option>
          </select>
          <button>Send</button>
        </form>
        {ann.map((a) => <div key={a.id} style={s.row}><b>{a.title}</b> ({a.audience}) — {a.body}</div>)}
      </section>
      <section style={s.card}>
        <h3>Recent signups</h3>
        {data.recent_users.map((u, i) => <div key={i} style={s.row}>{u.name} · {u.email} · <i>{u.role}</i> · {u.created_at.slice(0, 10)}</div>)}
      </section>
    </div>
  )
}

const s = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 12 },
  stat: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, textAlign: 'center' },
  num: { fontSize: 24, fontWeight: 800 },
  card: { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' },
  input: { padding: 8, fontSize: 14 },
  row: { borderBottom: '1px solid #eee', padding: '6px 0', fontSize: 14 },
}
