import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api'
import { findDepartment } from '../departments'

/* 2-step flow: 1) pick a hospital (Bombay / Apollo / Fortis),
   2) browse that hospital's specialties with booking links.
   Hospital directories offer no public booking API, so booking happens
   on each hospital's site via live "Book Appointment" buttons. */
export default function FindDoctors() {
  const [params] = useSearchParams()
  const [hospitals, setHospitals] = useState([])
  const [items, setItems] = useState([])
  const [note, setNote] = useState('')
  const [hospitalId, setHospitalId] = useState(null)
  const [q, setQ] = useState(params.get('specialty') || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get('/api/hospitals/'), api.get('/api/hospitals/doctors')])
      .then(([{ data: h }, { data: d }]) => {
        setHospitals(h.results || [])
        setItems(d.results || [])
        setNote(d.note || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => {
    const c = {}
    items.forEach((i) => { c[i.hospital_id] = (c[i.hospital_id] || 0) + 1 })
    return c
  }, [items])

  const hospital = hospitals.find((h) => h.id === hospitalId) || null

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return items.filter((i) =>
      i.hospital_id === hospitalId &&
      (!ql || i.specialty.toLowerCase().includes(ql) ||
        i.hospital.toLowerCase().includes(ql) ||
        (i.tags || []).some((t) => t.includes(ql))))
  }, [items, hospitalId, q])

  return (
    <div style={s.wrap} className="rise">
      <h2 style={{ margin: '0 0 4px' }}>🏥 Find Doctors for Appointment</h2>

      {loading && <div className="empty">Loading hospitals…</div>}

      {/* STEP 1 — pick a hospital */}
      {!loading && !hospital && (
        <>
          <p style={{ color: '#5d6b7a', margin: '0 0 16px', maxWidth: 720 }}>
            Step 1 of 2 — choose a hospital to see its doctors available for appointment.
          </p>
          <div style={s.grid}>
            {hospitals.map((h) => (
              <button key={h.id} onClick={() => setHospitalId(h.id)} style={s.hospCard}>
                <span style={{ fontSize: 34 }}>🏥</span>
                <b style={{ fontSize: 17, marginTop: 8 }}>{h.name}</b>
                <span style={{ fontSize: 13, color: '#5d6b7a', margin: '4px 0 10px' }}>
                  {h.cities} · {counts[h.id] || 0} specialties
                </span>
                <span style={s.pickBtn}>View doctors →</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* STEP 2 — that hospital's doctors list */}
      {!loading && hospital && (
        <>
          <p style={{ color: '#5d6b7a', margin: '0 0 12px', maxWidth: 720 }}>
            Step 2 of 2 — <b>{hospital.name}</b> ({hospital.cities}).{' '}
            <button onClick={() => setHospitalId(null)} style={s.linkBtn}>← Change hospital</button>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter specialties — e.g. cardio, neuro, skin…"
              style={{ padding: 10, fontSize: 15, width: 'min(480px, 100%)' }}
            />
            <a href={hospital.consultants_url} target="_blank" rel="noreferrer" style={s.ghostBtn}>
              All {hospital.name.split(' ')[0]} doctors ↗
            </a>
          </div>

          <div style={s.grid}>
            {shown.map((d) => {
              const guide = findDepartment(d.specialty, d.tags)
              return (
                <div key={`${d.hospital_id}-${d.specialty}`} style={s.card}>
                  <b style={{ fontSize: 16 }}>🩺 {d.specialty}</b>
                  {guide && (
                    <p style={{ fontSize: 13, color: '#334155', margin: '6px 0 0' }}>
                      <b>What it does:</b> {guide.purpose}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <a href={d.book_url} target="_blank" rel="noreferrer" style={s.bookBtn}>
                      View doctors & book ↗
                    </a>
                    {d.info_url && (
                      <a href={d.info_url} target="_blank" rel="noreferrer" style={s.ghostBtn}>
                        About department ↗
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {!shown.length && (
            <div className="empty">No specialty matches "{q}" at {hospital.name} — try e.g. cardio, neuro, ortho.</div>
          )}
        </>
      )}

      {note && <p style={{ fontSize: 12, color: '#5d6b7a', marginTop: 12 }}>ℹ️ {note}</p>}
      <p style={{ fontSize: 12, color: '#5d6b7a' }}>
        Your MedRec-registered doctors can still be booked instantly from the Appointments tab.
      </p>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 12 },
  hospCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid #dfe3e8', borderLeft: '4px solid #1e3a5f', borderRadius: 8, padding: 20, background: '#fff', cursor: 'pointer' },
  pickBtn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', borderRadius: 4, fontWeight: 700, fontSize: 14 },
  card: { border: '1px solid #dfe3e8', borderLeft: '4px solid #8b2e3c', borderRadius: 8, padding: 14, background: '#fff' },
  bookBtn: { padding: '8px 14px', background: '#8b2e3c', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'inline-block' },
  ghostBtn: { padding: '8px 14px', border: '1px solid #1a2e45', color: '#1a2e45', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 14, background: '#fff', display: 'inline-block' },
  linkBtn: { background: 'none', border: 0, color: '#1e3a5f', cursor: 'pointer', padding: 0, fontWeight: 700, boxShadow: 'none', fontSize: 14 },
}
