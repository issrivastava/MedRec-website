import { useEffect, useState } from 'react'
import api from '../../api'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../../components/People'
import { Stars, StarPicker } from '../../components/Reviews'

export default function Ratings() {
  const { user } = useAuth()
  const [rating, setRating] = useState(null)
  const [reviews, setReviews] = useState([])
  const [siteForm, setSiteForm] = useState({ rating: 5, comment: '' })
  const [mySite, setMySite] = useState(null)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const docId = user?.id
    const calls = [
      api.get('/api/reviews/received').catch(() => ({ data: [] })),
      api.get('/api/reviews/site/my').catch(() => ({ data: null })),
    ]
    if (docId) calls.push(api.get(`/api/reviews/doctor/${docId}/rating`).catch(() => ({ data: null })))
    const [recv, site, avg] = await Promise.all(calls)
    setReviews(recv.data || [])
    setMySite(site.data || null)
    if (avg?.data) setRating(avg.data)
    if (site.data) setSiteForm({ rating: site.data.rating, comment: site.data.comment || '' })
  }

  useEffect(() => { load().catch(console.error) }, [])

  const submitSite = async (e) => {
    e.preventDefault()
    await api.post('/api/reviews/site', siteForm)
    setMsg('Thanks — your MedRec review is saved!')
    load()
  }

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

      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-violet">💙</span> Rate MedRec (private)</h3>
        <form onSubmit={submitSite} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <div><StarPicker value={siteForm.rating} onChange={(v) => setSiteForm({ ...siteForm, rating: v })} /></div>
          <textarea placeholder="What do you think of MedRec?" value={siteForm.comment} onChange={(e) => setSiteForm({ ...siteForm, comment: e.target.value })} rows={3} style={{ ...s.input, width: '100%' }} />
          <button style={s.btn}>{mySite ? 'Update my MedRec review' : 'Submit MedRec review'}</button>
          {msg && <span style={{ color: 'green' }}>{msg}</span>}
        </form>
        <p style={{ fontSize: 12, color: '#5d6b7a' }}>🔒 Patient reviews of you are read-only here. Your MedRec review is private to your dashboard.</p>
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
