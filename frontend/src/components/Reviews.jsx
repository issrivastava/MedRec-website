import { useEffect, useState } from 'react'
import api from '../api'
import { Avatar } from './People'

export function Stars({ value, size = 16 }) {
  return (
    <span style={{ color: '#d97706', fontSize: size, letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (i <= Math.round(value || 0) ? '★' : '☆')).join('')}
    </span>
  )
}

export function StarPicker({ value, onChange }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)}
          style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 30, color: i <= value ? '#d97706' : '#d6d3d1', padding: 2, boxShadow: 'none' }}>
          ★
        </button>
      ))}
    </span>
  )
}

/* Patient: rate assigned doctors + manage own reviews. */
export function PatientReviews({ doctors }) {
  const [mine, setMine] = useState([])
  const [form, setForm] = useState({ doctor_id: '', rating: 5, comment: '' })
  const [msg, setMsg] = useState('')

  const load = async () => {
    const { data } = await api.get('/api/reviews/my')
    setMine(data)
  }
  useEffect(() => { load().catch(console.error) }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.doctor_id) return setMsg('Pick a doctor first')
    await api.post('/api/reviews', form)
    setMsg('Thanks for your review!')
    setForm({ doctor_id: '', rating: 5, comment: '' })
    load()
  }

  return (
    <div>
      <form onSubmit={submit} style={s.form}>
        <b>Rate your doctor</b>
        <select value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })} required style={s.input}>
          <option value="">— My doctor —</option>
          {(doctors || []).map((d) => <option key={d.doctor_id} value={d.doctor_id}>Dr. {d.doctor_name}</option>)}
        </select>
        <div><StarPicker value={form.rating} onChange={(r) => setForm({ ...form, rating: r })} /></div>
        <textarea placeholder="How was your experience? (optional)" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={3} style={s.input} />
        <button style={s.btn}>Submit review</button>
        {msg && <span style={{ color: 'green' }}>{msg}</span>}
      </form>
      <b>My reviews ({mine.length})</b>
      {mine.map((r) => (
        <div key={r.id} style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar seed={r.doctor_id} name={r.doctor_name} size={38} />
            <div><Stars value={r.rating} /> <b>Dr. {r.doctor_name}</b> <small>· {r.created_at.slice(0, 10)}</small></div>
          </div>
          {r.comment && <p style={{ margin: '6px 0' }}>{r.comment}</p>}
          <button onClick={async () => { await api.delete(`/api/reviews/${r.id}`); load() }}>Delete</button>
        </div>
      ))}
      {!mine.length && <div className="empty">No reviews yet — tap the stars above to review your doctor. ⭐</div>}
    </div>
  )
}

/* Doctor: average rating + received reviews. */
export function DoctorReviews({ doctorId, refreshKey }) {
  const [items, setItems] = useState([])
  const [rating, setRating] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get('/api/reviews/received'),
      api.get(`/api/reviews/doctor/${doctorId}/rating`),
    ]).then(([{ data: l }, { data: r }]) => { setItems(l); setRating(r) }).catch(console.error)
  }, [refreshKey])

  return (
    <div>
      <div style={s.avgBox}>
        <div style={{ fontSize: 44, fontWeight: 800, color: '#115e59' }}>{rating?.average ?? '—'}</div>
        <div><Stars value={rating?.average || 0} size={20} /><div style={{ color: '#5f6f6a' }}>{rating?.count || 0} reviews</div></div>
      </div>
      {items.map((r) => (
        <div key={r.id} style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar seed={r.patient_id} name={r.patient_name} size={38} />
            <div><Stars value={r.rating} /> <b>{r.patient_name}</b> <small>· {r.created_at.slice(0, 10)}</small></div>
          </div>
          {r.comment && <p style={{ margin: '6px 0' }}>{r.comment}</p>}
        </div>
      ))}
      {!items.length && <div className="empty">No reviews yet — great care earns great stars! ⭐</div>}
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, alignItems: 'flex-start' },
  input: { padding: 8, fontSize: 14, fontFamily: 'inherit', width: '100%' },
  btn: { padding: '8px 16px', background: 'linear-gradient(90deg,#fbbf24,#d97706)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  card: { border: '1px solid #f1f5f4', borderLeft: '4px solid #d97706', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: '#fff' },
  avgBox: { display: 'flex', gap: 16, alignItems: 'center', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 14, marginBottom: 12 },
}
