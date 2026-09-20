import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'

/* Live OPD queue display — for the clinic desk TV or the doctor's second
   screen. Auto-refreshes every 15s. Big tokens, only what matters. */
export default function Queue() {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [q, setQ] = useState(null)
  const [tv, setTv] = useState(false)
  const [remindMsg, setRemindMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/practice/queue', { params: { day } })
      setQ(data)
    } catch (e) { console.error(e) }
  }, [day])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const remind = async () => {
    setRemindMsg('')
    try {
      const { data } = await api.post('/api/practice/reminders', null, { params: { days_ahead: 1 } })
      setRemindMsg(`🔔 Reminded ${data.reminded}/${data.booked} patients for ${data.date}`)
    } catch (e) {
      setRemindMsg(e.response?.data?.detail || 'Could not send reminders')
    }
  }

  const nowServing = (q?.queue || []).filter((a) => a.checked_in && a.status === 'booked').slice(0, 3)
  const upNext = (q?.queue || []).filter((a) => !a.checked_in && a.status === 'booked').slice(0, 8)

  return (
    <div className="rise">
      <p><Link to="/doctor/practice">← Practice</Link></p>
      <section style={s.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h3 className="sec-head" style={{ margin: 0 }}><span className="tile t-teal">📺</span> Live Queue {q ? `— ${q.date}` : ''}</h3>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={s.input} />
            <button onClick={() => setTv((v) => !v)}>{tv ? 'Exit TV mode' : '📺 TV mode'}</button>
            <button onClick={remind}>🔔 Remind tomorrow's patients</button>
          </span>
        </div>
        {remindMsg && <p style={{ color: remindMsg.startsWith('🔔') ? 'green' : 'red' }}>{remindMsg}</p>}
        {!q && <div className="empty">Loading queue…</div>}
        {q && (
          <>
            <div className="stat-grid">
              <div className="gstat g-teal"><div className="num">{q.total}</div><div className="lbl">Total</div></div>
              <div className="gstat g-blue"><div className="num">{q.checked_in}</div><div className="lbl">Checked-in</div></div>
              <div className="gstat g-amber"><div className="num">{q.pending}</div><div className="lbl">Waiting</div></div>
              <div className="gstat g-violet"><div className="num">{q.completed}</div><div className="lbl">Done</div></div>
            </div>
            <div className={tv ? 'cols-1' : 'cols-2'} style={{ alignItems: 'start' }}>
              <div style={tv ? s.tvBox : undefined}>
                <h4 style={tv ? s.tvHead : undefined}>🔔 Now serving</h4>
                {!nowServing.length && <div className="empty">Nobody checked in yet.</div>}
                {nowServing.map((a) => (
                  <div key={a.id} style={tv ? s.tvToken : s.row}>
                    <b style={tv ? s.tvNum : s.token}>#{a.token_no ?? '–'}</b>
                    <span style={tv ? s.tvName : undefined}> {a.patient_name} · {a.start_time}</span>
                  </div>
                ))}
              </div>
              {!tv && (
                <div>
                  <h4>⏳ Up next</h4>
                  {!upNext.length && <div className="empty">Queue clear 🎉</div>}
                  {upNext.map((a) => (
                    <div key={a.id} style={s.row}>
                      <span><b style={s.token}>#{a.token_no ?? '–'}</b> <b>{a.start_time}</b> — {a.patient_name}</span>
                      <span className="pill pill-info">{a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <small style={{ color: '#5d6b7a' }}>Auto-refreshes every 15s.</small>
          </>
        )}
      </section>
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #0f766e', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  input: { padding: 8, fontSize: 14 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
  token: { background: '#1e3a5f', color: '#fff', borderRadius: 6, padding: '2px 8px' },
  tvBox: { background: '#042f2e', color: '#fff', borderRadius: 16, padding: 24 },
  tvHead: { color: '#5eead4', fontSize: 22, margin: '0 0 12px' },
  tvToken: { display: 'flex', gap: 16, alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid #134e4a' },
  tvNum: { fontSize: 56, fontWeight: 900, color: '#fbbf24' },
  tvName: { fontSize: 28, fontWeight: 700 },
}
