import { useEffect, useState } from 'react'
import api from '../api'

/**
 * Patient SOS: one-tap emergency alert to all linked doctors + emergency contact.
 * Optionally attaches GPS location. Shows recent alert history with status.
 */
export function EmergencyButton({ compact = false }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [loc, setLoc] = useState(null)
  const [locState, setLocState] = useState('idle') // idle|fetching|ok|denied
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [history, setHistory] = useState([])

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/api/emergency/my')
      setHistory(data)
    } catch { /* ignore */ }
  }

  useEffect(() => { loadHistory() }, [])

  const grabLocation = () => {
    if (!navigator.geolocation) { setLocState('denied'); return }
    setLocState('fetching')
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ latitude: p.coords.latitude, longitude: p.coords.longitude }); setLocState('ok') },
      () => setLocState('denied'),
      { timeout: 8000 },
    )
  }

  const send = async () => {
    setSending(true); setFeedback('')
    try {
      await api.post('/api/emergency/alert', {
        message: message || null,
        latitude: loc?.latitude ?? null,
        longitude: loc?.longitude ?? null,
      })
      setFeedback('🚨 Alert sent — your linked doctors and emergency contact were notified.')
      setMessage(''); setOpen(false)
      loadHistory()
    } catch (e) {
      setFeedback(e.response?.data?.detail || 'Could not send alert — try again.')
    } finally {
      setSending(false)
    }
  }

  const active = history.filter((h) => h.status === 'active')

  return (
    <div>
      {!compact && active.length > 0 && (
        <div style={s.activeBanner}>🚨 {active.length} active emergency alert{active.length > 1 ? 's' : ''} — doctors have been notified.</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => { setOpen(!open); setFeedback('') }} style={s.sosBtn}>
          🆘 SOS Emergency
        </button>
        <button onClick={loadHistory} style={s.ghostBtn}>Refresh history</button>
        {feedback && <span style={{ fontSize: 13, color: feedback.startsWith('🚨') ? 'green' : 'red' }}>{feedback}</span>}
      </div>

      {open && (
        <div style={s.modal}>
          <h4 style={{ margin: '0 0 8px' }}>Send emergency alert</h4>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#5d6b7a' }}>
            This notifies every linked doctor (in-app + email) and texts your emergency contact.
            Only use it in a real emergency.
          </p>
          <textarea
            placeholder="What is happening? (optional — e.g. chest pain, fall, address)"
            value={message} onChange={(e) => setMessage(e.target.value)}
            rows={3} style={s.input}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button onClick={grabLocation} style={s.ghostBtn} disabled={locState === 'fetching'}>
              {locState === 'fetching' ? 'Locating…' : locState === 'ok' ? `📍 Attached (${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)})` : '📍 Attach my location'}
            </button>
            {locState === 'denied' && <small style={{ color: '#888' }}>Location unavailable — alert still sends.</small>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={send} disabled={sending} style={s.sosBtn}>
              {sending ? 'Sending…' : '🚨 Send SOS now'}
            </button>
            <button onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!!history.length && (
        <div style={{ marginTop: 10 }}>
          <b style={{ fontSize: 13 }}>Recent SOS history</b>
          {history.slice(0, 5).map((h) => (
            <div key={h.id} style={s.histRow}>
              <span>{h.status === 'active' ? '🔴' : '✅'} {new Date(h.created_at).toLocaleString()}</span>
              <span style={{ color: '#5d6b7a' }}>{h.message || 'SOS alert'}{h.latitude ? ` · 📍 ${h.latitude.toFixed(3)}, ${h.longitude.toFixed(3)}` : ''}</span>
              <span className={h.status === 'active' ? 'pill pill-bad' : 'pill pill-ok'}>{h.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Doctor view: SOS alerts from assigned patients with resolve action. */
export function EmergencyInbox({ refreshKey }) {
  const [alerts, setAlerts] = useState([])
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      const { data } = await api.get('/api/emergency/assigned')
      setAlerts(data)
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [refreshKey])

  const resolve = async (id) => {
    await api.post(`/api/emergency/${id}/resolve`)
    setMsg('Alert marked resolved')
    load()
  }

  const active = alerts.filter((a) => a.status === 'active')

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={load} style={s.ghostBtn}>↻ Refresh</button>
        {msg && <span style={{ color: 'green', fontSize: 13 }}>{msg}</span>}
      </div>
      {!alerts.length && <div className="empty">No emergency alerts from your patients. 🎉</div>}
      {!!active.length && <div style={s.activeBanner}>🚨 {active.length} ACTIVE — please check on these patients now.</div>}
      {alerts.map((a) => (
        <div key={a.id} style={{ ...s.histRow, borderLeft: a.status === 'active' ? '4px solid #dc2626' : '4px solid #16a34a' }}>
          <div>
            <b>{a.status === 'active' ? '🔴' : '✅'} {a.patient_name}</b>{' '}
            <small style={{ color: '#5d6b7a' }}>{a.patient_email} · {new Date(a.created_at).toLocaleString()}</small>
            <div style={{ fontSize: 14 }}>{a.message || 'SOS alert — patient needs help.'}</div>
            {a.latitude && (
              <div style={{ fontSize: 13 }}>
                📍 <a href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`} target="_blank" rel="noreferrer">
                  {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)} (open map)
                </a>
              </div>
            )}
          </div>
          {a.status === 'active'
            ? <button onClick={() => resolve(a.id)} style={s.resolveBtn}>Mark resolved</button>
            : <span className="pill pill-ok">resolved</span>}
        </div>
      ))}
    </div>
  )
}

const s = {
  sosBtn: { padding: '10px 18px', background: '#8b2e3c', color: '#fff', border: '1px solid #6d2330', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 15 },
  ghostBtn: { padding: '8px 12px', cursor: 'pointer', background: '#fff', border: '1px solid #e7e5e4', borderRadius: 8 },
  resolveBtn: { padding: '6px 12px', cursor: 'pointer', background: '#16a34a', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700 },
  modal: { marginTop: 10, border: '2px solid #fecaca', background: '#fef2f2', borderRadius: 12, padding: 14 },
  input: { padding: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' },
  activeBanner: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: 10, borderRadius: 8, fontWeight: 700, marginBottom: 10 },
  histRow: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e7e5e4', borderRadius: 8, padding: '8px 12px', marginTop: 6, fontSize: 13 },
}
