import { useEffect, useState } from 'react'
import api from '../api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* Patient: book with assigned doctors + my appointments.
   Doctor: weekly availability editor + appointment list with status actions. */
export default function Appointments({ role, doctors, patientId }) {
  const [slots, setSlots] = useState([])
  const [appts, setAppts] = useState([])
  const [book, setBook] = useState({ doctor_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
  const [docSlots, setDocSlots] = useState([])
  const [myPatients, setMyPatients] = useState([])
  const [docBook, setDocBook] = useState({ patient_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
  const [docMsg, setDocMsg] = useState('')
  const [cancelReason, setCancelReason] = useState({})
  const [newSlot, setNewSlot] = useState({ weekday: 0, start_time: '10:00', end_time: '13:00' })
  const todayStr = new Date().toISOString().slice(0, 10)

  const load = async () => {
    const { data } = await api.get('/api/scheduling/appointments/my')
    setAppts(data)
    if (role === 'doctor') {
      const { data: s } = await api.get('/api/scheduling/availability/my')
      setSlots(s)
      const { data: p } = await api.get('/api/doctors/patients').catch(() => ({ data: [] }))
      setMyPatients(p || [])
    }
  }
  useEffect(() => { load().catch(console.error) }, [])

  useEffect(() => {
    if (role === 'patient' && book.doctor_id) {
      api.get(`/api/scheduling/doctors/${book.doctor_id}/availability`).then(({ data }) => setDocSlots(data)).catch(() => setDocSlots([]))
    }
  }, [book.doctor_id])

  const submitBook = async (e) => {
    e.preventDefault()
    await api.post('/api/scheduling/appointments', book)
    setBook({ doctor_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
    load()
  }

  const submitDocBook = async (e) => {
    e.preventDefault()
    setDocMsg('')
    try {
      await api.post('/api/scheduling/appointments', { ...docBook })
      setDocBook({ patient_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
      setDocMsg('Appointment added ✓')
      load()
    } catch (err) {
      setDocMsg(err.response?.data?.detail || 'Could not book appointment')
    }
  }

  // Group weekly slots by weekday for the "operating timings" line.
  const timingsLine = (list) => {
    if (!list?.length) return ''
    const byDay = {}
    list.forEach((sl) => {
      ;(byDay[sl.weekday] = byDay[sl.weekday] || []).push(`${sl.start_time}–${sl.end_time}`)
    })
    return Object.keys(byDay).sort((a, b) => a - b).map((d) => `${DAYS[d]} ${byDay[d].join(', ')}`).join(' · ')
  }

  const setStatus = async (id, status) => {
    const reason = cancelReason[id]
    await api.patch(`/api/scheduling/appointments/${id}?status=${status}${status === 'cancelled' && reason ? `&cancel_reason=${encodeURIComponent(reason)}` : ''}`)
    load()
  }

  const addSlot = async (e) => {
    e.preventDefault()
    await api.post('/api/scheduling/availability', newSlot)
    load()
  }

  const slotsForDate = (() => {
    if (!book.date) return []
    const wd = new Date(book.date + 'T00:00:00').getDay()
    const pyWd = (wd + 6) % 7 // convert Sun=0 to Mon=0
    const booked = new Set(appts.filter((a) => a.date === book.date && a.status === 'booked').map((a) => a.start_time))
    return docSlots.filter((s) => s.weekday === pyWd && !booked.has(s.start_time))
  })()

  const docTimings = timingsLine(docSlots)

  const slotsForDocDate = (() => {
    if (!docBook.date) return []
    const wd = new Date(docBook.date + 'T00:00:00').getDay()
    const pyWd = (wd + 6) % 7
    const booked = new Set(appts.filter((a) => a.date === docBook.date && a.status === 'booked').map((a) => a.start_time))
    return slots.filter((s) => s.weekday === pyWd && !booked.has(s.start_time))
  })()

  const myTimings = timingsLine(slots)

  return (
    <div>
      {role === 'patient' && (
        <form onSubmit={submitBook} style={s.section}>
          <b style={s.sectionTitle}>📅 Book appointment</b>
          <select value={book.doctor_id} onChange={(e) => setBook({ ...book, doctor_id: e.target.value, date: '', start_time: '' })} required style={s.input}>
            <option value="">— My doctor —</option>
            {(doctors || []).map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.doctor_name}</option>)}
          </select>
          {book.doctor_id && (
            <p style={s.timingNote}>🕒 Doctor’s operating timings: <b>{docTimings || 'not set yet'}</b>{!docTimings && ' — ask the doctor to add weekly availability'}</p>
          )}
          <input type="date" value={book.date} min={todayStr} onChange={(e) => setBook({ ...book, date: e.target.value, start_time: '' })} required style={s.input} />
          <select value={book.start_time} onChange={(e) => setBook({ ...book, start_time: e.target.value })} required style={s.input}>
            <option value="">— Time slot —</option>
            {slotsForDate.map((sl) => <option key={sl.id} value={sl.start_time}>{sl.start_time}–{sl.end_time}</option>)}
          </select>
          {book.doctor_id && book.date && !slotsForDate.length && (
            <p style={s.timingWarn}>⚠️ No slots on this date — pick a date matching the timings above.</p>
          )}
          <input placeholder="Reason (optional)" value={book.reason} onChange={(e) => setBook({ ...book, reason: e.target.value })} style={s.input} />
          <select value={book.consult_type} onChange={(e) => setBook({ ...book, consult_type: e.target.value })} style={s.input} title="Visit type">
            <option value="in_person">🏥 In person</option><option value="video">🎥 Video consult</option>
          </select>
          <button style={s.btn}>Book</button>
        </form>
      )}
      {role === 'doctor' && (
        <div style={s.section}>
          <b style={s.sectionTitle}>🕒 Weekly availability</b>
          {myTimings
            ? <p style={s.timingNote}>Your operating timings: <b>{myTimings}</b> — patients only see these slots.</p>
            : <p style={s.timingWarn}>⚠️ No timings set yet — add your weekly hours below so patients can book you.</p>}
          <form onSubmit={addSlot} style={s.inlineForm}>
            <select value={newSlot.weekday} onChange={(e) => setNewSlot({ ...newSlot, weekday: +e.target.value })} style={s.input} aria-label="Day">
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <input type="time" value={newSlot.start_time} onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })} style={s.input} aria-label="Start" />
            <input type="time" value={newSlot.end_time} onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })} style={s.input} aria-label="End" />
            <button style={s.btn}>Add</button>
          </form>
          <div style={{ marginTop: 4 }}>
            {slots.map((sl) => (
              <span key={sl.id} style={s.chip}>{DAYS[sl.weekday]} {sl.start_time}–{sl.end_time}
                <button onClick={async () => { await api.delete(`/api/scheduling/availability/${sl.id}`); load() }} style={s.x} aria-label="Remove">×</button>
              </span>
            ))}
            {!slots.length && <span style={{ fontSize: 13, color: '#64748b' }}>No hours added yet.</span>}
          </div>
        </div>
      )}
      {role === 'doctor' && (
        <form onSubmit={submitDocBook} style={s.section}>
          <b style={s.sectionTitle}>📅 Add appointment (with date)</b>
          <p style={s.timingNote}>Book for an assigned patient on a date where you operate{myTimings ? `: ${myTimings}` : ''}.</p>
          <div style={s.grid}>
            <select value={docBook.patient_id} onChange={(e) => setDocBook({ ...docBook, patient_id: e.target.value })} required style={s.input} aria-label="Patient">
              <option value="">— Select patient —</option>
              {myPatients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_email})</option>)}
            </select>
            <input type="date" value={docBook.date} min={todayStr} onChange={(e) => setDocBook({ ...docBook, date: e.target.value, start_time: '' })} required style={s.input} aria-label="Date" />
            <select value={docBook.start_time} onChange={(e) => setDocBook({ ...docBook, start_time: e.target.value })} required style={s.input} aria-label="Time slot">
              <option value="">— Time slot —</option>
              {slotsForDocDate.map((sl) => <option key={sl.id} value={sl.start_time}>{sl.start_time}–{sl.end_time}</option>)}
            </select>
            <input placeholder="Reason (optional)" value={docBook.reason} onChange={(e) => setDocBook({ ...docBook, reason: e.target.value })} style={s.input} />
            <select value={docBook.consult_type} onChange={(e) => setDocBook({ ...docBook, consult_type: e.target.value })} style={s.input} title="Visit type" aria-label="Visit type">
              <option value="in_person">🏥 In person</option><option value="video">🎥 Video consult</option>
            </select>
          </div>
          {docBook.date && !slotsForDocDate.length && (
            <p style={s.timingWarn}>⚠️ You don’t operate on this date — pick a date matching your timings above.</p>
          )}
          {docMsg && <p style={{ color: docMsg.includes('✓') ? 'green' : 'red', margin: '4px 0' }}>{docMsg}</p>}
          <button style={s.btn}>Add appointment</button>
        </form>
      )}
      <b>{role === 'doctor' ? 'Appointments' : 'My appointments'} ({appts.length})</b>
      {appts.map((a) => (
        <div key={a.id} style={s.row}>
          <span>📅 <b>{a.date}</b> at {a.start_time} — {role === 'doctor' ? a.patient_name : `Dr. ${a.doctor_name}`} {a.reason ? `· ${a.reason}` : ''}
            {a.consult_type === 'video' ? ' · 🎥 video' : ''}{a.cancel_reason ? ` · cancelled: ${a.cancel_reason}` : ''}<br />
            {a.video_url && a.status === 'booked' && <a href={a.video_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>▶ Join video consult</a>}
          </span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`pill ${a.status === 'completed' ? 'pill-ok' : a.status === 'cancelled' ? 'pill-open' : 'pill-info'}`}>{a.status}</span>
            {a.status === 'booked' && (
              <span style={{ display: 'flex', gap: 4 }}>
                <input placeholder="Cancel reason" value={cancelReason[a.id] || ''} onChange={(e) => setCancelReason({ ...cancelReason, [a.id]: e.target.value })} style={{ padding: 4, fontSize: 12, width: 110 }} />
                <button onClick={() => setStatus(a.id, 'cancelled')}>Cancel</button>
              </span>
            )}
            {role === 'doctor' && a.status === 'booked' && <button onClick={() => setStatus(a.id, 'completed')}>Complete</button>}
          </span>
        </div>
      ))}
      {!appts.length && <p>None yet.</p>}
    </div>
  )
}

