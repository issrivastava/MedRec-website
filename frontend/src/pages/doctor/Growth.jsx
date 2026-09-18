import { useEffect, useState } from 'react'
import api from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useDoctor } from './DoctorContext'
import { Avatar } from '../../components/People'
import { Stars } from '../../components/Reviews'

export default function Growth() {
  const { profile, setProfile, reload } = useDoctor()
  const { user } = useAuth()
  const [preview, setPreview] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const loadPreview = async () => {
    const { data } = await api.get('/api/practice/public-profile').catch(() => ({ data: null }))
    setPreview(data)
  }
  useEffect(() => { loadPreview().catch(console.error) }, [])

  const save = async () => {
    setMsg(''); setErr('')
    try {
      const { data } = await api.put('/api/doctors/me', profile)
      setProfile(data)
      setMsg('Growth profile saved ✓ — patients see this when they find you.')
      loadPreview()
      reload().catch(() => {})
    } catch (e) { setErr(e.response?.data?.detail || 'Could not save') }
  }

  if (!profile) return <div className="empty">Loading profile…</div>

  return (
    <div className="rise">
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-amber">🌟</span> Public Growth Profile</h3>
        <p style={s.sub}>This is how patients judge you before linking. Fill it like a clinic board.</p>
        <div style={s.grid}>
          <label>Education<input value={profile.education || ''} onChange={(e) => setProfile({ ...profile, education: e.target.value })} placeholder="MBBS, MD (Cardiology) — AIIMS" style={s.input} /></label>
          <label>Experience (years)<input type="number" min="0" value={profile.experience_years ?? ''} onChange={(e) => setProfile({ ...profile, experience_years: e.target.value === '' ? null : +e.target.value })} style={s.input} /></label>
          <label>Consultation fee (₹)<input type="number" min="0" value={profile.consultation_fee ?? ''} onChange={(e) => setProfile({ ...profile, consultation_fee: e.target.value === '' ? null : +e.target.value })} style={s.input} /></label>
          <label>Languages<input value={profile.languages || ''} onChange={(e) => setProfile({ ...profile, languages: e.target.value })} placeholder="English, Hindi, Marathi" style={s.input} /></label>
          <label>Clinic address<input value={profile.clinic_address || ''} onChange={(e) => setProfile({ ...profile, clinic_address: e.target.value })} placeholder="Room 12, City Hospital, MG Road" style={s.input} /></label>
          <label>Timings<input value={profile.timings || ''} onChange={(e) => setProfile({ ...profile, timings: e.target.value })} placeholder="Mon–Sat 10am–1pm, 5–8pm" style={s.input} /></label>
        </div>
        <label style={{ display: 'block', marginBottom: 8 }}>Bio / about<textarea value={profile.bio || ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} placeholder="15 yrs treating diabetes & thyroid… be specific, be human." rows={3} style={{ ...s.input, width: '100%' }} /></label>
        {msg && <p style={{ color: 'green' }}>{msg}</p>}
        {err && <p style={{ color: 'red' }}>{err}</p>}
        <button onClick={save} style={s.btn}>Save public profile</button>
      </section>

      {preview && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-blue">👁️</span> Patient-side preview</h3>
          <div style={s.prev}>
            <Avatar seed={preview.doctor_id} name={preview.name} size={52} />
            <div>
              <b style={{ fontSize: 17 }}>Dr. {user?.full_name}</b>
              {preview.rating_avg != null && <> · <Stars value={preview.rating_avg} /> <b>{preview.rating_avg}</b> ({preview.rating_count})</>}
              <div style={{ fontSize: 13, color: '#334155' }}>
                {[preview.profile?.specialization, preview.profile?.hospital].filter(Boolean).join(' · ')}
                {preview.profile?.experience_years != null && ` · ${preview.profile.experience_years} yrs`}
                {preview.profile?.consultation_fee != null && ` · ₹${preview.profile.consultation_fee}`}
              </div>
              {preview.profile?.bio && <p style={{ fontSize: 13 }}>{preview.profile.bio}</p>}
              <small style={{ color: '#5d6b7a' }}>
                {[preview.profile?.education, preview.profile?.languages && `Speaks ${preview.profile.languages}`, preview.profile?.timings, preview.profile?.clinic_address].filter(Boolean).join(' · ')}
              </small>
              <div style={{ marginTop: 6 }}><span className="pill pill-info">{preview.patients} patients</span> <span className="pill pill-ok">{preview.visits_completed} visits done</span></div>
            </div>
          </div>
        </section>
      )}

      <ReviewReplies />
    </div>
  )
}

function ReviewReplies() {
  const [rows, setRows] = useState([])
  const [drafts, setDrafts] = useState({})
  const load = async () => {
    const { data } = await api.get('/api/practice/review-replies')
    setRows(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const send = async (review_id) => {
    await api.post('/api/practice/review-replies', { review_id, reply: drafts[review_id] })
    setDrafts({ ...drafts, [review_id]: '' })
    load()
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-violet">💬</span> Reply to Reviews ({rows.length})</h3>
      <p style={s.sub}>A short thank-you reply doubles rebooking. Replies show publicly next to the review.</p>
      {!rows.length && <div className="empty">No reviews yet — replies appear here.</div>}
      {rows.map((r) => (
        <div key={r.review_id} style={s.rev}>
          <Stars value={r.rating} /> <b>{r.patient_name}</b> <small>· {String(r.created_at).slice(0, 10)}</small>
          {r.comment && <p style={{ margin: '4px 0' }}>{r.comment}</p>}
          {r.reply
            ? <p style={s.replyBox}>Your reply: {r.reply}</p>
            : (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input placeholder="Write a public thank-you…" value={drafts[r.review_id] || ''}
                  onChange={(e) => setDrafts({ ...drafts, [r.review_id]: e.target.value })}
                  style={{ ...s.input, flex: 1 }} />
                <button onClick={() => send(r.review_id)} disabled={!(drafts[r.review_id] || '').trim()}>Reply</button>
              </div>
            )}
        </div>
      ))}
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  sub: { fontSize: 13, color: '#5d6b7a' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 10, marginBottom: 8 },
  input: { padding: 8, fontSize: 14, width: '100%', marginTop: 4, fontFamily: 'inherit' },
  btn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  prev: { display: 'flex', gap: 12, alignItems: 'flex-start', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' },
  rev: { border: '1px solid #f1f5f4', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: '#fff' },
  replyBox: { background: '#f0fdf4', padding: 8, borderRadius: 8, fontSize: 14 },
}
