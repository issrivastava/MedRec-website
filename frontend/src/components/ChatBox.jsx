import { useEffect, useRef, useState } from 'react'
import api from '../api'

/* Secure doctor-patient chat. Patient passes doctorId; doctor passes patientId. */
export default function ChatBox({ role, doctorId, patientId }) {
  const [msgs, setMsgs] = useState([])
  const [threads, setThreads] = useState([])
  const [text, setText] = useState('')
  const [other, setOther] = useState(doctorId || patientId || '')
  const bottomRef = useRef(null)

  const loadThreads = async () => {
    const { data } = await api.get('/api/messages/threads').catch(() => ({ data: [] }))
    setThreads(data)
    if (!other && data.length) setOther(data[0].other_id)
  }
  const loadMsgs = async () => {
    if (!other) return
    const params = role === 'doctor' ? { patient_id: other } : { doctor_id: other }
    const { data } = await api.get('/api/messages', { params })
    setMsgs(data)
  }

  useEffect(() => { loadThreads().catch(console.error) }, [])
  useEffect(() => { setOther(doctorId || patientId || '') }, [doctorId, patientId])
  useEffect(() => { loadMsgs().catch(console.error); const t = setInterval(loadMsgs, 8000); return () => clearInterval(t) }, [other])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim() || !other) return
    const payload = role === 'doctor' ? { patient_id: other, body: text } : { doctor_id: other, body: text }
    await api.post('/api/messages', payload)
    setText('')
    loadMsgs()
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 180, flex: '0 0 200px' }}>
        <b>Inbox</b>
        {threads.map((t) => (
          <div key={t.other_id} onClick={() => setOther(t.other_id)}
            style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginTop: 6, background: other === t.other_id ? '#dbeafe' : '#f8fafc', border: '1px solid #e2e8f0' }}>
            <b>{t.other_name}</b> {t.unread > 0 && <span style={s.unread}>{t.unread}</span>}
            <div style={{ fontSize: 12, color: '#64748b' }}>{t.last_body}</div>
          </div>
        ))}
        {!threads.length && <p style={{ fontSize: 13 }}>No chats yet.</p>}
        <div style={{ marginTop: 8 }}>
          <small>Chat with ID:</small>
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder={role === 'doctor' ? 'patient id' : 'doctor id'} style={{ width: '100%', padding: 6, fontSize: 12 }} />
        </div>
      </div>
      <div style={{ flex: '1 1 300px' }}>
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
          {!msgs.length && <p style={{ color: '#94a3b8', fontSize: 13 }}>Say hello — messages are private to this doctor-patient pair.</p>}
        </div>
        <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" maxLength={4000} style={{ flex: 1, padding: 10 }} />
          <button style={s.btn} disabled={!other || !text.trim()}>Send</button>
        </form>
      </div>
    </div>
  )
}

const s = {
  chat: { border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: 10, height: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 },
  mine: { background: '#1e3a5f', color: '#fff', borderRadius: '12px 12px 2px 12px', padding: '6px 10px', maxWidth: '80%', fontSize: 14 },
  their: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px 12px 12px 2px', padding: '6px 10px', maxWidth: '80%', fontSize: 14 },
  btn: { padding: '10px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  unread: { background: '#ef4444', color: '#fff', borderRadius: 999, padding: '0 7px', fontSize: 12, marginLeft: 6 },
}
