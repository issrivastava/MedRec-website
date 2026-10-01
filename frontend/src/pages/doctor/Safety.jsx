import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import { useDoctor } from './DoctorContext'

export default function Safety() {
  const [tab, setTab] = useState('audit')
  return (
    <div className="rise">
      <div className="toolbar-row" style={{ marginBottom: 12 }}>
        {[['audit', '🛡️ Audit Trail'], ['consents', '✅ Consents'], ['shares', '🔗 Patient Shares']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tab === k ? s.tabActive : s.tab}>{l}</button>
        ))}
      </div>
      {tab === 'audit' && <Audit />}
      {tab === 'consents' && <Consents />}
      {tab === 'shares' && <Shares />}
    </div>
  )
}

function Audit() {
  const [data, setData] = useState(null)
  useEffect(() => { api.get('/api/practice/audit', { params: { limit: 100 } }).then(({ data }) => setData(data)).catch(console.error) }, [])
  const exportCsv = () => {
    if (!data?.results?.length) return
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['action,patient,detail,at',
      ...data.results.map((a) => [a.action, a.patient_name || '', a.detail || '', a.created_at].map(esc).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = `medrec-audit-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(el); el.click(); el.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  if (!data) return <div className="empty">Loading audit trail…</div>
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-blue">🛡️</span> My Audit Trail ({data.count})</h3>
      <p style={s.sub}>Every record view, prescription, referral and AI use is logged here — and patients are notified when you open their records.</p>
      {!!data.results.length && <button onClick={exportCsv} style={{ marginBottom: 8 }}>⬇ Export CSV (compliance)</button>}
      {data.results.map((a) => (
        <div key={a.id} style={s.row}>
          <span><b>{a.action}</b>{a.patient_name ? ` → ${a.patient_name}` : ''}{a.detail ? ` · ${a.detail}` : ''}
            <br /><small style={{ color: '#5d6b7a' }}>{String(a.created_at).replace('T', ' ').slice(0, 19)}</small></span>
          {a.patient_id && <Link to={`/doctor/patients/${a.patient_id}`}><button>Records →</button></Link>}
        </div>
      ))}
      {!data.results.length && <div className="empty">No activity logged yet — open a patient record and it appears here.</div>}
    </section>
  )
}

function Consents() {
  const [rows, setRows] = useState([])
  useEffect(() => { api.get('/api/practice/consents').then(({ data }) => setRows(data)).catch(console.error) }, [])
  const grouped = rows.reduce((m, c) => {
    const k = c.patient_id
    m[k] = m[k] || { name: c.patient_name, id: c.patient_id, scopes: [] }
    m[k].scopes.push(`${c.scope}:${c.allowed ? 'on' : 'OFF'}`)
    return m
  }, {})
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-teal">✅</span> Patient Consents</h3>
      <p style={s.sub}>Patients control these from their side (records / vitals / prescriptions / chat). An explicit OFF blocks you — chat sends fail and record sections hide.</p>
      {Object.values(grouped).map((g) => (
        <div key={g.id} style={s.row}>
          <span><b>{g.name}</b><br /><small style={{ color: '#5d6b7a' }}>{g.scopes.join(' · ')}</small></span>
          <Link to={`/doctor/patients/${g.id}`}><button>Records →</button></Link>
        </div>
      ))}
      {!rows.length && <div className="empty">No explicit consent rules — default is allow-all. Patients can restrict you anytime.</div>}
    </section>
  )
}

function Shares() {
  const { patients, selectedId, setSelected } = useDoctor()
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!selectedId) { setRows([]); return }
    setMsg('')
    api.get('/api/practice/shares', { params: { patient_id: selectedId } })
      .then(({ data }) => setRows(data))
      .catch((e) => setMsg(e.response?.data?.detail || 'Could not load shares'))
  }, [selectedId])
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-violet">🔗</span> Patient Share Links</h3>
      <div className="toolbar-row">
        <select value={selectedId} onChange={(e) => setSelected(e.target.value)} style={s.input}>
          <option value="">— Select patient —</option>
          {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
        </select>
      </div>
      {msg && <p style={{ color: 'red' }}>{msg}</p>}
      {selectedId && rows.map((r) => (
        <div key={r.id} style={s.row}>
          <span><b>{r.scope}</b> {r.label ? `— ${r.label}` : ''}
            <br /><small style={{ color: '#5d6b7a' }}>
              {r.url_path} · views {r.views}{r.max_views ? `/${r.max_views}` : ''} · expires {r.expires_at ? String(r.expires_at).slice(0, 10) : 'never'} · {r.revoked ? 'REVOKED' : 'active'}
            </small></span>
        </div>
      ))}
      {selectedId && !rows.length && !msg && <p>No share links for this patient.</p>}
      {!selectedId && <div className="empty">Select a patient to see what they've shared with hospitals/family.</div>}
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  sub: { fontSize: 13, color: '#5d6b7a' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap', alignItems: 'center', fontSize: 14 },
  input: { padding: 8, fontSize: 14, minWidth: 0 },
  tab: { padding: '6px 12px', cursor: 'pointer', background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 8 },
  tabActive: { padding: '6px 12px', cursor: 'pointer', background: '#1e3a5f', color: '#fff', border: '1px solid #1e3a5f', borderRadius: 8, fontWeight: 700 },
}
