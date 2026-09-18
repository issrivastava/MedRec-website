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
  const [cancelReason, setCancelReason] = useState({})
  const [newSlot, setNewSlot] = useState({ weekday: 0, start_time: '10:00', end_time: '13:00' })

  const load = async () => {
    const { data } = await api.get('/api/scheduling/appointments/my')
    setAppts(data)
    if (role === 'doctor') {
      const { data: s } = await api.get('/api/scheduling/availability/my')
      setSlots(s)
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

  return (
    <div>
      {role === 'patient' && (
        <form onSubmit={submitBook} style={s.form}>
          <b>Book appointment</b>
          <select value={book.doctor_id} onChange={(e) => setBook({ ...book, doctor_id: e.target.value })} required style={s.input}>
            <option value="">— My doctor —</option>
            {(doctors || []).map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.doctor_name}</option>)}
          </select>
          <input type="date" value={book.date} onChange={(e) => setBook({ ...book, date: e.target.value })} required style={s.input} />
          <select value={book.start_time} onChange={(e) => setBook({ ...book, start_time: e.target.value })} required style={s.input}>
            <option value="">— Time slot —</option>
            {slotsForDate.map((sl) => <option key={sl.id} value={sl.start_time}>{sl.start_time}–{sl.end_time}</option>)}
          </select>
          <input placeholder="Reason (optional)" value={book.reason} onChange={(e) => setBook({ ...book, reason: e.target.value })} style={s.input} />
          <select value={book.consult_type} onChange={(e) => setBook({ ...book, consult_type: e.target.value })} style={s.input} title="Visit type">
            <option value="in_person">🏥 In person</option><option value="video">🎥 Video consult</option>
          </select>
          <button style={s.btn}>Book</button>
        </form>
      )}
      {role === 'doctor' && (
        <div style={{ marginBottom: 12 }}>
          <b>Weekly availability</b>
          <form onSubmit={addSlot} style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
            <select value={newSlot.weekday} onChange={(e) => setNewSlot({ ...newSlot, weekday: +e.target.value })} style={s.input}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <input type="time" value={newSlot.start_time} onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })} style={s.input} />
            <input type="time" value={newSlot.end_time} onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })} style={s.input} />
            <button style={s.btn}>Add</button>
          </form>
          {slots.map((sl) => (
            <span key={sl.id} style={s.chip}>{DAYS[sl.weekday]} {sl.start_time}–{sl.end_time}
              <button onClick={async () => { await api.delete(`/api/scheduling/availability/${sl.id}`); load() }} style={s.x}>×</button>
            </span>
          ))}
        </div>
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
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', alignSelf: 'flex-start' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, border: '1px solid #f1f5f4', borderRadius: 10, padding: '10px 12px', marginBottom: 8, flexWrap: 'wrap', background: '#fff' },
  chip: { display: 'inline-block', background: '#c9d4e2', border: '1px solid #c9d4e2', borderRadius: 12, padding: '4px 10px', margin: '0 6px 6px 0' },
  x: { marginLeft: 6, cursor: 'pointer', border: 0, background: 'none', color: '#1a2e45', fontWeight: 700 },
}
