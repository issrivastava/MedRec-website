import { useEffect, useState } from 'react'
import api from '../api'
import { Avatar } from './People'

export function Stars({ value, size = 16 }) {
  return (
    <span style={{ color: '#8a6d3b', fontSize: size, letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (i <= Math.round(value || 0) ? '★' : '☆')).join('')}
    </span>
  )
}

export function StarPicker({ value, onChange }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)}
          style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 30, color: i <= value ? '#8a6d3b' : '#d6d3d1', padding: 2, boxShadow: 'none' }}>
          ★
        </button>
      ))}
    </span>
  )
}

/* Rate your doctor (patients only) + read your own past reviews.
   Shown in the writer's own dashboard. */
export function MyReviews({ role, doctors }) {
  const isPatient = role === 'patient'
  const [docForm, setDocForm] = useState({ doctor_id: '', rating: 5, comment: '', showcase_consent: false })
  const [myDocs, setMyDocs] = useState([])
  const [msg, setMsg] = useState('')

  const load = async () => {
    if (!isPatient) return
    const { data } = await api.get('/api/reviews/my').catch(() => ({ data: [] }))
    setMyDocs(data || [])
  }
  useEffect(() => { load().catch(console.error) }, [])

  const submitDoctor = async (e) => {
    e.preventDefault()
    if (!docForm.doctor_id) return setMsg('Pick a doctor first')
    await api.post('/api/reviews', docForm)
    setMsg('Thanks — your doctor review is saved!')
    setDocForm({ doctor_id: '', rating: 5, comment: '', showcase_consent: false })
    load()
  }

  return (
    <div>
      {isPatient && (
        <form onSubmit={submitDoctor} style={s.form}>
          <b>⭐ Review my doctor</b>
          <select value={docForm.doctor_id} onChange={(e) => setDocForm({ ...docForm, doctor_id: e.target.value })} required style={s.input}>
            <option value="">— My doctor —</option>
            {(doctors || []).map((d) => <option key={d.doctor_id} value={d.doctor_id}>Dr. {d.doctor_name}</option>)}
          </select>
          <div><StarPicker value={docForm.rating} onChange={(r) => setDocForm({ ...docForm, rating: r })} /></div>
          <textarea placeholder="How was your experience? (optional)" value={docForm.comment} onChange={(e) => setDocForm({ ...docForm, comment: e.target.value })} rows={3} style={s.input} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#475569' }}>
            <input type="checkbox" checked={!!docForm.showcase_consent} onChange={(e) => setDocForm({ ...docForm, showcase_consent: e.target.checked })} style={{ marginTop: 3 }} />
            <span>Show my first name + review on the MedRec homepage. Optional — only 4★+ reviews are shown, and you can remove consent anytime by editing this review.</span>
          </label>
          <button style={s.btn}>Submit doctor review</button>
          {msg && <span style={{ color: 'green' }}>{msg}</span>}
        </form>
      )}

      <b>My reviews</b>
      {isPatient && myDocs.map((r) => (
        <div key={r.id} style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar seed={r.doctor_id} name={r.doctor_name} size={38} />
            <div><Stars value={r.rating} /> <b>Dr. {r.doctor_name}</b> <small>· {r.created_at.slice(0, 10)}</small></div>
          </div>
          {r.comment && <p style={{ margin: '6px 0' }}>{r.comment}</p>}
          <button onClick={async () => { await api.delete(`/api/reviews/${r.id}`); load() }}>Delete</button>
        </div>
      ))}
      {isPatient && !myDocs.length && (
        <div className="empty">No reviews yet — tap the stars above to write your own. ⭐</div>
      )}
      <p style={{ fontSize: 12, color: '#5d6b7a' }}>🔒 Your reviews are private — visible only here, in your own dashboard.</p>
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, alignItems: 'flex-start' },
  input: { padding: 8, fontSize: 14, fontFamily: 'inherit', width: '100%' },
  btn: { padding: '8px 16px', background: '#8a6d3b', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  card: { border: '1px solid #f1f5f4', borderLeft: '4px solid #8a6d3b', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: '#fff' },
}
