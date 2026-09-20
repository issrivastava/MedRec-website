import { useEffect, useMemo, useState } from 'react'
import api from '../api'

const TYPES = [
  ['bp', 'BP (mmHg)'], ['sugar', 'Sugar (mg/dL)'],
  ['weight', 'Weight (kg)'], ['height', 'Height (cm)'],
  ['bmi', 'BMI'], ['temp', 'Temp (°F)'], ['spo2', 'SpO2 (%)'], ['pulse', 'Pulse (bpm)'],
]

const UNIT_HINT = {
  bp: 'e.g. 120 / 80', sugar: 'e.g. 110', weight: 'e.g. 68.5',
  height: 'e.g. 172', bmi: 'auto from height + weight', temp: 'e.g. 98.6',
  spo2: 'e.g. 98', pulse: 'e.g. 72',
}

const bmiCategory = (bmi) => {
  if (bmi == null) return null
  if (bmi < 18.5) return { label: 'Underweight', color: '#2563eb', bg: '#dbeafe' }
  if (bmi < 25) return { label: 'Healthy', color: '#15803d', bg: '#dcfce7' }
  if (bmi < 30) return { label: 'Overweight', color: '#b45309', bg: '#fef3c7' }
  return { label: 'Obese', color: '#b91c1c', bg: '#fee2e2' }
}

