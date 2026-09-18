import { Link } from 'react-router-dom'
import VisitNotes from '../../components/VisitNotes'
import { RxTemplates } from '../../components/CareTools'
import { useDoctor } from './DoctorContext'

export default function Prescriptions() {
  const { selectedId, selectedPatient } = useDoctor()

  return (
    <div className="rise">
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-violet">📋</span> My Rx Templates (reusable + signed PDF)</h3>
        <RxTemplates />
      </section>
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-violet">✍️</span> Write E-Prescription / Visit Note</h3>
        {!selectedId && (
          <div className="empty">
            Select a patient in <Link to="/doctor/patients">Patients</Link> first — or open their <b>Records</b> page directly.
          </div>
        )}
        {selectedId && <p>Writing for: <b>{selectedPatient?.patient_name || selectedId}</b> (<Link to={`/doctor/patients/${selectedId}`}>open records →</Link>)</p>}
        {selectedId && <VisitNotes role="doctor" patientId={selectedId} />}
      </section>
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
}
