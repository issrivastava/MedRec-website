import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

export default function Notifications() {
  const [items, setItems] = useState([])

  const load = async () => {
    const { data } = await api.get('/api/notifications/my')
    setItems(data)
  }
  useEffect(() => { load().catch(console.error) }, [])

  const read = async (id) => {
    await api.patch(`/api/notifications/${id}/read`)
    load()
  }
  const readAll = async () => {
    await api.post('/api/notifications/read-all')
    load()
  }

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Notifications</h2>
        <button onClick={readAll}>Mark all read</button>
      </div>
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
