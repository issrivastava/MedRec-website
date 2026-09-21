import { useState } from 'react'
import api from '../api'

/* Link a doctor/patient by unique ID: AH-XXXX, email or UUID.
   role="patient" -> finds doctors; role="doctor" -> finds patients.
   Shows a preview (name/specialization/hospital) before connecting. */
export default function ConnectById({ role, onLinked }) {
  const [identifier, setIdentifier] = useState('')
  const [preview, setPreview] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const other = role === 'doctor' ? 'patient' : 'doctor'

  const lookup = async (e) => {
    e?.preventDefault()
    const id = identifier.trim()
    if (!id) return
    setMsg('')
    setPreview(null)
    setBusy(true)
    try {
      const { data } = await api.get('/api/assignments/lookup', { params: { identifier: id } })
      setPreview(data)
      if (data.already_linked) setMsg(`Already linked with ${data.full_name} ✓ — pick them in chat.`)
    } catch (err) {
      setMsg(err.response?.data?.detail || 'No doctor/patient found for that ID')
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    if (!preview) return
    setBusy(true)
    setMsg('')
    try {
      const v = identifier.trim()
      const payload = v.includes('@')
        ? { email: v }
        : v.toUpperCase().startsWith('AH-')
          ? { health_id: v.toUpperCase() }
          : { user_id: preview.id }
      await api.post('/api/assignments', payload)
      setMsg(`Connected with ${preview.full_name} ✓ — say hello in Chat.`)
      setIdentifier('')
      setPreview(null)
      onLinked?.()
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Could not link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={s.box}>
      <b style={{ fontSize: 14 }}>🔗 Connect by {other === 'doctor' ? 'Doctor' : 'Patient'} ID</b>
      <form onSubmit={lookup} style={s.row}>
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={other === 'doctor' ? 'Doctor AH-XXXX / email (e.g. AH-8K2P)' : 'Patient AH-XXXX / email'}
          style={{ ...s.input, flex: 1 }}
          spellCheck={false}
        />
        <button disabled={busy || !identifier.trim()}>{busy ? '…' : 'Find'}</button>
      </form>
      {preview && !preview.already_linked && (
        <div style={s.preview}>
          <div><b>{preview.full_name}</b> <span className="pill pill-info">{preview.health_id || preview.id.slice(0, 8)}</span></div>
          {(preview.specialization || preview.hospital) && (
            <small style={{ color: '#475569' }}>
              {[preview.specialization, preview.hospital].filter(Boolean).join(' · ')}
            </small>
          )}
          <div style={{ marginTop: 6 }}>
            <button onClick={connect} disabled={busy} style={s.connectBtn}>
              {busy ? 'Connecting…' : `Connect with ${preview.full_name.split(' ')[0]} ✓`}
            </button>
          </div>
        </div>
      )}
      {preview?.already_linked && (
        <div style={s.preview}>
          <b>{preview.full_name}</b> <span className="pill pill-ok">linked ✓</span>
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.includes('✓') ? '#166534' : '#b91c1c', marginTop: 6 }}>{msg}</div>}
      <small style={{ color: '#64748b' }}>Tip: the ID is on Profile → My {other} ID, with QR for clinics.</small>
    </div>
  )
}

const s = {
  box: { border: '1px dashed #93c5fd', background: '#f0f9ff', borderRadius: 12, padding: 10, marginBottom: 12 },
  row: { display: 'flex', gap: 8, marginTop: 6 },
  input: { padding: 8, fontSize: 14, borderRadius: 8, border: '1px solid #bae6fd', minWidth: 0 },
  preview: { background: '#fff', border: '1px solid #bae6fd', borderRadius: 10, padding: 8, marginTop: 8 },
  connectBtn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 700 },
}
