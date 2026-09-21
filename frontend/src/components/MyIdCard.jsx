import { useState } from 'react'

/* Shows your own unique MedRec ID (AH-XXXX) + copy + QR for in-clinic linking.
   QR uses a public QR image API; falls back to plain text offline. */
export default function MyIdCard({ user, compact }) {
  const [copied, setCopied] = useState(false)
  const [qrOk, setQrOk] = useState(true)
  const hid = user?.health_id || ''
  const role = user?.role === 'doctor' ? 'Doctor' : 'Patient'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hid || user?.id || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  if (!user) return null
  return (
    <div style={{ ...s.card, ...(compact ? s.compact : {}) }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.label}>🪪 My {role} ID — share it to connect</div>
        <div style={s.idRow}>
          <code style={s.id} title={user?.id}>{hid || user?.id?.slice(0, 8)}</code>
          <button onClick={copy} style={s.copyBtn}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <div style={s.hint}>
          {user?.role === 'patient'
            ? 'Give this ID to your doctor — they paste it under Patients → Link to chat + book you.'
            : 'Give this ID to patients — they paste it under My Doctors → Add to chat + book you.'}
        </div>
      </div>
      {hid && qrOk && (
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(hid)}`}
          alt={`QR for ${hid}`}
          width={compact ? 64 : 96}
          height={compact ? 64 : 96}
          style={s.qr}
          onError={() => setQrOk(false)}
          title="Scan to copy this ID"
        />
      )}
    </div>
  )
}

const s = {
  card: { display: 'flex', gap: 12, alignItems: 'center', background: 'linear-gradient(135deg,#eef2ff,#f0fdfa)', border: '1px solid #c7d2fe', borderRadius: 12, padding: '10px 12px', marginBottom: 12 },
  compact: { padding: '8px 10px', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: 800, color: '#3730a3' },
  idRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  id: { fontSize: 20, fontWeight: 800, letterSpacing: 1, background: '#fff', border: '1px dashed #818cf8', borderRadius: 8, padding: '2px 10px' },
  copyBtn: { padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: '1px solid #c7d2fe', background: '#fff', fontWeight: 700 },
  hint: { fontSize: 12, color: '#475569', marginTop: 4 },
  qr: { borderRadius: 8, background: '#fff', border: '1px solid #e0e7ff' },
}
