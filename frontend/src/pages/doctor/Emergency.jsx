import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import { EmergencyInbox } from '../../components/EmergencyButton'
import { useDoctor } from './DoctorContext'

export default function Emergency() {
  const { selectedId, selectedPatient, setEmgCount } = useDoctor()
  const [sosMsg, setSosMsg] = useState('')
  const [sosFeedback, setSosFeedback] = useState('')

  const raiseSos = async (e) => {
    e.preventDefault()
    setSosFeedback('')
    if (!selectedId) { setSosFeedback('Select a patient in Patients first.'); return }
    try {
      await api.post('/api/emergency/alert', { message: sosMsg || null, patient_id: selectedId })
      setSosFeedback(`🚨 SOS raised for ${selectedPatient?.patient_name || 'patient'} — notified.`)
      setSosMsg('')
      const { data: emg } = await api.get('/api/emergency/assigned').catch(() => ({ data: [] }))
      setEmgCount(emg.filter((x) => x.status === 'active').length)
    } catch (err) {
      setSosFeedback(err.response?.data?.detail || 'Could not raise SOS')
    }
  }

  return (
    <div className="rise">
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-rose">🆘</span> Raise SOS for a patient</h3>
        {!selectedId
          ? <div className="empty">Select a patient in <Link to="/doctor/patients">Patients</Link> first, then raise an SOS here.</div>
          : (
            <form onSubmit={raiseSos} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Raising for: <b>{selectedPatient?.patient_name}</b></span>
              <input placeholder="What is happening? (optional)" value={sosMsg} onChange={(e) => setSosMsg(e.target.value)} style={{ ...s.input, flex: 1, minWidth: 220 }} />
              <button type="submit" style={s.sosBtn}>🚨 Raise SOS</button>
            </form>
          )}
        {sosFeedback && <p style={{ color: sosFeedback.startsWith('🚨') ? 'green' : 'red' }}>{sosFeedback}</p>}
      </section>
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-rose">🚨</span> Patient SOS Alerts</h3>
        <EmergencyInbox refreshKey="emergency-page" />
      </section>
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  sosBtn: { padding: '8px 16px', background: '#8b2e3c', color: '#fff', border: '1px solid #6d2330', cursor: 'pointer', fontWeight: 700 },
}
