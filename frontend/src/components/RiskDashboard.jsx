import { useEffect, useState } from 'react'
import api from '../api'

/* Doctor risk board: critical/watch/stable patients. */
export default function RiskDashboard() {
  const [data, setData] = useState(null)
  useEffect(() => { api.get('/api/analytics/risk').then(({ data }) => setData(data)).catch(console.error) }, [])
  if (!data) return <p>Loading risk board…</p>
  const pill = (l) => l === 'critical' ? { background: '#fee2e2', color: '#b91c1c' } : l === 'watch' ? { background: '#fef3c7', color: '#92400e' } : { background: '#dcfce7', color: '#166534' }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <span style={s.stat}>Critical: <b>{data.critical}</b></span>
        <span style={s.stat}>Watch: <b>{data.watch}</b></span>
        <span style={s.stat}>Total: <b>{data.count}</b></span>
      </div>
      {data.patients.map((p) => (
        <div key={p.patient_id} style={s.row}>
          <span><b>{p.patient_name}</b> <small>({p.patient_email})</small>
            <br /><small>SOS {p.active_sos} · unacked {p.unacked_alerts} · abnormal {p.abnormal_labs} · overdue vac {p.overdue_vaccinations}</small></span>
          <span style={{ ...s.pill, ...pill(p.level) }}>{p.level} · {p.score}</span>
        </div>
      ))}
      {!data.patients.length && <p>No patients yet.</p>}
    </div>
  )
}

const s = {
  stat: { border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', background: '#fff' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: '1px solid #f1f5f4', borderRadius: 10, padding: '8px 12px', marginBottom: 6, background: '#fff', flexWrap: 'wrap' },
  pill: { borderRadius: 999, padding: '2px 12px', fontWeight: 700, fontSize: 13 },
}