/* Zero-dependency SVG line chart. Points: [{date, value}]. */
function LineChart({ points, color = '#0d9488', unit = '', compact = false }) {
  const W = 340, H = compact ? 110 : 150, PL = 40, PR = 12, PT = 14, PB = 24
  const data = useMemo(() => {
    const clean = (points || [])
      .filter((p) => p && p.value != null && Number.isFinite(Number(p.value)))
      .map((p) => ({ date: p.date, value: Number(p.value) }))
      .slice(-30)
    return clean
  }, [points])

  if (!data.length) {
    return <div style={s.noData}>No readings yet — log your first one below.</div>
  }

  const vals = data.map((d) => d.value)
  let min = Math.min(...vals), max = Math.max(...vals)
  if (min === max) { min -= Math.max(1, Math.abs(min) * 0.05); max += Math.max(1, Math.abs(max) * 0.05) }
  const pad = (max - min) * 0.15
  min -= pad; max += pad

  const iw = W - PL - PR, ih = H - PT - PB
  const x = (i) => (data.length === 1 ? PL + iw / 2 : PL + (i / (data.length - 1)) * iw)
  const y = (v) => PT + (1 - (v - min) / (max - min)) * ih

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(PT + ih).toFixed(1)} L${x(0).toFixed(1)},${(PT + ih).toFixed(1)} Z`
  const ticks = [0, 0.5, 1].map((t) => min + (max - min) * t)
  const shortDate = (d) => (d || '').slice(5) || (d || '').slice(0, 10)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={PL - 5} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">
            {Number(t.toFixed(1))}
          </text>
        </g>
      ))}
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 4.5 : 3}
          fill={i === data.length - 1 ? color : '#fff'} stroke={color} strokeWidth="2">
          <title>{`${d.date}: ${d.value}${unit ? ` ${unit}` : ''}`}</title>
        </circle>
      ))}
      <text x={PL} y={H - 6} fontSize="10" fill="#64748b">{shortDate(data[0].date)}</text>
      <text x={W - PR} y={H - 6} textAnchor="end" fontSize="10" fill="#64748b">
        {data.length > 1 ? shortDate(data[data.length - 1].date) : ''}
      </text>
    </svg>
  )
}

function StatRow({ points, unit }) {
  const vals = (points || []).map((p) => Number(p.value)).filter((v) => Number.isFinite(v))
  if (!vals.length) return null
  const first = vals[0], last = vals[vals.length - 1]
  const diff = last - first
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return (
    <div style={s.statRow}>
      <span>Latest <b>{last}{unit ? ` ${unit}` : ''}</b></span>
      <span style={{ color: diff > 0 ? '#15803d' : diff < 0 ? '#b91c1c' : '#64748b' }}>
        {vals.length > 1 ? `${diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : ''}${diff.toFixed(1)}` : '—'}
      </span>
      <span>Avg <b>{avg.toFixed(1)}</b></span>
      <span>{vals.length} reading{vals.length === 1 ? '' : 's'}</span>
    </div>
  )
}

function GrowthCard({ title, icon, points, unit, color, extra }) {
  const latest = points?.length ? points[points.length - 1] : null
  return (
    <div style={{ ...s.gCard, borderTopColor: color }}>
      <div style={s.gHead}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <b>{title}</b>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
            {latest ? <>{latest.value} <small style={{ fontWeight: 400, fontSize: 13 }}>{unit}</small></> : '—'}
          </div>
          {latest && <small style={{ color: '#64748b' }}>{latest.date}</small>}
        </div>
      </div>
      {extra}
      <LineChart points={points} color={color} unit={unit} />
      <StatRow points={points} unit={unit} />
    </div>
  )
}

/* Vitals tracker: height + weight graphs, auto-BMI, full log + history. */
export default function VitalsTracker({ patientId, role }) {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [form, setForm] = useState({ vital_type: 'weight', systolic: '', diastolic: '', value: '', measured_at: '' })
  const [hw, setHw] = useState({ height: '', weight: '', measured_at: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const params = patientId && role === 'doctor' ? { patient_id: patientId } : {}
    const [{ data }, { data: sm }] = await Promise.all([
      api.get('/api/wellness/vitals', { params }),
      api.get('/api/wellness/vitals/summary', { params }).catch(() => ({ data: null })),
    ])
    setRows(data); setSummary(sm)
  }
  useEffect(() => { load().catch(console.error) }, [patientId])

  const trends = summary?.trends || {}
  const pts = (k) => (trends[k] || []).filter((p) => p.value != null)
  const heightPts = useMemo(() => pts('height'), [summary])
  const weightPts = useMemo(() => pts('weight'), [summary])
  const bmiPts = useMemo(() => pts('bmi'), [summary])
  const latestBmi = summary?.latest?.bmi?.value ?? null
  const bmiCat = bmiCategory(latestBmi)

  // Live BMI preview while logging
  const latestHeight = summary?.latest?.height?.value
  const latestWeight = summary?.latest?.weight?.value
  const previewBmi = (() => {
    const h = form.vital_type === 'height' && Number(form.value) ? Number(form.value)
      : hw.height && form.vital_type === 'weight' ? null : latestHeight
    const w = form.vital_type === 'weight' && Number(form.value) ? Number(form.value) : latestWeight
    const heightCm = form.vital_type === 'height' && Number(form.value) ? Number(form.value) : h
    if (heightCm && w && heightCm > 0) {
      const b = w / ((heightCm / 100) ** 2)
      if (b >= 10 && b <= 80) return b.toFixed(1)
    }
    return null
  })()

  const add = async (e) => {
    e.preventDefault()
    setMsg('')
    setBusy(true)
    try {
      const payload = { vital_type: form.vital_type, measured_at: form.measured_at || undefined }
      if (form.vital_type === 'bp') {
        payload.systolic = +form.systolic
        payload.diastolic = +form.diastolic
      } else {
        payload.value = +form.value
      }
      await api.post('/api/wellness/vitals', payload)
      setForm({ vital_type: form.vital_type, systolic: '', diastolic: '', value: '', measured_at: '' })
      await load()
      setMsg(form.vital_type === 'height' || form.vital_type === 'weight'
        ? '✅ Saved — BMI updated automatically.'
        : '✅ Saved.')
    } catch (err) {
      setMsg(`⚠️ ${err.response?.data?.detail || err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const addHeightWeight = async (e) => {
    e.preventDefault()
    setMsg('')
    if (!hw.height && !hw.weight) return setMsg('Enter height and/or weight.')
    setBusy(true)
    try {
      const at = hw.measured_at || undefined
      if (hw.height) await api.post('/api/wellness/vitals', { vital_type: 'height', value: +hw.height, measured_at: at })
      if (hw.weight) await api.post('/api/wellness/vitals', { vital_type: 'weight', value: +hw.weight, measured_at: at })
      setHw({ height: '', weight: '', measured_at: '' })
      await load()
      setMsg('✅ Height & weight saved — BMI updated automatically.')
    } catch (err) {
      setMsg(`⚠️ ${err.response?.data?.detail || err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const trendBars = (key) => {
    const arr = trends[key] || []
    if (!arr.length) return null
    const vals = arr.map((p) => p.value ?? p.systolic ?? 0).filter(Boolean)
    const max = Math.max(...vals, 1)
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36, marginTop: 6 }}>
        {arr.slice(-20).map((p, i) => {
          const v = p.value ?? p.systolic ?? 0
          return <div key={i} title={`${p.date}: ${p.value ?? `${p.systolic}/${p.diastolic}`}`} style={{ width: 8, height: Math.max(4, (v / max) * 34), background: '#0e7490', borderRadius: 2 }} />
        })}
      </div>
    )
  }

  const otherLatest = Object.entries(summary?.latest || {}).filter(([k]) => !['height', 'weight', 'bmi'].includes(k))

  return (
    <div>
      {summary?.hints?.map((h, i) => <div key={i} style={s.hint}>{h}</div>)}

      {/* Height / Weight / BMI graphs */}
      <div style={s.graphGrid}>
        <GrowthCard title="Height" icon="📏" points={heightPts} unit="cm" color="#2563eb" />
        <GrowthCard title="Weight" icon="⚖️" points={weightPts} unit="kg" color="#0d9488" />
        <GrowthCard
          title="BMI (auto)"
          icon="🧮"
          points={bmiPts}
          unit="kg/m²"
          color="#7c3aed"
          extra={latestBmi && bmiCat && (
            <span style={{ ...s.bmiPill, color: bmiCat.color, background: bmiCat.bg }}>
              {latestBmi} · {bmiCat.label}
            </span>
          )}
        />
      </div>

      {role !== 'doctor' && (
        <>
          <form onSubmit={addHeightWeight} style={s.hwForm}>
            <b>📏⚖️ Log height & weight</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Height (cm)" type="number" step="any" min="30" max="250"
                value={hw.height} onChange={(e) => setHw({ ...hw, height: e.target.value })} style={s.input} />
              <input placeholder="Weight (kg)" type="number" step="any" min="2" max="400"
                value={hw.weight} onChange={(e) => setHw({ ...hw, weight: e.target.value })} style={s.input} />
              <input type="date" value={hw.measured_at}
                onChange={(e) => setHw({ ...hw, measured_at: e.target.value })} style={s.input} />
              <button style={s.btn} disabled={busy}>{busy ? 'Saving…' : 'Save both'}</button>
            </div>
            <small style={{ color: '#64748b' }}>
              BMI is calculated automatically (weight ÷ height²). Log regularly to grow the graphs above.
            </small>
          </form>

          <form onSubmit={add} style={s.form}>
            <b>Log other vital</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={form.vital_type} onChange={(e) => setForm({ ...form, vital_type: e.target.value, value: '', systolic: '', diastolic: '' })} style={s.input}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {form.vital_type === 'bp' ? (<>
                <input placeholder="Systolic" type="number" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} required style={s.input} />
                <input placeholder="Diastolic" type="number" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} required style={s.input} />
              </>) : (
                <input placeholder={UNIT_HINT[form.vital_type] || 'Value'} type="number" step="any"
                  value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
                  required style={s.input} disabled={form.vital_type === 'bmi'} title={form.vital_type === 'bmi' ? 'BMI is auto-calculated — log height + weight instead' : undefined} />
              )}
              <input type="date" value={form.measured_at} onChange={(e) => setForm({ ...form, measured_at: e.target.value })} style={s.input} />
              <button style={s.btn} disabled={busy || form.vital_type === 'bmi'}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
            {previewBmi && (form.vital_type === 'height' || form.vital_type === 'weight') && (
              <small style={{ color: '#0e7490' }}>→ BMI would be <b>{previewBmi}</b> ({bmiCategory(Number(previewBmi))?.label})</small>
            )}
            {form.vital_type === 'bmi' && (
              <small style={{ color: '#64748b' }}>BMI is auto-calculated from your latest height + weight — no manual entry needed.</small>
            )}
            {msg && <small style={{ color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</small>}
          </form>
        </>
      )}

      {otherLatest.length > 0 && (
        <div style={s.grid}>
          {otherLatest.map(([k, v]) => (
            <div key={k} style={s.card}>
              <b style={{ textTransform: 'uppercase', fontSize: 12 }}>{k}</b>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {k === 'bp' ? `${v.systolic}/${v.diastolic}` : v.value} <small style={{ fontWeight: 400 }}>{v.unit}</small>
              </div>
              <small style={{ color: '#64748b' }}>{v.date}</small>
              {trendBars(k)}
            </div>
          ))}
        </div>
      )}
      {summary && !Object.keys(summary.latest || {}).length && <p>No vitals yet — log height & weight above to start your graphs.</p>}

      <details style={{ marginTop: 8 }}>
        <summary>History ({rows.length})</summary>
        {rows.slice(0, 30).map((r) => (
          <div key={r.id} style={s.row}>
            <span><b>{r.vital_type}</b> — {r.vital_type === 'bp' ? `${r.systolic}/${r.diastolic} ${r.unit}` : `${r.value} ${r.unit || ''}`} · {r.measured_at}</span>
            {role !== 'doctor' && <button onClick={async () => { await api.delete(`/api/wellness/vitals/${r.id}`); load() }}>Delete</button>}
          </div>
        ))}
      </details>
    </div>
  )
}

const s = {
  graphGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginBottom: 12 },
  gCard: { border: '1px solid #e2e8f0', borderTop: '4px solid #0d9488', background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 3px rgba(15,118,110,.08)' },
  gHead: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 4 },
  bmiPill: { display: 'inline-block', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, marginBottom: 4 },
  statRow: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#475569', marginTop: 6 },
  noData: { color: '#64748b', fontSize: 13, padding: '18px 0', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 10, marginTop: 10 },
  card: { border: '1px solid #cffafe', background: '#ecfeff', borderRadius: 10, padding: 10 },
  hwForm: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 },
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  input: { padding: 8, fontSize: 14, minWidth: 0, flex: '1 1 140px' },
  btn: { padding: '8px 14px', background: '#0e7490', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 14, gap: 8 },
  hint: { background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 10px', marginBottom: 6, fontSize: 13 },
}
