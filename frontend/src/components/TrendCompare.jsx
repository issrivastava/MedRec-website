import { useMemo, useState } from 'react'
import api, { AI_TIMEOUT } from '../api'
import { kindLabel, kindIcon, isComparableDoc } from '../reportKinds'
import { MiniChart } from './HealthUX'

const URGENCY_STYLE = {
  stable: { label: '🟢 Stable', bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
  watch: { label: '🟡 Needs doctor review', bg: '#fffaeb', border: '#fedf89', color: '#92400e' },
  urgent: { label: '🔴 Needs prompt attention', bg: '#fef3f2', border: '#fecdca', color: '#b42318' },
}

const TREND_PILL = {
  improved: 'pill-ok', worsened: 'pill-open', same: 'pill-info', stable: 'pill-info', single: 'pill-info',
}

/* Multi-report trends: pick 2+ lab reports → date-wise graphs per test +
   AI explanation (improved / same / worsened, danger check, guidelines). */
export default function TrendCompare({ docs, patientId, initialIds = [], language = 'en' }) {
  const comparable = useMemo(() => (docs || []).filter(isComparableDoc), [docs])
  const [picked, setPicked] = useState(() => new Set(initialIds))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [openChart, setOpenChart] = useState(null)

  const toggle = (id) => {
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const pickAllComparable = () => setPicked(new Set(comparable.slice(0, 12).map((d) => d.id)))
  const clear = () => { setPicked(new Set()); setResult(null); setErr('') }

  const run = async () => {
    const ids = [...picked]
    if (ids.length < 2) { setErr('Select at least 2 lab reports to trend.'); return }
    setBusy(true); setErr(''); setResult(null)
    try {
      const { data } = await api.post('/api/compare/trends',
        { doc_ids: ids, patient_id: patientId || undefined, language },
        { timeout: AI_TIMEOUT })
      setResult(data)
      if (!data.series?.length) setErr(data.ai_text || 'No overlapping numeric values across the selected reports.')
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || 'Trend analysis failed')
    } finally { setBusy(false) }
  }

  const copySummary = async () => {
    if (!result?.ai_text) return
    try { await navigator.clipboard.writeText(result.ai_text); } catch { /* ignore */ }
  }

  const u = result ? (URGENCY_STYLE[result.urgency] || URGENCY_STYLE.stable) : null

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <h4 style={{ margin: '0 0 6px' }}>📈 Multi-report trends (2+ reports)</h4>
      <p style={{ fontSize: 13, color: '#475569', margin: '0 0 8px' }}>
        Tick 2 or more lab reports — you get a date-wise graph per test plus an AI explanation:
        what changed, improved / same / worsened, danger check and care guidelines.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button onClick={pickAllComparable} disabled={!comparable.length}>Select all labs ({comparable.length})</button>
        <button onClick={clear} disabled={!picked.size && !result}>Clear</button>
        <button onClick={run} disabled={picked.size < 2 || busy} style={{ fontWeight: 800 }}>
          {busy ? 'Analysing…' : `Generate graphs + AI explanation (${picked.size})`}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(260px,100%),1fr))', gap: 6, maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8 }}>
        {(docs || []).map((d) => {
          const ok = isComparableDoc(d)
          const [icon] = kindIcon(d.report_kind, [null, ''])
          return (
            <label key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, opacity: ok ? 1 : 0.55, cursor: ok ? 'pointer' : 'not-allowed' }} title={ok ? d.title : `${d.title} — no lab values (excluded)`}>
              <input type="checkbox" checked={picked.has(d.id)} disabled={!ok} onChange={() => toggle(d.id)} style={{ marginTop: 3 }} />
              <span>
                {icon ? `${icon} ` : ''}<b>{d.title}</b>
                <br /><small style={{ color: '#64748b' }}>{d.report_kind ? kindLabel(d.report_kind) : d.doc_type} · {d.visit_date || (d.created_at || '').slice(0, 10)}{!ok ? ' · skipped' : ''}</small>
              </span>
            </label>
          )
        })}
        {!docs?.length && <small style={{ color: '#64748b' }}>No documents loaded.</small>}
      </div>
      {err && !result?.series?.length && <p style={{ color: '#92400e' }}>⚠️ {err}</p>}
      {busy && <p>⏳ Reading {picked.size} report(s) and building date-wise graphs… (AI cold start can take a minute)</p>}

      {result && !!result.series?.length && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
            <span className="pill pill-info">{result.lab_docs?.length || '?'} reports</span>
            <span className="pill pill-ok">{result.improved} improved</span>
            <span className="pill pill-open">{result.worsened} worsened</span>
            {result.abnormal_now > 0 && <span className="pill pill-open">{result.abnormal_now} abnormal now</span>}
            <span className="pill pill-info">overall: {result.overall_status}</span>
          </div>
          <div style={{ background: u.bg, border: `1px solid ${u.border}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <b style={{ color: u.color }}>{u.label}</b>
            <button onClick={copySummary} style={{ marginLeft: 10, fontSize: 12 }}>📋 Copy explanation</button>
            {result.excluded?.length > 0 && (
              <div style={{ fontSize: 12, color: u.color, marginTop: 4 }}>
                Skipped {result.excluded.length} file(s) with no lab values: {result.excluded.map((e) => e.title).join(', ')}
              </div>
            )}
          </div>
          {(result.series || []).map((s) => {
            const pts = s.points.map((p) => ({ date: p.date, value: p.value }))
            const open = openChart === s.key
            return (
              <div key={s.key} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b>{s.display} {s.unit ? <small style={{ color: '#64748b' }}>({s.unit})</small> : null}</b>
                  <span className={`pill ${TREND_PILL[s.verdict.trend] || 'pill-info'}`}>{s.verdict.label}</span>
                </div>
                <MiniChart points={pts} color={s.verdict.abnormal_now ? '#dc2626' : '#0d9488'} unit={s.unit || ''} />
                <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>
                  {s.points.map((p, i) => (
                    <span key={i}>
                      <b style={{ color: p.flag && p.flag !== 'normal' ? '#b42318' : undefined }}>{p.value}</b>
                      {p.flag && p.flag !== 'normal' ? ` (${p.flag})` : ''} · {p.date}{p.doc_title ? ` · ${p.doc_title}` : ''}{i < s.points.length - 1 ? '  →  ' : ''}
                    </span>
                  ))}
                </div>
                <button onClick={() => setOpenChart(open ? null : s.key)} style={{ fontSize: 12, marginTop: 6 }}>
                  {open ? '▴ Hide dates' : '▾ Dates'}
                </button>
                {open && (
                  <div style={{ fontSize: 12.5, marginTop: 6 }}>
                    {s.points.map((p, i) => (
                      <div key={i} className="row"><span>{p.date} — {p.doc_title}</span><span><b>{p.value} {s.unit || ''}</b> <span className={`pill ${p.flag === 'normal' ? 'pill-ok' : 'pill-open'}`}>{p.flag || '?'}</span></span></div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
            <h4 style={{ margin: '0 0 6px' }}>🤖 AI explanation {result.model_used ? <small style={{ color: '#64748b' }}>({result.model_used})</small> : null}</h4>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14 }}>{result.ai_text}</p>
            {!!result.guidelines?.length && (
              <>
                <h4 style={{ margin: '10px 0 6px' }}>✅ Guidelines</h4>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                  {result.guidelines.filter(Boolean).map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </>
            )}
            <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 0' }}>
              Informational only — not a diagnosis. Please review these graphs with your doctor.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
