import { useEffect, useMemo, useState } from 'react'
import api from '../api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CHUNK_MINUTES = 30

const toMin = (t) => {
  const [h, m] = (t || '0:0').split(':').map(Number)
  return h * 60 + (m || 0)
}
const toHHMM = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/* Split weekly availability blocks into 30-min bookable chunks,
   skipping chunks already booked. */
function expandToChunks(blocks, bookedSet) {
  const out = []
  for (const b of blocks || []) {
    const end = toMin(b.end_time)
    for (let m = toMin(b.start_time); m < end; m += CHUNK_MINUTES) {
      const s = toHHMM(m)
      if (bookedSet && bookedSet.has(s)) continue
      out.push({ id: `${b.id}-${s}`, start_time: s, end_time: toHHMM(Math.min(m + CHUNK_MINUTES, end)) })
    }
  }
  out.sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
  return out
}

/* Patient: book with assigned doctors + my appointments.
   Doctor: weekly availability editor + appointment list with status actions. */
export default function Appointments({ role, doctors, patientId }) {
  const [slots, setSlots] = useState([])
  const [appts, setAppts] = useState([])
  const [book, setBook] = useState({ doctor_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
  const [docSlots, setDocSlots] = useState([])
  const [myPatients, setMyPatients] = useState([])
  const [docBook, setDocBook] = useState({ patient_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
  const [patQuery, setPatQuery] = useState('')
  const [bookMsg, setBookMsg] = useState('')
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
    setBookMsg('')
    try {
      const { data } = await api.post('/api/scheduling/appointments', book)
      setBookMsg(`Booked ✓ — Dr. ${data.doctor_name || ''} on ${data.date} at ${data.start_time}`
        + (data.token_no ? ` · Token ${data.token_no}` : ''))
      setBook({ doctor_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
      load()
    } catch (err) {
      setBookMsg(err.response?.data?.detail || 'Could not book appointment')
    }
  }

  const submitDocBook = async (e) => {
    e.preventDefault()
    setDocMsg('')
    try {
      const { data } = await api.post('/api/scheduling/appointments', { ...docBook })
      setDocBook({ patient_id: '', date: '', start_time: '', reason: '', consult_type: 'in_person' })
      setPatQuery('')
      setDocMsg(`Booked ✓ — ${data.patient_name || 'patient'} on ${data.date} at ${data.start_time}`
        + (data.token_no ? ` · Token ${data.token_no}` : ''))
      load()
    } catch (err) {
      setDocMsg(err.response?.data?.detail || 'Could not book appointment')
    }
  }

  // Doctor booking: find assigned patient by name, email or AH-XXXX health ID.
  const patMatches = useMemo(() => {
    const q = patQuery.trim().toLowerCase()
    if (!q) return myPatients
    return (myPatients || []).filter((p) =>
      (p.patient_name || '').toLowerCase().includes(q) ||
      (p.patient_email || '').toLowerCase().includes(q) ||
      (p.patient_health_id || '').toLowerCase().includes(q))
  }, [myPatients, patQuery])
  const pickedPatient = (myPatients || []).find((p) => p.patient_id === docBook.patient_id) || null
  const pickedDoctor = (doctors || []).find((d) => d.doctor_id === book.doctor_id) || null

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
    return expandToChunks(docSlots.filter((s) => s.weekday === pyWd), booked)
  })()

  const docTimings = timingsLine(docSlots)

  const slotsForDocDate = (() => {
    if (!docBook.date) return []
    const wd = new Date(docBook.date + 'T00:00:00').getDay()
    const pyWd = (wd + 6) % 7
    const booked = new Set(appts.filter((a) => a.date === docBook.date && a.status === 'booked').map((a) => a.start_time))
    return expandToChunks(slots.filter((s) => s.weekday === pyWd), booked)
  })()

  const myTimings = timingsLine(slots)

  return (
    <div>
      {role === 'patient' && (
        <form onSubmit={submitBook} style={s.block}>
          <b style={s.sectionTitle}>📅 Book appointment</b>
          <p style={s.hint}>Pick your doctor, then a date and a 30-minute time slot from their weekly hours.</p>
          <label style={s.label}>1 · Doctor
            <select value={book.doctor_id} onChange={(e) => setBook({ ...book, doctor_id: e.target.value, date: '', start_time: '' })} required style={s.input}>
              <option value="">— My doctor —</option>
              {(doctors || []).map((d) => <option key={d.doctor_id} value={d.doctor_id}>Dr. {d.doctor_name}</option>)}
            </select>
          </label>
          {book.doctor_id && (
            <p style={s.timingNote}>🕒 Dr. {pickedDoctor?.doctor_name || ''}’s hours: <b>{docTimings || 'not set yet'}</b>{!docTimings && ' — ask the doctor to add weekly availability'}</p>
          )}
          <div style={s.grid}>
            <label style={s.label}>2 · Date
              <input type="date" value={book.date} min={todayStr} onChange={(e) => setBook({ ...book, date: e.target.value, start_time: '' })} required style={s.input} />
            </label>
            <label style={s.label}>3 · Visit type
              <select value={book.consult_type} onChange={(e) => setBook({ ...book, consult_type: e.target.value })} style={s.input} title="Visit type">
                <option value="in_person">🏥 In person</option><option value="video">🎥 Video consult</option>
              </select>
            </label>
          </div>
          <div style={s.label}>4 · Time slot
            {!book.date && <p style={s.hint}>Choose a date first.</p>}
            {book.date && !slotsForDate.length && (
              <p style={s.timingWarn}>⚠️ No free slots on this date — pick a date matching the hours above.</p>
            )}
            <div style={s.slotRow}>
              {slotsForDate.map((sl) => (
                <button key={sl.id} type="button" onClick={() => setBook({ ...book, start_time: sl.start_time })}
                  className={book.start_time === sl.start_time ? 'file-tab on' : 'file-tab'}
                  title={`${sl.start_time} to ${sl.end_time}`}>
                  {sl.start_time}–{sl.end_time}
                </button>
              ))}
            </div>
          </div>
          <label style={s.label}>5 · Reason for visit
            <input placeholder="e.g. fever, follow-up, prescription refill…" value={book.reason} onChange={(e) => setBook({ ...book, reason: e.target.value })} style={s.input} />
          </label>
          {book.doctor_id && book.date && book.start_time && (
            <div style={s.summary}>
              <b>Summary:</b> Dr. {pickedDoctor?.doctor_name || ''} · {book.date} at {book.start_time}
              {' '}· {book.consult_type === 'video' ? '🎥 Video' : '🏥 In person'}
              {book.reason ? ` · “${book.reason}”` : ''}
            </div>
          )}
          {bookMsg && <p style={{ color: bookMsg.includes('✓') ? 'green' : '#b91c1c', margin: '4px 0' }}>{bookMsg}</p>}
          <button style={s.btn}>Book appointment</button>
        </form>
      )}
      {role === 'doctor' && (
        <div style={s.section}>
          <b style={s.sectionTitle}>🕒 Weekly availability</b>
          {myTimings
            ? <p style={s.timingNote}>Your operating timings: <b>{myTimings}</b> — patients see these as 30-minute slots.</p>
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
        <form onSubmit={submitDocBook} style={s.block}>
          <b style={s.sectionTitle}>📅 Book appointment</b>
          <p style={s.hint}>Find the patient by name or AH-XXXX ID, then pick a date and time from your hours{myTimings ? `: ${myTimings}` : ''}.</p>
          <div style={s.label}>1 · Patient
            {pickedPatient ? (
              <div style={s.picked}>
                <span><b>{pickedPatient.patient_name}</b></span>
                {pickedPatient.patient_health_id && <span className="pill pill-info">🪪 {pickedPatient.patient_health_id}</span>}
                <span style={s.muted}>{pickedPatient.patient_email}</span>
                <button type="button" onClick={() => { setDocBook({ ...docBook, patient_id: '' }); setPatQuery('') }} style={s.linkBtn}>Change</button>
              </div>
            ) : (
              <>
                <input placeholder="Search name or AH-XXXX ID…" value={patQuery}
                  onChange={(e) => setPatQuery(e.target.value)} style={s.input} aria-label="Find patient" />
                <div style={s.results}>
                  {patMatches.slice(0, 30).map((p) => (
                    <button key={p.patient_id} type="button"
                      onClick={() => setDocBook({ ...docBook, patient_id: p.patient_id })}
                      style={s.resultRow}>
                      <span><b>{p.patient_name}</b></span>
                      {p.patient_health_id
                        ? <span className="pill pill-info">🪪 {p.patient_health_id}</span>
                        : <span className="pill">no ID</span>}
                      <span style={s.muted}>{p.patient_email}</span>
                    </button>
                  ))}
                  {!patMatches.length && (
                    <p style={s.hint}>No assigned patient matches “{patQuery}” — check the spelling or link them in Patients first.</p>
                  )}
                  {patMatches.length > 30 && <p style={s.hint}>Showing 30 of {patMatches.length} — keep typing to narrow down.</p>}
                </div>
              </>
            )}
          </div>
          <div style={s.grid}>
            <label style={s.label}>2 · Date
              <input type="date" value={docBook.date} min={todayStr} onChange={(e) => setDocBook({ ...docBook, date: e.target.value, start_time: '' })} required style={s.input} aria-label="Date" />
            </label>
            <label style={s.label}>3 · Visit type
              <select value={docBook.consult_type} onChange={(e) => setDocBook({ ...docBook, consult_type: e.target.value })} style={s.input} title="Visit type" aria-label="Visit type">
                <option value="in_person">🏥 In person</option><option value="video">🎥 Video consult</option>
              </select>
            </label>
          </div>
          <div style={s.label}>4 · Time slot
            {!docBook.date && <p style={s.hint}>Choose a date first.</p>}
            {docBook.date && !slotsForDocDate.length && (
              <p style={s.timingWarn}>⚠️ You don’t operate on this date — pick a date matching your hours above.</p>
            )}
            <div style={s.slotRow}>
              {slotsForDocDate.map((sl) => (
                <button key={sl.id} type="button" onClick={() => setDocBook({ ...docBook, start_time: sl.start_time })}
                  className={docBook.start_time === sl.start_time ? 'file-tab on' : 'file-tab'}
                  title={`${sl.start_time} to ${sl.end_time}`}>
                  {sl.start_time}–{sl.end_time}
                </button>
              ))}
            </div>
          </div>
          <label style={s.label}>5 · Reason for visit
            <input placeholder="e.g. follow-up, test review, new complaint…" value={docBook.reason} onChange={(e) => setDocBook({ ...docBook, reason: e.target.value })} style={s.input} />
          </label>
          {pickedPatient && docBook.date && docBook.start_time && (
            <div style={s.summary}>
              <b>Summary:</b> {pickedPatient.patient_name}
              {pickedPatient.patient_health_id ? ` (${pickedPatient.patient_health_id})` : ''}
              {' '}· {docBook.date} at {docBook.start_time}
              {' '}· {docBook.consult_type === 'video' ? '🎥 Video' : '🏥 In person'}
              {docBook.reason ? ` · “${docBook.reason}”` : ''}
            </div>
          )}
          {docMsg && <p style={{ color: docMsg.includes('✓') ? 'green' : 'red', margin: '4px 0' }}>{docMsg}</p>}
          <button style={s.btn} disabled={!docBook.patient_id || !docBook.date || !docBook.start_time}>
            Book appointment
          </button>
        </form>
      )}
      <b>{role === 'doctor' ? 'Appointments' : 'My appointments'} ({appts.length})</b>
      {appts.map((a) => {
        const otherId = role === 'doctor'
          ? (myPatients || []).find((p) => p.patient_id === a.patient_id)?.patient_health_id
          : null
        return (
        <div key={a.id} style={s.row}>
          <span style={{ minWidth: 0 }}>
            📅 <b>{a.date}</b> at {a.start_time}{a.end_time ? `–${a.end_time}` : ''} — {role === 'doctor' ? a.patient_name : `Dr. ${a.doctor_name}`} {a.reason ? `· ${a.reason}` : ''}
            <br />
            <span style={s.metaLine}>
              {a.token_no ? <span className="pill pill-info">🎫 Token {a.token_no}</span> : null}
              {a.consult_type === 'video' ? <span className="pill pill-info">🎥 video</span> : <span className="pill">🏥 in person</span>}
              {role === 'doctor' && otherId ? <span className="pill">🪪 {otherId}</span> : null}
              {a.fee != null ? <span className="pill">Rs.{a.fee}</span> : null}
              {a.payment_status && a.payment_status !== 'unpaid' ? <span className="pill pill-ok">{a.payment_status}</span> : null}
              {a.cancel_reason ? <span style={s.muted}>cancelled: {a.cancel_reason}</span> : null}
            </span>
            {a.video_url && a.status === 'booked' && <><br /><a href={a.video_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>▶ Join video consult</a></>}
          </span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`pill ${a.status === 'completed' ? 'pill-ok' : a.status === 'cancelled' ? 'pill-open' : 'pill-info'}`}>{a.status}</span>
            {a.status === 'booked' && (
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <input placeholder="Cancel reason" value={cancelReason[a.id] || ''} onChange={(e) => setCancelReason({ ...cancelReason, [a.id]: e.target.value })} style={s.cancelInput} />
                <button onClick={() => setStatus(a.id, 'cancelled')}>Cancel</button>
              </span>
            )}
            {role === 'doctor' && a.status === 'booked' && <button onClick={() => setStatus(a.id, 'completed')}>Complete</button>}
          </span>
        </div>
        )
      })}
      {!appts.length && <p>None yet.</p>}
    </div>
  )
}

const s = {
  section: { border: '1px solid #e7e5e4', borderRadius: 14, padding: 'clamp(12px,3vw,18px)', marginBottom: 14, background: 'linear-gradient(180deg,#f8fafc 0%,#ffffff 70%)', boxShadow: '0 1px 2px rgba(16,24,40,.05)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  /* Booking card: soft home-theme wash, labeled steps, fits the screen. */
  block: { border: '1px solid #bfe6e0', borderRadius: 16, padding: 'clamp(12px,3vw,18px)', marginBottom: 14, background: 'linear-gradient(180deg,#f0fdfa 0%,#ffffff 65%)', boxShadow: '0 1px 2px rgba(16,24,40,.05)', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  sectionTitle: { fontSize: 16 },
  hint: { fontSize: 13, color: '#5d6b7a', margin: 0 },
  muted: { fontSize: 12.5, color: '#5d6b7a' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, fontWeight: 700, minWidth: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 10, minWidth: 0 },
  slotRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  summary: { fontSize: 13.5, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '8px 12px' },
  picked: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #bfe6e0', borderRadius: 12, padding: '8px 12px', fontWeight: 400 },
  results: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto', border: '1px solid #e9edf2', borderRadius: 12, padding: 6, background: '#fff', fontWeight: 400 },
  resultRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%', textAlign: 'left', background: 'transparent', border: 0, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', boxShadow: 'none', fontWeight: 400 },
  linkBtn: { background: 'none', border: 0, color: '#0a6e63', cursor: 'pointer', padding: 0, fontWeight: 700, boxShadow: 'none', marginLeft: 'auto' },
  metaLine: { display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  cancelInput: { padding: 6, fontSize: 12, minWidth: 0, flex: '1 1 130px', maxWidth: 200 },
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  inlineForm: { display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '10px 12px', fontSize: 14, fontWeight: 400, borderRadius: 10, border: '1px solid #c3ccd6', background: '#fff', minWidth: 0, maxWidth: '100%', width: '100%', boxSizing: 'border-box' },
  btn: { padding: '10px 18px', background: '#0a6e63', color: '#fff', border: '1px solid #0a6e63', borderRadius: 12, cursor: 'pointer', alignSelf: 'flex-start', fontWeight: 700 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid #e9edf2', borderRadius: 14, padding: '12px 14px', marginBottom: 10, flexWrap: 'wrap', background: 'linear-gradient(180deg,#ffffff 0%,#fbfcfd 100%)', boxShadow: '0 1px 2px rgba(16,24,40,.05)', alignItems: 'center', minWidth: 0 },
  chip: { display: 'inline-flex', alignItems: 'center', background: '#eef2f7', border: '1px solid #c9d4e2', borderRadius: 20, padding: '5px 6px 5px 12px', margin: '0 6px 6px 0', fontSize: 13, fontWeight: 600 },
  x: { marginLeft: 6, cursor: 'pointer', border: 0, background: '#1e3a5f', color: '#fff', borderRadius: '50%', width: 20, height: 20, lineHeight: '18px', fontWeight: 700 },
  timingNote: { fontSize: 13, color: '#334155', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 10px', margin: 0 },
  timingWarn: { fontSize: 13, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px', margin: 0 },
}
