import { useEffect, useState } from 'react'
import api from '../api'
import ClinicalHistoryForm from './ClinicalHistoryForm'
import FamilyHistoryManager from './FamilyHistoryManager'

/* Detailed clinical history writer: self + each family profile,
   plus structured heredity entries. Assigned doctors can read it. */
export default function MyClinicalHistory() {
  const [members, setMembers] = useState([])
  const [who, setWho] = useState('me')
  const [initial, setInitial] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/api/family').then(({ data }) => setMembers(data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setInitial(null); setMsg('')
    const url = who === 'me' ? '/api/patients/me' : `/api/history/clinical/family/${who}`
    api.get(url)
      .then(({ data }) => setInitial(data))
      .catch(() => setInitial({}))
  }, [who, members.length])

  const save = async (form) => {
    setSaving(true); setMsg('')
    try {
      if (who === 'me') await api.put('/api/patients/me', form)
      else await api.put(`/api/history/clinical/family/${who}`, form)
      setMsg('Clinical history saved — your doctors can read it.')
    } catch (e) {
      setMsg(e.response?.data?.detail ? JSON.stringify(e.response.data.detail) : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const whoName = who === 'me' ? 'Myself' : (members.find((m) => m.id === who) || {}).name || 'Family member'

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 10 }}>
        Writing history for:{' '}
        <select value={who} onChange={(e) => setWho(e.target.value)} style={s.input}>
          <option value="me">Myself</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.relation ? ` (${m.relation})` : ''}</option>)}
        </select>
      </label>

      <h4 style={{ margin: '6px 0 8px' }}>📋 Detailed clinical history — {whoName}</h4>
      {initial === null
        ? <div className="empty">Loading…</div>
        : <ClinicalHistoryForm initial={initial} onSave={save} saving={saving} />}
      {msg && <p style={{ color: msg.startsWith('Clinical') ? 'green' : 'red' }}>{msg}</p>}

      <h4 style={{ margin: '18px 0 8px' }}>🧬 Family heredity entries</h4>
      <FamilyHistoryManager />
    </div>
  )
}

const s = {
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
}
