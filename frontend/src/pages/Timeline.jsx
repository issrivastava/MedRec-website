import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'

const KIND_STYLE = {
  document: { bg: '#f0fdfa', border: '#99f6e4', icon: '📄' },
  prescription: { bg: '#fef2f2', border: '#fecaca', icon: '💊' },
  visit: { bg: '#f0fdfa', border: '#99f6e4', icon: '🩺' },
  appointment: { bg: '#f0fdf4', border: '#bbf7d0', icon: '📅' },
}

export default function Timeline() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [patients, setPatients] = useState([])
  const selected = params.get('patient') || ''

  useEffect(() => {
    if (user?.role === 'doctor') {
      api.get('/api/doctors/patients').then(({ data }) => {
        setPatients(data)
        if (data.length && !selected) setParams({ patient: data[0].patient_id })
      }).catch(console.error)
    }
  }, [])

  useEffect(() => {
    const q = user?.role === 'doctor' ? (selected ? { patient_id: selected } : null) : {}
    if (q === null) return
    api.get('/api/timeline', { params: q }).then(({ data }) => setEvents(data)).catch(console.error)
  }, [selected, patients])

  let lastYear = ''
  return (
    <div style={s.wrap}>
      <h2 style={{ margin: '0 0 4px' }}>📈 Health Timeline</h2>
      <p style={{ color: '#78716c', margin: '0 0 12px' }}>Every report, prescription and appointment — newest first.</p>
      {user?.role === 'doctor' && (
        <select value={selected} onChange={(e) => setParams({ patient: e.target.value })} style={s.input}>
          <option value="">— Select patient —</option>
          {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
        </select>
      )}
      <div style={s.line}>
        {events.map((e, i) => {
          const year = e.date.slice(0, 4)
          const showYear = year !== lastYear
          lastYear = year
          const st = KIND_STYLE[e.kind] || KIND_STYLE.document
          return (
            <div key={i}>
              {showYear && <h3 style={s.year}>{year}</h3>}
              <div style={{ ...s.card, background: st.bg, borderColor: st.border }}>
                <span style={s.date}>{e.date}</span>
                <b> {st.icon} {e.title}</b>
                {e.member && <span style={s.member}>{e.member}</span>}
                {e.detail && <p style={{ margin: '4px 0 0' }}>{e.detail}</p>}
              </div>
            </div>
          )
        })}
      </div>
      {!events.length && <p>No events yet. <Link to="/patient">Upload a report</Link> to start your timeline.</p>}
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  input: { padding: 8, fontSize: 14, minWidth: 280, marginBottom: 12 },
  line: { borderLeft: '3px solid #99f6e4', paddingLeft: 16, marginTop: 12 },
  year: { color: '#115e59', margin: '16px 0 8px' },
  card: { border: '1px solid', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' },
  date: { background: '#0f766e', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, marginRight: 8 },
  member: { background: '#ccfbf1', borderRadius: 10, padding: '2px 10px', fontSize: 12, marginLeft: 8 },
}
