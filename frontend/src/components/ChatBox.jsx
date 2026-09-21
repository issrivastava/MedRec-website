import { useEffect, useRef, useState } from 'react'
import api from '../api'

/* Secure doctor-patient chat, connected by unique IDs.
   IDs accepted: UUID, AH-XXXX, or email (backend resolves).
   Patient passes doctors=[{doctor_id, doctor_name, doctor_health_id}];
   doctor passes patients=[{patient_id, patient_name, patient_health_id}].
   Features: priority/urgent, category, report attachments, search,
   read receipts, presence/availability, 1-tap video consult, SOS detection. */
const CATS = [
  ['general', '💬 General'], ['query', '❓ Query'], ['followup', '🔁 Follow-up'],
  ['prescription', '💊 Prescription'], ['report', '📄 Report'],
  ['appointment', '📅 Appointment'], ['video', '🎥 Video'],
]

export default function ChatBox({ role, doctorId, patientId, doctors, patients }) {
  const [msgs, setMsgs] = useState([])
  const [threads, setThreads] = useState([])
  const [text, setText] = useState('')
  const [other, setOther] = useState(doctorId || patientId || '')
  const [err, setErr] = useState('')
  const [priority, setPriority] = useState('normal')
  const [category, setCategory] = useState('general')
  const [attachId, setAttachId] = useState('')
  const [docs, setDocs] = useState([])
  const [search, setSearch] = useState('')
  const [presence, setPresence] = useState(null)
  const [showVideo, setShowVideo] = useState(false)
  const [video, setVideo] = useState({ date: '', start_time: '', reason: '' })
  const [videoMsg, setVideoMsg] = useState('')
  const bottomRef = useRef(null)

  const counterparts = role === 'doctor'
    ? (patients || []).map((p) => ({ id: p.patient_id, name: p.patient_name, hid: p.patient_health_id }))
    : (doctors || []).map((d) => ({ id: d.doctor_id, name: d.doctor_name, hid: d.doctor_health_id }))

  const loadThreads = async () => {
    const { data } = await api.get('/api/messages/threads').catch(() => ({ data: [] }))
    setThreads(data)
    if (!other && data.length) setOther(data[0].other_id)
  }
  const loadMsgs = async (qOverride) => {
    if (!other) return
    try {
      setErr('')
      const q = qOverride !== undefined ? qOverride : search
      const params = role === 'doctor' ? { patient_id: other.trim() } : { doctor_id: other.trim() }
      if (q?.trim()) params.q = q.trim()
      const { data } = await api.get('/api/messages', { params })
      setMsgs(data)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not load chat')
      setMsgs([])
    }
  }

  // Resolve the patient UUID for attachment listing (doctor side may type AH-XXXX).
  const resolvePatientId = async (raw) => {
    const v = (raw || '').trim()
    if (!v) return ''
    if (v.length === 36 && v.includes('-')) return v
    try {
      const { data } = await api.get('/api/assignments/lookup', { params: { identifier: v } })
      return data.id || ''
    } catch { return '' }
  }

  const loadDocs = async () => {
    try {
      if (role === 'patient') {
        const { data } = await api.get('/api/documents')
        setDocs(Array.isArray(data) ? data : data.results || [])
      } else if (other) {
        const pid = await resolvePatientId(other)
        const target = pid || other
        const { data } = await api.get(`/api/doctors/patients/${target}/documents`).catch(() => ({ data: [] }))
        setDocs(data || [])
      }
    } catch { setDocs([]) }
  }

  const loadPresence = async () => {
    if (role !== 'patient' || !other) { setPresence(null); return }
    try {
      const { data } = await api.get(`/api/scheduling/doctors/${encodeURIComponent(other.trim())}/presence`)
      setPresence(data)
    } catch { setPresence(null) }
  }

  useEffect(() => { loadThreads().catch(console.error) }, [])
  useEffect(() => { setOther(doctorId || patientId || '') }, [doctorId, patientId])
  useEffect(() => {
    loadMsgs().catch(console.error)
    loadDocs().catch(() => {})
    loadPresence().catch(() => {})
    const t = setInterval(() => loadMsgs().catch(() => {}), 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [other])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // Debounced server-side search.
  useEffect(() => {
    if (!other) return
    const t = setTimeout(() => loadMsgs(search).catch(() => {}), 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim() || !other) return
    try {
      setErr('')
      const base = role === 'doctor'
        ? { patient_id: other.trim(), body: text }
        : { doctor_id: other.trim(), body: text }
      await api.post('/api/messages', {
        ...base, body: text.trim(), priority, category,
        attachment_document_id: attachId || undefined,
      })
      setText(''); setAttachId('')
      if (priority === 'urgent') setPriority('normal')
      loadMsgs(); loadThreads().catch(() => {})
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not send message')
    }
  }

  const sendVideo = async (e) => {
    e.preventDefault()
    setVideoMsg('')
    try {
      await api.post('/api/messages/video-request', { other_id: other.trim(), ...video })
      setVideoMsg('Video consult booked ✓ — link posted in chat')
      setVideo({ date: '', start_time: '', reason: '' })
      setShowVideo(false)
      loadMsgs(); loadThreads().catch(() => {})
    } catch (e) {
      setVideoMsg(e.response?.data?.detail || 'Could not book video consult')
    }
  }

  const sosBanner = msgs.some((m) => m.sos_detected)

  const otherName = threads.find((t) => t.other_id === other)?.other_name
    || counterparts.find((c) => c.id === other)?.name || ''
  const otherHid = threads.find((t) => t.other_id === other)?.other_health_id
    || counterparts.find((c) => c.id === other)?.hid || ''

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={s.inbox}>
        <b>💬 Inbox</b>
        {counterparts.length > 0 && (
          <select value={counterparts.some((c) => c.id === other) ? other : ''} onChange={(e) => setOther(e.target.value)} style={s.input} aria-label={role === 'doctor' ? 'Select patient' : 'Select doctor'}>
            <option value="">{role === 'doctor' ? '— Select patient —' : '— Select doctor —'}</option>
            {counterparts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.hid ? ` (${c.hid})` : ''}</option>)}
          </select>
        )}
        {threads.map((t) => (
          <div key={t.other_id} onClick={() => setOther(t.other_id)}
            style={{ ...s.thread, ...(other === t.other_id ? s.threadActive : {}) }}>
            <b>{t.other_name}</b> {t.unread > 0 && <span style={s.unread}>{t.unread}</span>}
            {t.last_priority === 'urgent' && <span style={s.urgentDot} title="Has urgent">🔴</span>}
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
        {otherName && (
          <div style={s.header}>
            <div><b>{otherName}</b> {otherHid && <span style={s.hid}>{otherHid}</span>} <span style={{ color: '#64748b', fontSize: 12 }}>· connected by patient + doctor ID</span></div>
            {role === 'patient' && presence && (
              <div style={s.presence}>
                {presence.on_leave_today
                  ? <span className="pill pill-open">🌴 On leave today</span>
                  : <span className="pill pill-ok">🕒 {presence.timings_line || 'Timings not set'}</span>}
                {presence.next_available && <small style={{ color: '#475569' }}> · next free: {presence.next_available}</small>}
              </div>
            )}
          </div>
        )}
        {sosBanner && (
          <div style={s.sos}>🆘 Emergency words detected in this thread — if someone needs help now, tap <b>SOS</b> (patient dashboard) or call emergency services. Chat is not monitored 24×7.</div>
        )}
        <div style={s.toolbar}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search in chat…" style={{ ...s.input, marginTop: 0, maxWidth: 200 }} />
          <button onClick={() => setShowVideo((v) => !v)} style={s.smallBtn} title="Book a video consult in this thread">🎥 Video</button>
        </div>
        {showVideo && (
          <form onSubmit={sendVideo} style={s.videoBox}>
            <b>🎥 Book video consult with {otherName || 'them'}</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <input type="date" value={video.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setVideo({ ...video, date: e.target.value })} required style={s.input} />
              <input type="time" value={video.start_time} onChange={(e) => setVideo({ ...video, start_time: e.target.value })} required style={s.input} />
              <input placeholder="Reason (optional)" value={video.reason} onChange={(e) => setVideo({ ...video, reason: e.target.value })} style={{ ...s.input, flex: 1, minWidth: 140 }} />
              <button style={s.btn}>Book video</button>
            </div>
            {presence?.timings_line && <small style={{ color: '#475569' }}>Doctor operates: {presence.timings_line}</small>}
            {videoMsg && <div style={{ fontSize: 13, color: videoMsg.includes('✓') ? 'green' : '#b91c1c' }}>{videoMsg}</div>}
          </form>
        )}
        <div style={s.chat}>
          {msgs.map((m) => {
            const mine = m.sender_id !== other
            const urgent = m.priority === 'urgent'
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...(mine ? s.mine : s.their), ...(urgent ? s.urgentMsg : {}), ...(m.sos_detected ? s.sosMsg : {}) }} title={m.created_at}>
                  <div style={s.meta}>
                    <span style={{ fontSize: 11, opacity: .75 }}>{m.sender_name}</span>
                    {m.category !== 'general' && <span style={s.cat}>{CATS.find(([k]) => k === m.category)?.[1] || m.category}</span>}
                    {urgent && <span style={s.urgentPill}>🔴 URGENT</span>}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  {m.attachment_document_id && (
                    <div style={s.attach}>📎 {m.attachment_title || 'Attached report'} <small>({m.attachment_document_id.slice(0, 8)})</small></div>
                  )}
                  {m.sos_detected && <div style={s.sosTag}>🆘 possible emergency — consider SOS / call</div>}
                  <div style={s.receipt}>
                    {new Date(m.created_at).toLocaleString()}
                    {mine && (m.read ? ' · ✓✓ Seen' : ' · ✓ Sent')}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
          {!msgs.length && !err && <p style={{ color: '#94a3b8', fontSize: 13 }}>Say hello — messages are private to this patient + doctor pair. Prescriptions + follow-up reminders from the doctor land here too.</p>}
          {err && <p style={{ color: '#b91c1c', fontSize: 13 }}>{err}</p>}
        </div>
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...s.input, marginTop: 0, width: 'auto' }} title="Message category">
              {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={attachId} onChange={(e) => setAttachId(e.target.value)} style={{ ...s.input, marginTop: 0, flex: 1, minWidth: 140 }} title="Attach a report">
              <option value="">📎 No attachment</option>
              {docs.map((d) => <option key={d.id} value={d.id}>📄 {d.title} ({(d.visit_date || '').slice(0, 10) || 'undated'})</option>)}
            </select>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13, cursor: 'pointer' }} title="Urgent also notifies by email/SMS">
              <input type="checkbox" checked={priority === 'urgent'} onChange={(e) => setPriority(e.target.checked ? 'urgent' : 'normal')} /> 🔴 Urgent
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message… (chest pain / emergency auto-flags 🆘)" maxLength={4000} style={{ ...s.input, marginTop: 0, flex: 1 }} />
            <button style={{ ...s.btn, ...(priority === 'urgent' ? s.btnUrgent : {}) }} disabled={!other || !text.trim()}>
              {priority === 'urgent' ? '🔴 Send urgent' : 'Send'}
            </button>
          </div>
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
  header: { margin: '0 0 6px', fontSize: 14 },
  presence: { marginTop: 4 },
  sos: { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '8px 10px', fontSize: 13, marginBottom: 8 },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
  smallBtn: { padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700 },
  videoBox: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 13 },
  chat: { border: '1px solid #e2e8f0', borderRadius: 12, background: 'linear-gradient(180deg,#f8fafc,#eef4ff)', padding: 12, height: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 1px 3px rgba(15,37,64,.07)' },
  mine: { background: 'linear-gradient(135deg,#1e3a5f,#2b5a83)', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '7px 12px', maxWidth: '80%', fontSize: 14, boxShadow: '0 1px 4px rgba(30,58,95,.3)' },
  their: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px 14px 14px 4px', padding: '7px 12px', maxWidth: '80%', fontSize: 14 },
  urgentMsg: { outline: '2px solid #ef4444', outlineOffset: 1 },
  sosMsg: { borderColor: '#ef4444', background: '#fef2f2', color: '#7f1d1d' },
  meta: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' },
  cat: { fontSize: 11, background: 'rgba(127,127,127,.18)', borderRadius: 999, padding: '0 6px' },
  urgentPill: { fontSize: 11, background: '#ef4444', color: '#fff', borderRadius: 999, padding: '0 6px', fontWeight: 800 },
  urgentDot: { marginLeft: 4 },
  attach: { marginTop: 6, fontSize: 12, background: 'rgba(59,130,246,.15)', borderRadius: 8, padding: '4px 8px' },
  sosTag: { marginTop: 4, fontSize: 12, fontWeight: 700 },
  receipt: { fontSize: 11, opacity: .65, marginTop: 4 },
  btn: { padding: '10px 18px', background: 'linear-gradient(135deg,#1e3a5f,#2b5a83)', color: '#fff', border: 0, borderRadius: 10, cursor: 'pointer', fontWeight: 700 },
  btnUrgent: { background: 'linear-gradient(135deg,#b91c1c,#ef4444)' },
  unread: { background: '#ef4444', color: '#fff', borderRadius: 999, padding: '0 7px', fontSize: 12, marginLeft: 6 },
}
