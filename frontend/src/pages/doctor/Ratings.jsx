import { useEffect, useState } from 'react'
import api from '../../api'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../../components/People'
import { Stars } from '../../components/Reviews'

export default function Ratings() {
  const { user } = useAuth()
  const [rating, setRating] = useState(null)
  const [reviews, setReviews] = useState([])

  const load = async () => {
    const docId = user?.id
    const calls = [api.get('/api/reviews/received').catch(() => ({ data: [] }))]
    if (docId) calls.push(api.get(`/api/reviews/doctor/${docId}/rating`).catch(() => ({ data: null })))
    const [recv, avg] = await Promise.all(calls)
    setReviews(recv.data || [])
    if (avg?.data) setRating(avg.data)
  }

  useEffect(() => { load().catch(console.error) }, [])

  const avg = rating?.average
  const count = rating?.count ?? reviews.length

  return (
    <div className="rise">
      <div className="stat-grid">
        <div className="gstat g-amber">
          <div className="num">{avg != null ? `${avg}★` : '—'}</div>
          <div className="lbl">Average rating</div>
          <span className="big-icon">⭐</span>
        </div>
        <div className="gstat g-blue">
          <div className="num">{count}</div>
          <div className="lbl">Total reviews</div>
          <span className="big-icon">💬</span>
        </div>
        <div className="gstat g-teal">
          <div className="num">{reviews.filter((r) => r.rating >= 4).length}</div>
          <div className="lbl">4★ and above</div>
          <span className="big-icon">👍</span>
        </div>
      </div>

      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-amber">⭐</span> What patients say</h3>
        {avg != null && <p><Stars value={avg} size={20} /> <b>{avg}</b> from {count} review{count === 1 ? '' : 's'}</p>}
        {!reviews.length && <div className="empty">No patient reviews yet — they appear here after patients rate you.</div>}
        {reviews.map((r) => (
          <div key={r.id} style={s.rev}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar seed={r.patient_id} name={r.patient_name} size={38} />
              <div><Stars value={r.rating} /> <b>{r.patient_name}</b> <small>· {String(r.created_at || '').slice(0, 10)}</small></div>
            </div>
            {r.comment && <p style={{ margin: '6px 0' }}>{r.comment}</p>}
          </div>
        ))}
      </section>
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)', minWidth: 0 },
  input: { padding: 8, fontSize: 14, fontFamily: 'inherit' },
  btn: { padding: '8px 16px', background: '#8a6d3b', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  rev: { border: '1px solid #f1f5f4', borderLeft: '4px solid #8a6d3b', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: '#fff' },
}
