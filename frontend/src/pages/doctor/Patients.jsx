import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import { Avatar } from '../../components/People'
import { useDoctor } from './DoctorContext'

export default function Patients() {
  const { patients, selectedId, setSelected, reload } = useDoctor()
  const [q, setQ] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [msg, setMsg] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return patients
    return patients.filter((p) =>
      (p.patient_name || '').toLowerCase().includes(needle) ||
      (p.patient_email || '').toLowerCase().includes(needle)
    )
  }, [patients, q])

  const addPatient = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      await api.post('/api/assignments', { email: addEmail })
      setAddEmail('')
      setMsg('Patient linked ✓')
      reload()
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Could not link patient')
    }
  }

  return (
    <div className="rise">
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-blue">🧑‍🤝‍🧑</span> Patients ({patients.length})</h3>
        <form onSubmit={addPatient} className="inline-form">
          <input placeholder="Patient email to link" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} style={s.input} />
          <button style={s.primaryBtn}>Link patient</button>
          {msg && <span style={{ color: msg.includes('✓') ? 'green' : 'red' }}>{msg}</span>}
        </form>
        <div className="toolbar-row">
          <input
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...s.input, flex: 1, minWidth: 200 }}
          />
        </div>
        {!filtered.length && <div className="empty">{patients.length ? 'No patients match that search.' : 'No patients linked yet — link one by email above.'}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 10, marginTop: 12 }}>
          {filtered.map((p) => (
            <div
              key={p.patient_id}
              style={{ ...s.patCard, borderColor: selectedId === p.patient_id ? '#1e3a5f' : '#e7e5e4' }}
            >
              <Avatar seed={p.patient_id} name={p.patient_name} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{p.patient_name}</b><br />
                <small style={{ color: '#5d6b7a' }}>{p.patient_email}</small>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <Link to={`/doctor/patients/${p.patient_id}`}>
                    <button style={s.primaryBtn}>📂 Records</button>
                  </Link>
                  <button onClick={() => setSelected(p.patient_id)}>
                    {selectedId === p.patient_id ? '✓ Selected' : 'Select'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)', minWidth: 0 },
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  primaryBtn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  patCard: { display: 'flex', alignItems: 'flex-start', gap: 12, background: '#fff', border: '2px solid #e7e5e4', borderRadius: 14, padding: 12 },
}
