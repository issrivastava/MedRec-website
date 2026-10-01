import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import { useDoctor } from './DoctorContext'

const tabs = [
  ['queue', '🏥 OPD Queue'],
  ['followups', '🔔 Follow-ups'],
  ['labs', '🧪 Lab Orders'],
  ['plans', '📋 Care Plans'],
  ['certs', '📜 Certificates'],
  ['leaves', '🌴 Leaves'],
]

export default function Practice() {
  const { patients, selectedId } = useDoctor()
  const [tab, setTab] = useState('queue')
  return (
    <div className="rise">
      <div className="toolbar-row" style={{ marginBottom: 12 }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={tab === k ? s.tabActive : s.tab}>{label}</button>
        ))}
      </div>
      {tab === 'queue' && <Queue />}
      {tab === 'followups' && <Followups />}
      {tab === 'labs' && <LabOrders patients={patients} selectedId={selectedId} />}
      {tab === 'plans' && <CarePlans patients={patients} selectedId={selectedId} />}
      {tab === 'certs' && <Certificates patients={patients} selectedId={selectedId} />}
      {tab === 'leaves' && <Leaves />}
    </div>
  )
}

/* ---------------- OPD queue ---------------- */
function Queue() {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [q, setQ] = useState(null)
  const [fee, setFee] = useState({})
  const [remindMsg, setRemindMsg] = useState('')
  const load = async () => {
    const { data } = await api.get('/api/practice/queue', { params: { day } })
    setQ(data)
  }
  useEffect(() => { load().catch(console.error) }, [day])
  const checkin = async (id, checked) => {
    const f = fee[id] || {}
    await api.patch(`/api/practice/appointments/${id}/checkin`,
      { checked_in: checked, ...(f.fee ? { fee: +f.fee } : {}), ...(f.pay ? { payment_status: f.pay } : {}) })
    load()
  }
  const noShow = async (id) => {
    if (!confirm('Mark this patient as no-show?')) return
    await api.patch(`/api/practice/appointments/${id}/no-show`)
    load()
  }
  const complete = async (id) => {
    await api.patch(`/api/scheduling/appointments/${id}?status=completed`)
    load()
  }
  const remindTomorrow = async () => {
    setRemindMsg('')
    try {
      const { data } = await api.post('/api/practice/reminders', null, { params: { days_ahead: 1 } })
      setRemindMsg(`🔔 Reminded ${data.reminded}/${data.booked} patients for ${data.date}`)
    } catch (e) {
      setRemindMsg(e.response?.data?.detail || 'Could not send reminders')
    }
  }
  if (!q) return <div className="empty">Loading queue…</div>
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-teal">🏥</span> OPD Queue — {q.date}</h3>
      <div className="toolbar-row">
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={s.input} />
        <span className="pill pill-info">Total {q.total}</span>
        <span className="pill pill-ok">Checked-in {q.checked_in}</span>
        <span className="pill pill-open">Pending {q.pending}</span>
        <a href="/api/practice/calendar.ics" style={{ fontWeight: 700 }}>📥 Calendar (.ics)</a>
        <button onClick={remindTomorrow}>🔔 Remind tomorrow</button>
        <Link to="/doctor/queue"><button>📺 Live display</button></Link>
      </div>
      {remindMsg && <p style={{ color: remindMsg.startsWith('🔔') ? 'green' : 'red' }}>{remindMsg}</p>}
      {q.queue.map((a) => (
        <div key={a.id} style={s.row}>
          <span>
            <b style={s.token}>#{a.token_no ?? '–'}</b> <b>{a.start_time}</b> — {a.patient_name}
            {a.reason ? ` · ${a.reason}` : ''} {a.consult_type === 'video' ? '🎥' : ''}
            <br />
            <small style={{ color: '#5d6b7a' }}>
              {a.checked_in ? '✅ checked-in' : '⏳ waiting'} · {a.status}
              {a.fee ? ` · ₹${a.fee} (${a.payment_status})` : ''}
              {a.video_url && a.status === 'booked' && <> · <a href={a.video_url} target="_blank" rel="noreferrer">▶ Join video</a></>}
            </small>
          </span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Fee ₹" value={fee[a.id]?.fee || ''} type="number" min="0"
              onChange={(e) => setFee({ ...fee, [a.id]: { ...fee[a.id], fee: e.target.value } })}
              style={{ ...s.input, width: 90 }} />
            <select value={fee[a.id]?.pay || a.payment_status}
              onChange={(e) => setFee({ ...fee, [a.id]: { ...fee[a.id], pay: e.target.value } })}
              style={s.input}>
              <option value="unpaid">unpaid</option><option value="paid">paid</option><option value="waived">waived</option>
            </select>
            {!a.checked_in && a.status === 'booked' && <button onClick={() => checkin(a.id, true)}>Check-in</button>}
            {a.checked_in && <button onClick={() => checkin(a.id, false)}>Undo</button>}
            {a.status === 'booked' && <button onClick={() => complete(a.id)}>Complete</button>}
            {a.status === 'booked' && <button onClick={() => noShow(a.id)}>No-show</button>}
            <Link to={`/doctor/patients/${a.patient_id}`}><button>Records →</button></Link>
          </span>
        </div>
      ))}
      {!q.queue.length && <div className="empty">No appointments this day. <Link to="/doctor/schedule">Manage schedule →</Link></div>}
    </section>
  )
}

