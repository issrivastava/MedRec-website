import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'

/* Public (no-login) shared record view: /s/:token */
export default function PublicShare() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    api.get(`/api/sharing/public/${token}`).then(({ data }) => setData(data)).catch((e) => setErr(e.response?.data?.detail || 'Invalid link'))
  }, [token])
  if (err) return <div style={{ padding: 40 }}><h2>Share link</h2><p style={{ color: 'red' }}>{err}</p></div>
  if (!data) return <div style={{ padding: 40 }}>Loading shared record…</div>
  return (
    <div style={{ padding: '26px 30px 40px', maxWidth: 800 }}>
      <h2>Shared record — {data.owner_name}</h2>
      <p style={{ color: '#64748b' }}>{data.label} · scope: {data.scope} · views: {data.views}</p>
      {!!data.documents && (
        <section style={s.card}><h3>Documents ({data.documents.length})</h3>
          {data.documents.map((d) => <div key={d.id} style={s.row}><b>{d.title}</b> <small>{d.visit_date || ''} · Dr. {d.doctor_name || '—'} · {d.hospital || ''}</small></div>)}
        </section>
      )}
      {!!data.vitals && (
        <section style={s.card}><h3>Vitals ({data.vitals.length})</h3>
          {data.vitals.map((v, i) => <div key={i} style={s.row}>{v.type}: <b>{v.value ?? `${v.systolic}/${v.diastolic}`}</b> {v.unit} · {v.date}</div>)}
        </section>
      )}
      {!!data.prescriptions && (
        <section style={s.card}><h3>Prescriptions ({data.prescriptions.length})</h3>
          {data.prescriptions.map((p, i) => <div key={i} style={s.row}><b>{p.title || 'Prescription'}</b><p style={{ margin: '4px 0' }}>{p.content}</p></div>)}
        </section>
      )}
      <p style={{ fontSize: 12, color: '#94a3b8' }}>Shared via MedRec secure link. Contact the patient for full files.</p>
    </div>
  )
}

const s = {
  card: { border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 12, background: '#fff' },
  row: { borderBottom: '1px solid #f1f5f9', padding: '6px 0', fontSize: 14 },
}
