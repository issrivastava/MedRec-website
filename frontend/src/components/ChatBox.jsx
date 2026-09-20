import { useEffect, useRef, useState } from 'react'
import api from '../api'

/* Secure doctor-patient chat, connected by patient ID + doctor ID.
   IDs accepted: UUID, AH-XXXX Patient ID, or email (backend resolves).
   Patient passes doctors=[{doctor_id, doctor_name}]; doctor passes patients=[{patient_id, patient_name}]. */
export default function ChatBox({ role, doctorId, patientId, doctors, patients }) {
  const [msgs, setMsgs] = useState([])
  const [threads, setThreads] = useState([])
  const [text, setText] = useState('')
  const [other, setOther] = useState(doctorId || patientId || '')
  const [err, setErr] = useState('')
  const bottomRef = useRef(null)

  const counterparts = role === 'doctor'
    ? (patients || []).map((p) => ({ id: p.patient_id, name: p.patient_name }))
    : (doctors || []).map((d) => ({ id: d.doctor_id, name: d.doctor_name }))

  const loadThreads = async () => {
    const { data } = await api.get('/api/messages/threads').catch(() => ({ data: [] }))
    setThreads(data)
    if (!other && data.length) setOther(data[0].other_id)
  }
  const loadMsgs = async () => {
    if (!other) return
    try {
      setErr('')
      const params = role === 'doctor' ? { patient_id: other.trim() } : { doctor_id: other.trim() }
      const { data } = await api.get('/api/messages', { params })
      setMsgs(data)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not load chat')
      setMsgs([])
    }
  }

  useEffect(() => { loadThreads().catch(console.error) }, [])
  useEffect(() => { setOther(doctorId || patientId || '') }, [doctorId, patientId])
  useEffect(() => { loadMsgs().catch(console.error); const t = setInterval(loadMsgs, 8000); return () => clearInterval(t) }, [other])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim() || !other) return
    try {
      setErr('')
      const payload = role === 'doctor' ? { patient_id: other.trim(), body: text } : { doctor_id: other.trim(), body: text }
      await api.post('/api/messages', payload)
      setText('')
      loadMsgs()
      loadThreads().catch(() => {})
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not send message')
    }
  }

  const otherName = threads.find((t) => t.other_id === other)?.other_name
    || counterparts.find((c) => c.id === other)?.name || ''

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={s.inbox}>
        <b>💬 Inbox</b>
        {counterparts.length > 0 && (
          <select value={counterparts.some((c) => c.id === other) ? other : ''} onChange={(e) => setOther(e.target.value)} style={s.input} aria-label={role === 'doctor' ? 'Select patient' : 'Select doctor'}>
            <option value="">{role === 'doctor' ? '— Select patient —' : '— Select doctor —'}</option>
            {counterparts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {threads.map((t) => (
          <div key={t.other_id} onClick={() => setOther(t.other_id)}
            style={{ ...s.thread, ...(other === t.other_id ? s.threadActive : {}) }}>
            <b>{t.other_name}</b> {t.unread > 0 && <span style={s.unread}>{t.unread}</span>}
            {t.other_health_id && <span style={s.hid}>{t.other_health_id}</span>}
            <div style={{ fontSize: 12, color: '#64748b' }}>{t.last_body}</div>
          </div>
        ))}
        {!threads.length && <p style={{ fontSize: 13, color: '#64748b' }}>No chats yet — pick {role === 'doctor' ? 'a patient' : 'a doctor'} above or type their ID below.</p>}
        <div style={{ marginTop: 8 }}>
          <small style={{ color: '#64748b' }}>Chat by Patient ID / Doctor ID:</small>
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder={role === 'doctor' ? 'Patient AH-XXXX / email' : 'Doctor AH-XXXX / email'} style={s.input} />
        </div>
      </div>
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        {otherName && <p style={{ margin: '0 0 6px', fontSize: 14 }}><b>{otherName}</b> <span style={{ color: '#64748b' }}>connected by patient + doctor ID</span></p>}
        <div style={s.chat}>
          {msgs.map((m) => {
            const theirs = m.sender_id === other
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: theirs ? 'flex-start' : 'flex-end' }}>
                <div style={theirs ? s.their : s.mine} title={m.created_at}>
                  <div style={{ fontSize: 11, opacity: .7 }}>{m.sender_name}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
          {!msgs.length && !err && <p style={{ color: '#94a3b8', fontSize: 13 }}>Say hello — messages are private to this patient + doctor pair.</p>}
          {err && <p style={{ color: '#b91c1c', fontSize: 13 }}>{err}</p>}
        </div>
        <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" maxLength={4000} style={{ ...s.input, flex: 1 }} />
          <button style={s.btn} disabled={!other || !text.trim()}>Send</button>
        </form>
      </div>
    </div>
  )
}

const s = {
  inbox: { minWidth: 200, flex: '0 0 220px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, boxShadow: '0 1px 3px rgba(15,37,64,.07)', alignSelf: 'flex-start' },
  input: { width: '100%', padding: '8px 10px', fontSize: 13, marginTop: 6, borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' },
  thread: { padding: '8px 10px', borderRadius: 10, cursor: 'pointer', marginTop: 6, background: '#f8fafc', border: '1px solid #e2e8f0' },
  threadActive: { background: '#dbeafe', borderColor: '#93c5fd' },
  hid: { background: '#eef2ff', color: '#3730a3', borderRadius: 999, padding: '0 8px', fontSize: 11, marginLeft: 6, fontWeight: 700 },
  chat: { border: '1px solid #e2e8f0', borderRadius: 12, background: 'linear-gradient(180deg,#f8fafc,#eef4ff)', padding: 12, height: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 1px 3px rgba(15,37,64,.07)' },
  mine: { background: 'linear-gradient(135deg,#1e3a5f,#2b5a83)', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '7px 12px', maxWidth: '80%', fontSize: 14, boxShadow: '0 1px 4px rgba(30,58,95,.3)' },
  their: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px 14px 14px 4px', padding: '7px 12px', maxWidth: '80%', fontSize: 14 },
  btn: { padding: '10px 18px', background: 'linear-gradient(135deg,#1e3a5f,#2b5a83)', color: '#fff', border: 0, borderRadius: 10, cursor: 'pointer', fontWeight: 700 },
  unread: { background: '#ef4444', color: '#fff', borderRadius: 999, padding: '0 7px', fontSize: 12, marginLeft: 6 },
}
