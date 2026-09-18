import { useEffect, useState } from 'react'
import api, { AI_TIMEOUT } from '../../api'
import { useDoctor } from './DoctorContext'

export default function Insights() {
  const [stats, setStats] = useState(null)
  useEffect(() => { api.get('/api/practice/analytics').then(({ data }) => setStats(data)).catch(console.error) }, [])
  return (
    <div className="rise">
      {!stats && <div className="empty">Loading practice analytics…</div>}
      {stats && (
        <>
          <div className="stat-grid">
            <div className="gstat g-blue"><div className="num">{stats.patients}</div><div className="lbl">Patients (+{stats.new_patients_30d} / 30d)</div><span className="big-icon">🧑‍🤝‍🧑</span></div>
            <div className="gstat g-teal"><div className="num">{stats.appointments_total}</div><div className="lbl">Appointments</div><span className="big-icon">📅</span></div>
            <div className="gstat g-violet"><div className="num">₹{stats.revenue_collected}</div><div className="lbl">Collected (₹{stats.fees_pending} pending)</div><span className="big-icon">💰</span></div>
            <div className="gstat g-amber"><div className="num">{stats.rating_avg ?? '—'}★</div><div className="lbl">{stats.rating_count} reviews</div><span className="big-icon">⭐</span></div>
          </div>
          <div className="cols-2">
            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-teal">📊</span> Visits / week (8w)</h3>
              <Bars data={stats.visits_per_week} />
              <p style={s.small}>No-show rate: <b>{(stats.no_show_rate * 100).toFixed(1)}%</b> · Unacked alerts: <b>{stats.unacked_alerts}</b> · Notes: <b>{stats.notes_written}</b></p>
              <p style={s.small}>Status: {Object.entries(stats.by_status).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</p>
            </section>
            <section style={s.card}>
              <h3 className="sec-head"><span className="tile t-violet">🏷️</span> Top reasons & diagnoses</h3>
              <TwoCol left={stats.top_reasons.map((r) => [r.reason, r.count])} right={stats.top_diagnoses.map((r) => [r.diagnosis, r.count])} />
            </section>
          </div>
        </>
      )}
      <SoapTool />
      <InteractionTool />
    </div>
  )
}

function Bars({ data }) {
  const entries = Object.entries(data || {})
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', minHeight: 90, marginTop: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ flex: 1, textAlign: 'center' }} title={`${k}: ${v}`}>
          <div style={{ background: '#1e3a5f', height: Math.max(4, (v / max) * 80), borderRadius: 4 }} />
          <small style={{ fontSize: 10 }}>{k.slice(5)}</small><br />
          <small style={{ fontSize: 11, fontWeight: 700 }}>{v}</small>
        </div>
      ))}
    </div>
  )
}

function TwoCol({ left, right }) {
  const rows = Math.max(left.length, right.length)
  if (!rows) return <div className="empty">Not enough data yet.</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
      <div><b>Reasons</b>{left.map(([k, v], i) => <div key={i} style={s.line}>{k} <b>×{v}</b></div>) || <small>—</small>}</div>
      <div><b>Diagnoses</b>{right.map(([k, v], i) => <div key={i} style={s.line}>{k} <b>×{v}</b></div>) || <small>—</small>}</div>
    </div>
  )
}

function SoapTool() {
  const { selectedId, selectedPatient } = useDoctor()
  const [notes, setNotes] = useState('')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async () => {
    setBusy(true); setErr(''); setOut(null)
    try {
      const { data } = await api.post('/api/practice/ai-soap',
        { notes, patient_id: selectedId || undefined }, { timeout: AI_TIMEOUT })
      setOut(data)
    } catch (e) { setErr(e.response?.data?.detail || 'AI unavailable — start Ollama or set GEMINI_API_KEY') }
    finally { setBusy(false) }
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-blue">🧠</span> AI SOAP Drafter {selectedPatient ? `— ${selectedPatient.patient_name}` : '(pick a patient in Patients to ground it in records)'}</h3>
      <textarea placeholder="Paste visit scribbles… e.g. fever 3d, throat pain, BP 130/85, start amox…" value={notes}
        onChange={(e) => setNotes(e.target.value)} rows={4} style={{ ...s.input, width: '100%' }} />
      <div style={{ marginTop: 8 }}><button onClick={run} disabled={busy || notes.trim().length < 5}>{busy ? 'Drafting…' : 'Draft SOAP note'}</button></div>
      {err && <p style={{ color: 'red' }}>{err}</p>}
      {out && (
        <div style={s.aiBox}>
          <small style={{ color: '#5d6b7a' }}>via {out.engine} · {out.disclaimer}</small>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '6px 0 0' }}>{out.soap_draft}</pre>
        </div>
      )}
    </section>
  )
}

function InteractionTool() {
  const [meds, setMeds] = useState('')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async () => {
    setBusy(true); setErr(''); setOut(null)
    try {
      const list = meds.split('\n').map((m) => m.trim()).filter(Boolean)
      const { data } = await api.post('/api/practice/ai-interaction', { medicines: list }, { timeout: AI_TIMEOUT })
      setOut(data)
    } catch (e) { setErr(e.response?.data?.detail || 'AI unavailable') }
    finally { setBusy(false) }
  }
  return (
    <section style={s.card}>
      <h3 className="sec-head"><span className="tile t-rose">💊</span> Drug-Interaction Screen</h3>
      <textarea placeholder="One medicine per line… e.g. Warfarin&#10;Ibuprofen&#10;Metformin" value={meds}
        onChange={(e) => setMeds(e.target.value)} rows={3} style={{ ...s.input, width: '100%' }} />
      <div style={{ marginTop: 8 }}><button onClick={run} disabled={busy || !meds.trim()}>{busy ? 'Checking…' : 'Check interactions'}</button></div>
      {err && <p style={{ color: 'red' }}>{err}</p>}
      {out && (
        <div style={s.aiBox}>
          <small style={{ color: '#5d6b7a' }}>via {out.engine} · {out.disclaimer}</small>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '6px 0 0' }}>{out.review}</pre>
        </div>
      )}
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
  input: { padding: 8, fontSize: 14, fontFamily: 'inherit' },
  small: { fontSize: 13, color: '#334155' },
  line: { borderBottom: '1px solid #f1f5f4', padding: '4px 0' },
  aiBox: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginTop: 10, fontSize: 14 },
}