const s = {
  section: { border: '1px solid #e7e5e4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 14, background: '#fff', boxShadow: '0 1px 3px rgba(30,58,95,.08),0 4px 14px rgba(30,58,95,.06)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  sectionTitle: { fontSize: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 8 },
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  inlineForm: { display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '10px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #d6dce3', background: '#fbfdff', minWidth: 0, maxWidth: '100%', width: '100%', boxSizing: 'border-box' },
  btn: { padding: '10px 16px', background: '#1e3a5f', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', alignSelf: 'flex-start', fontWeight: 700 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid #eef2f7', borderLeft: '4px solid #0f766e', borderRadius: 12, padding: '12px 14px', marginBottom: 10, flexWrap: 'wrap', background: '#fff', boxShadow: '0 1px 2px rgba(15,118,110,.06)', alignItems: 'center' },
  chip: { display: 'inline-flex', alignItems: 'center', background: '#eef2f7', border: '1px solid #c9d4e2', borderRadius: 20, padding: '5px 6px 5px 12px', margin: '0 6px 6px 0', fontSize: 13, fontWeight: 600 },
  x: { marginLeft: 6, cursor: 'pointer', border: 0, background: '#1e3a5f', color: '#fff', borderRadius: '50%', width: 20, height: 20, lineHeight: '18px', fontWeight: 700 },
  timingNote: { fontSize: 13, color: '#334155', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 10px', margin: 0 },
  timingWarn: { fontSize: 13, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px', margin: 0 },
}