/* ---------------- Follow-ups ---------------- */
function Followups() {
  const [filter, setFilter] = useState('all')
  const [data, setData] = useState(null)
  const load = async () => {
    const { data } = await api.get('/api/practice/followups', { params: { filter } })
    setData(data)
  }
  useEffect(() => { load().catch(console.error) }, [filter])
  if (!data) return <div className="empty">Loading follow-ups…</div>
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-amber">🔔</span> Follow-up Recall</h3>
      <div className="toolbar-row">
        {[['all', `All (${data.count})`], ['overdue', `Overdue (${data.overdue})`], ['upcoming', `Upcoming (${data.upcoming})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={filter === k ? s.tabActive : s.tab}>{l}</button>
        ))}
      </div>
      {data.results.map((f) => (
        <div key={f.id} style={s.row}>
          <span><b>{f.patient_name}</b> — {f.title || f.note_type}
            {f.diagnosis_name ? ` · ${f.diagnosis_code || ''} ${f.diagnosis_name}` : ''}
            <br /><small style={{ color: f.bucket === 'overdue' ? '#b91c1c' : '#5d6b7a' }}>
              Follow-up: {f.follow_up_date} ({f.bucket}{f.bucket === 'overdue' ? ` · ${f.days_overdue}d late` : ''})
            </small></span>
          <Link to={`/doctor/patients/${f.patient_id}`}><button>Open records →</button></Link>
        </div>
      ))}
      {!data.results.length && <div className="empty">No follow-ups here. 🎉</div>}
    </section>
  )
}

/* ---------------- Lab orders ---------------- */
function LabOrders({ patients, selectedId }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ patient_id: '', test_name: '', instructions: '', due_date: '' })
  useEffect(() => { if (selectedId) setForm((f) => ({ ...f, patient_id: selectedId })) }, [selectedId])
  const load = async () => {
    const { data } = await api.get('/api/practice/lab-orders')
    setRows(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const create = async (e) => {
    e.preventDefault()
    await api.post('/api/practice/lab-orders', {
      ...form, due_date: form.due_date || undefined, instructions: form.instructions || undefined,
    })
    setForm({ patient_id: selectedId || '', test_name: '', instructions: '', due_date: '' })
    load()
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-blue">🧪</span> Lab Orders</h3>
      <form onSubmit={create} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} required style={s.input}>
          <option value="">— Patient —</option>
          {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
        </select>
        <input placeholder="Test name (e.g. HbA1c)" value={form.test_name} onChange={(e) => setForm({ ...form, test_name: e.target.value })} required style={s.input} />
        <input placeholder="Instructions" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} style={{ ...s.input, minWidth: 200 }} />
        <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} style={s.input} />
        <button>Order test</button>
      </form>
      {rows.map((r) => (
        <div key={r.id} style={s.row}>
          <span><b>{r.test_name}</b> → {r.patient_name}
            <br /><small style={{ color: '#5d6b7a' }}>{r.instructions || ''} {r.due_date ? `· due ${r.due_date}` : ''} · {new Date(r.created_at).toLocaleDateString()}</small></span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className={`pill ${r.status === 'completed' ? 'pill-ok' : r.status === 'cancelled' ? 'pill-open' : 'pill-info'}`}>{r.status}</span>
            <select value={r.status} onChange={async (e) => { await api.patch(`/api/practice/lab-orders/${r.id}?status=${e.target.value}`); load() }} style={s.input}>
              <option value="ordered">ordered</option><option value="completed">completed</option><option value="cancelled">cancelled</option>
            </select>
            <button onClick={async () => { if (confirm('Delete this order?')) { await api.delete(`/api/practice/lab-orders/${r.id}`); load() } }}>Delete</button>
          </span>
        </div>
      ))}
      {!rows.length && <small>No lab orders yet.</small>}
    </section>
  )
}

/* ---------------- Care plans ---------------- */
function CarePlans({ patients, selectedId }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ patient_id: '', title: '', diagnosis_code: '', diagnosis_name: '', tasks: '' })
  useEffect(() => { if (selectedId) setForm((f) => ({ ...f, patient_id: selectedId })) }, [selectedId])
  const load = async () => {
    const { data } = await api.get('/api/practice/care-plans')
    setRows(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const create = async (e) => {
    e.preventDefault()
    const tasks = form.tasks.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ task: t, done: false }))
    await api.post('/api/practice/care-plans', {
      patient_id: form.patient_id, title: form.title,
      diagnosis_code: form.diagnosis_code || undefined, diagnosis_name: form.diagnosis_name || undefined,
      tasks: tasks.length ? tasks : undefined,
    })
    setForm({ patient_id: selectedId || '', title: '', diagnosis_code: '', diagnosis_name: '', tasks: '' })
    load()
  }
  const toggleTask = async (plan, idx) => {
    const tasks = (plan.tasks || []).map((t, i) => (i === idx ? { ...t, done: !t.done } : t))
    const done = tasks.length && tasks.every((t) => t.done)
    await api.patch(`/api/practice/care-plans/${plan.id}`, {
      patient_id: plan.patient_id, title: plan.title, tasks,
      ...(done ? { status: 'completed' } : {}),
    })
    load()
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-violet">📋</span> Treatment / Care Plans</h3>
      <form onSubmit={create} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} required style={s.input}>
          <option value="">— Patient —</option>
          {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
        </select>
        <input placeholder="Plan title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required style={s.input} />
        <input placeholder="ICD-10 (e.g. E11)" value={form.diagnosis_code} onChange={(e) => setForm({ ...form, diagnosis_code: e.target.value })} style={{ ...s.input, width: 110 }} />
        <input placeholder="Diagnosis name" value={form.diagnosis_name} onChange={(e) => setForm({ ...form, diagnosis_name: e.target.value })} style={s.input} />
        <input placeholder="Tasks, one per line…" value={form.tasks} onChange={(e) => setForm({ ...form, tasks: e.target.value })} style={{ ...s.input, minWidth: 220 }} />
        <button>Create plan</button>
      </form>
      {rows.map((p) => (
        <div key={p.id} style={s.planCard}>
          <b>{p.title}</b> → {p.patient_name}
          {p.diagnosis_code && <small> · {p.diagnosis_code} {p.diagnosis_name || ''}</small>}
          <span className={`pill ${p.status === 'completed' ? 'pill-ok' : 'pill-info'}`} style={{ marginLeft: 8 }}>{p.status}</span>
          <div style={{ marginTop: 6 }}>
            {(p.tasks || []).map((t, i) => (
              <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={!!t.done} onChange={() => toggleTask(p, i)} /> {t.task}
              </label>
            ))}
            {!(p.tasks || []).length && <small>No tasks.</small>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {p.status !== 'completed' && <button onClick={async () => { await api.patch(`/api/practice/care-plans/${p.id}`, { patient_id: p.patient_id, title: p.title, status: 'completed' }); load() }}>Mark done</button>}
            <button onClick={async () => { if (confirm('Delete this plan?')) { await api.delete(`/api/practice/care-plans/${p.id}`); load() } }}>Delete</button>
          </div>
        </div>
      ))}
      {!rows.length && <small>No care plans yet.</small>}
    </section>
  )
}

/* ---------------- Certificates ---------------- */
function Certificates({ patients, selectedId }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ patient_id: '', cert_type: 'fitness', title: '', content: '', valid_from: '', valid_until: '' })
  useEffect(() => { if (selectedId) setForm((f) => ({ ...f, patient_id: selectedId })) }, [selectedId])
  const load = async () => {
    const { data } = await api.get('/api/practice/certificates')
    setRows(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const create = async (e) => {
    e.preventDefault()
    await api.post('/api/practice/certificates', {
      ...form, title: form.title || undefined,
      valid_from: form.valid_from || undefined, valid_until: form.valid_until || undefined,
    })
    setForm({ patient_id: selectedId || '', cert_type: 'fitness', title: '', content: '', valid_from: '', valid_until: '' })
    load()
  }
  const pdf = async (id) => {
    const res = await api.get(`/api/practice/certificates/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url; a.download = `certificate-${id.slice(0, 8)}.pdf`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-rose">📜</span> Medical Certificates</h3>
      <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} required style={s.input}>
            <option value="">— Patient —</option>
            {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
          </select>
          <select value={form.cert_type} onChange={(e) => setForm({ ...form, cert_type: e.target.value })} style={s.input}>
            <option value="fitness">fitness</option><option value="sick">sick leave</option>
            <option value="leave">leave</option><option value="other">other</option>
          </select>
          <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={s.input} />
          <input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} style={s.input} />
          <input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} style={s.input} />
        </div>
        <textarea placeholder="Certificate body…" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required rows={3} style={s.input} />
        <button style={{ alignSelf: 'flex-start' }}>Issue certificate</button>
      </form>
      {rows.map((r) => (
        <div key={r.id} style={s.row}>
          <span><b>{r.cert_type}</b> → {r.patient_name} · {r.title || '(no title)'}
            <br /><small style={{ color: '#5d6b7a' }}>{r.valid_from || '—'} to {r.valid_until || '—'}</small></span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => pdf(r.id)}>⬇ PDF</button>
            <button onClick={async () => { if (confirm('Delete?')) { await api.delete(`/api/practice/certificates/${r.id}`); load() } }}>Delete</button>
          </span>
        </div>
      ))}
      {!rows.length && <small>No certificates yet.</small>}
    </section>
  )
}

