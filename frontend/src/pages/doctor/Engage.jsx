import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'

export default function Engage() {
  const [tab, setTab] = useState('groups')
  return (
    <div className="rise">
      <div className="toolbar-row" style={{ marginBottom: 12 }}>
        {[['groups', '👥 Patient Groups'], ['broadcast', '📣 Broadcast'], ['adherence', '✅ Adherence']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tab === k ? s.tabActive : s.tab}>{l}</button>
        ))}
      </div>
      {tab === 'groups' && <Groups />}
      {tab === 'broadcast' && <Broadcast />}
      {tab === 'adherence' && <Adherence />}
    </div>
  )
}

function Groups() {
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { api.get('/api/practice/patient-groups').then(({ data }) => setData(data)).catch(console.error) }, [])
  if (!data) return <div className="empty">Loading groups…</div>
  const needle = q.trim().toLowerCase()
  const shown = data.patients.filter((p) =>
    !needle || (p.patient_name || '').toLowerCase().includes(needle) ||
    (p.chronic || '').toLowerCase().includes(needle))
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-blue">👥</span> Patient Groups ({data.count})</h3>
      <div className="toolbar-row">
        <span className="pill pill-open">Needs attention {data.needs_attention}</span>
        <span className="pill pill-info">Stale 6m+ {data.stale_6m}</span>
        <input placeholder="Search name or condition…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ ...s.input, flex: 1, minWidth: 200 }} />
      </div>
      {!!data.top_conditions.length && (
        <p style={{ fontSize: 13, color: '#5d6b7a' }}>
          Top conditions: {data.top_conditions.map((c) => `${c.condition} (${c.count})`).join(' · ')}
        </p>
      )}
      {shown.map((p) => (
        <div key={p.patient_id} style={s.row}>
          <span><b>{p.patient_name}</b> {p.needs_attention && <span className="pill pill-open">attention</span>}
            <br /><small style={{ color: '#5d6b7a' }}>
              {p.chronic || 'No chronic tag'} · {p.visits} visits · last {p.last_visit || 'never'}
              {p.unacked_alerts ? ` · ⚠️ ${p.unacked_alerts} alerts` : ''}
            </small></span>
          <Link to={`/doctor/patients/${p.patient_id}`}><button>Records →</button></Link>
        </div>
      ))}
      {!shown.length && <div className="empty">No patients match.</div>}
    </section>
  )
}

function Broadcast() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ title: '', body: '' })
  const [msg, setMsg] = useState('')
  const load = async () => {
    const { data } = await api.get('/api/practice/broadcasts')
    setRows(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const send = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      const { data } = await api.post('/api/practice/broadcasts', form)
      setMsg(`Sent to ${data.recipients} patients ✓`)
      setForm({ title: '', body: '' })
      load()
    } catch (err) { setMsg(err.response?.data?.detail || 'Could not send') }
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-teal">📣</span> Broadcast to My Patients</h3>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <input placeholder="Title (e.g. Clinic closed on Diwali)" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} required style={s.input} />
        <textarea placeholder="Message for all assigned patients…" value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })} required rows={3} style={s.input} />
        <button style={{ alignSelf: 'flex-start' }}>Send to all my patients</button>
        {msg && <span style={{ color: msg.includes('✓') ? 'green' : 'red' }}>{msg}</span>}
      </form>
      {rows.map((b) => (
        <div key={b.id} style={s.row}>
          <span><b>{b.title}</b><br /><small>{b.body} · {String(b.created_at).slice(0, 10)}</small></span>
        </div>
      ))}
      {!rows.length && <small>No broadcasts yet.</small>}
    </section>
  )
}

function Adherence() {
  const [data, setData] = useState(null)
  useEffect(() => { api.get('/api/practice/adherence').then(({ data }) => setData(data)).catch(console.error) }, [])
  if (!data) return <div className="empty">Loading adherence…</div>
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-violet">✅</span> Follow-up Adherence</h3>
      {data.results.map((r) => (
        <div key={r.patient_id} style={s.row}>
          <span><b>{r.patient_name}</b>
            <br /><small style={{ color: '#5d6b7a' }}>
              {r.visits} visits · {r.followups} follow-ups · last {r.last_visit || '—'}
            </small></span>
          <span style={{ display: 'flex', gap: 6 }}>
            {r.overdue > 0 && <span className="pill pill-open">{r.overdue} overdue</span>}
            {r.upcoming > 0 && <span className="pill pill-info">{r.upcoming} upcoming</span>}
            {!r.followups && <span className="pill">no follow-ups</span>}
            <Link to={`/doctor/patients/${r.patient_id}`}><button>Nudge →</button></Link>
          </span>
        </div>
      ))}
      {!data.results.length && <div className="empty">No patients linked yet.</div>}
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 8, fontSize: 14, minWidth: 0 },
  tab: { padding: '6px 12px', cursor: 'pointer', background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 8 },
  tabActive: { padding: '6px 12px', cursor: 'pointer', background: '#1e3a5f', color: '#fff', border: '1px solid #1e3a5f', borderRadius: 8, fontWeight: 700 },
}
