import { useState } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

export default function Contact() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    name: user?.full_name || '',
    email: user?.email || '',
    subject: '',
    message: '',
  })
  const [status, setStatus] = useState(null)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setStatus(null)
    try {
      await api.post('/api/contact', form)
      setStatus({ ok: true, text: 'Thanks! Your message has been received. We will reply by email.' })
      setForm({ ...form, subject: '', message: '' })
    } catch (err) {
      setStatus({ ok: false, text: err.response?.data?.detail ? JSON.stringify(err.response.data.detail) : 'Could not send. Try again.' })
    }
  }

  return (
    <div style={s.wrap}>
      <h2 style={{ margin: '0 0 4px' }}>✉️ Contact Us</h2>
      <p style={{ color: '#5d6b7a', margin: '0 0 16px' }}>Questions about MedRec, your account, or a bug? We reply within 2 business days.</p>
      <div className="cols-2" style={{ alignItems: 'start' }}>
        <form onSubmit={submit} style={s.form}>
          <input placeholder="Your name" value={form.name} onChange={set('name')} required style={s.input} />
          <input placeholder="Email" type="email" value={form.email} onChange={set('email')} required style={s.input} />
          <input placeholder="Subject (optional)" value={form.subject} onChange={set('subject')} style={s.input} />
          <textarea placeholder="Your message (min 10 characters)" value={form.message} onChange={set('message')} required rows={6} style={s.input} />
          {status && <p style={{ color: status.ok ? 'green' : 'red' }}>{status.text}</p>}
          <button type="submit" style={s.btn}>Send message</button>
        </form>
        <aside style={s.side}>
          <h3 style={{ marginTop: 0 }}>Other ways to reach us</h3>
          <p>📧 support@medrec.app</p>
          <p>🕘 Mon–Sat, 9am–7pm IST</p>
          <p>🚨 Medical emergency? Hit the <b>SOS button</b> in your patient dashboard to alert your doctors instantly — and for life-threatening situations always call local emergency services too.</p>
        </aside>
      </div>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 6px 40px' },
  form: { display: 'flex', flexDirection: 'column', gap: 10, background: '#fff', border: '1px solid #e9edf2', borderRadius: 16, padding: 20, boxShadow: '0 1px 2px rgba(16,24,40,.05)' },
  input: { padding: '11px 13px', fontSize: 14.5, fontFamily: 'inherit', borderRadius: 12 },
  btn: { padding: 12, background: '#101828', color: '#fff', border: '1px solid #101828', cursor: 'pointer', fontWeight: 700, fontSize: 15, borderRadius: 12 },
  side: { background: '#fff', color: '#101828', border: '1px solid #e9edf2', borderRadius: 16, padding: 20, boxShadow: '0 1px 2px rgba(16,24,40,.05)' },
}