/* ---------------- Leaves ---------------- */
function Leaves() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ date: '', reason: '' })
  const load = async () => {
    const { data } = await api.get('/api/practice/leaves')
    setRows(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const create = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/api/practice/leaves', { date: form.date, reason: form.reason || undefined })
      alert(data.booked_that_day ? `Leave marked — ⚠️ ${data.booked_that_day} appointment(s) already booked that day, please reschedule them.` : 'Leave marked ✓')
      setForm({ date: '', reason: '' })
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Could not mark leave') }
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-orange">🌴</span> Leave / Out-of-Office</h3>
      <p style={{ fontSize: 13, color: '#5d6b7a' }}>Patients can't book on leave days. Booking on a leave day is blocked automatically.</p>
      <form onSubmit={create} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required style={s.input} />
        <input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={{ ...s.input, minWidth: 200 }} />
        <button>Mark leave</button>
      </form>
      {rows.map((r) => (
        <div key={r.id} style={s.row}>
          <span><b>{r.date}</b> {r.reason ? `— ${r.reason}` : ''}</span>
          <button onClick={async () => { await api.delete(`/api/practice/leaves/${r.id}`); load() }}>Remove</button>
        </div>
      ))}
      {!rows.length && <small>No leaves marked.</small>}
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
  planCard: { border: '1px solid #eee', borderRadius: 10, padding: 10, marginBottom: 8, background: '#fff', fontSize: 14 },
  input: { padding: 8, fontSize: 14, minWidth: 0 },
  tab: { padding: '6px 12px', cursor: 'pointer', background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 8 },
  tabActive: { padding: '6px 12px', cursor: 'pointer', background: '#1e3a5f', color: '#fff', border: '1px solid #1e3a5f', borderRadius: 8, fontWeight: 700 },
  token: { display: 'inline-block', background: '#1e3a5f', color: '#fff', borderRadius: 8, padding: '1px 8px', marginRight: 6, fontSize: 13 },
}
