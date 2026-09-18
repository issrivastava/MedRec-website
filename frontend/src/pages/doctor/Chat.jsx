import { Link } from 'react-router-dom'
import ChatBox from '../../components/ChatBox'
import { useDoctor } from './DoctorContext'

export default function Chat() {
  const { selectedId, selectedPatient } = useDoctor()

  return (
    <section style={s.card} className="rise">
      <h3 className="sec-head"><span className="tile t-teal">💬</span> Patient Chat{selectedPatient ? ` — ${selectedPatient.patient_name}` : ''}</h3>
      {!selectedId && <p style={{ color: '#64748b' }}>Select a patient in <Link to="/doctor/patients">Patients</Link>, or pick from inbox below.</p>}
      <ChatBox role="doctor" patientId={selectedId} />
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
}
