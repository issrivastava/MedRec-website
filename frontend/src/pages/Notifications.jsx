import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

export default function Notifications() {
  const [items, setItems] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await api.get('/api/notifications/my')
    setItems(data)
  }
  useEffect(() => { load().catch((e) => setErr(e.message || 'Could not load notifications')) }, [])

  const pingBadge = () => {
    // Navbar bell polls every 30s — nudge it to refetch immediately.
    try { window.dispatchEvent(new Event('medrec:notifications-changed')) } catch { /* ignore */ }
  }

  const read = async (id) => {
    setErr('')
    try {
      await api.patch(`/api/notifications/${id}/read`)
      await load()
      pingBadge()
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || 'Could not mark as read')
    }
  }
  const readAll = async () => {
    setErr('')
    setBusy(true)
    try {
      const { data } = await api.post('/api/notifications/read-all')
      await load()
      pingBadge()
      if (!data.marked) setErr('Nothing unread — you are all caught up.')
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || 'Could not mark all as read')
    } finally {
      setBusy(false)
    }
  }
  const clearAll = async () => {
    if (!items.length) return
    if (!confirm(`Delete all ${items.length} notification(s)? This cannot be undone.`)) return
    setErr('')
    setBusy(true)
    try {
      await api.delete('/api/notifications/my')
      await load()
      pingBadge()
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || 'Could not clear notifications')
    } finally {
      setBusy(false)
    }
  }

  const unread = items.filter((n) => !n.read).length

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2>Notifications{unread > 0 ? ` (${unread} unread)` : ''}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={readAll} disabled={busy || !unread}>Mark all read</button>
          <button onClick={clearAll} disabled={busy || !items.length}>Clear all</button>
        </div>
      </div>
      {err && <p style={{ color: err.startsWith('Nothing') ? 'green' : 'red' }}>{err}</p>}
      {items.map((n) => (
        <div key={n.id} style={{ ...s.card, opacity: n.read ? 0.65 : 1 }}>
          <b>{n.read ? '' : '● '}{n.title}</b>
          {n.body && <p style={{ margin: '4px 0' }}>{n.body}</p>}
          <small>{n.created_at.slice(0, 16).replace('T', ' ')}</small>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {n.link && <Link to={n.link}><button>Open</button></Link>}
            {!n.read && <button onClick={() => read(n.id)}>Mark read</button>}
          </div>
        </div>
      ))}
      {!items.length && <p>No notifications yet.</p>}
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #c9d4e2', background: '#eef2f7', borderRadius: 8, padding: 12, marginBottom: 10 },
}
