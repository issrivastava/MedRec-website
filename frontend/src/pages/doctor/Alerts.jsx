import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import { LabRanges } from '../../components/Alerts'
import { useDoctor } from './DoctorContext'

export default function Alerts() {
  const { selectedId, selectedPatient, patients, setSelected } = useDoctor()
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    if (!selectedId) { setAlerts([]); return }
    api.get(`/api/labs/patients/${selectedId}/alerts`).then(({ data }) => setAlerts(data)).catch(() => setAlerts([]))
  }, [selectedId])

  return (
    <section style={s.card} className="rise">
      <h3 className="sec-head"><span className="tile t-rose">⚠️</span> Lab Alerts{selectedPatient ? ` — ${selectedPatient.patient_name}` : ''}</h3>
      <div className="toolbar-row">
        <select value={selectedId} onChange={(e) => setSelected(e.target.value)} style={s.input}>
          <option value="">— Select patient —</option>
          {patients.map((p) => (
            <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_email})</option>
          ))}
        </select>
        {selectedId && <Link to={`/doctor/patients/${selectedId}`}><button>Open records →</button></Link>}
      </div>
      {!selectedId && <div className="empty">Select a patient above to see lab alerts.</div>}
      {selectedId && alerts.map((a) => (
        <div key={a.id} style={s.alert}><b>{a.test_name}: {a.value} {a.unit || ''} ({a.flag})</b> — {a.message}</div>
      ))}
      {selectedId && !alerts.length && <p>No alerts for this patient. 🎉</p>}
      {selectedId && <div style={{ marginTop: 12 }}><LabRanges patientId={selectedId} /></div>}
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  alert: { background: '#eef2f7', border: '1px solid #c9d4e2', borderRadius: 8, padding: 8, marginBottom: 6 },
}
