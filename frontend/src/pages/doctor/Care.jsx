import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import VitalsTracker from '../../components/VitalsTracker'
import VaccinationTracker from '../../components/VaccinationTracker'
import CompareReports from '../../components/CompareReports'
import { ReferralBox } from '../../components/CareTools'
import { useDoctor } from './DoctorContext'

export default function Care() {
  const { selectedId, selectedPatient } = useDoctor()
  const [docs, setDocs] = useState([])

  useEffect(() => {
    if (!selectedId) { setDocs([]); return }
    api.get(`/api/doctors/patients/${selectedId}/documents`).then(({ data }) => setDocs(data)).catch(() => setDocs([]))
  }, [selectedId])

  return (
    <div className="rise">
      {!selectedId && (
        <div className="empty">
          Select a patient in <Link to="/doctor/patients">Patients</Link> to use referrals, vitals and comparisons.
        </div>
      )}
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-blue">🔁</span> Referrals{selectedPatient ? ` — ${selectedPatient.patient_name}` : ''}</h3>
        <ReferralBox role="doctor" patientId={selectedId} />
      </section>
      {selectedId && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-rose">❤️</span> Vitals — {selectedPatient?.patient_name}</h3>
          <VitalsTracker role="doctor" patientId={selectedId} />
        </section>
      )}
      {selectedId && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-violet">💉</span> Vaccinations — {selectedPatient?.patient_name}</h3>
          <VaccinationTracker role="doctor" patientId={selectedId} />
        </section>
      )}
      {selectedId && (
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-teal">🔄</span> What Changed — {selectedPatient?.patient_name}</h3>
          <CompareReports docs={docs} patientId={selectedId} />
        </section>
      )}
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
}
