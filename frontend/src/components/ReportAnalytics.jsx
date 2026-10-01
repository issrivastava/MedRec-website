import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useProfile } from '../context/ProfileContext'
import { REPORT_CATEGORIES, kindLabel } from '../reportKinds'
import { RangeToggle, filterByRange, MiniChart } from './HealthUX'

/* Storage + differentiation overview: counts per category/kind,
   lab-value trends per test, prescription history per medicine. */
export default function ReportAnalytics({ docs }) {
  const { activeId } = useProfile()
  const [trends, setTrends] = useState(null)
  const [rx, setRx] = useState([])
  const [test, setTest] = useState('')
  const [range, setRange] = useState('1Y')

  useEffect(() => {
    const params = activeId ? { family_member_id: activeId } : {}
    api.get('/api/analytics/labs/trends', { params }).then(({ data }) => {
      setTrends(data)
      if (!test && data?.tests) {
        const first = Object.keys(data.tests)[0]
        if (first) setTest(first)
      }
    }).catch(() => setTrends(null))
    api.get('/api/analytics/prescriptions/trends', { params }).then(({ data }) => {
      setRx((data || []).filter((r) => r.medicine))
    }).catch(() => setRx([]))
  }, [activeId])

  const counts = useMemo(() => {
    const byCat = {}
    const byKind = {}
    ;(docs || []).forEach((d) => {
      const c = d.category || 'other'
      const k = d.report_kind || d.doc_type || 'other'
      byCat[c] = (byCat[c] || 0) + 1
      byKind[k] = (byKind[k] || 0) + 1
    })
    return { byCat, byKind }
  }, [docs])

  const series = trends?.tests?.[test]
  const allPoints = series?.points || []
  const points = useMemo(() => filterByRange(allPoints, range), [allPoints, range])
  const svg = useMemo(() => {
    if (points.length < 2) return null
    const W = 520, H = 160, P = 28
    const vals = points.map((p) => p.value).filter((v) => v != null)
    if (!vals.length) return null
    const min = Math.min(...vals), max = Math.max(...vals)
    const span = max - min || 1
    const xy = points.map((p, i) => {
      const x = P + (i * (W - 2 * P)) / Math.max(points.length - 1, 1)
      const y = H - P - ((p.value - min) / span) * (H - 2 * P)
      return { x, y, ...p }
    })
    const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    return { W, H, d, xy, min, max }
  }, [points])

  return (
    <div>
      <div className="stat-grid">
        {Object.entries(REPORT_CATEGORIES).map(([cat, spec]) => (
          <div key={cat} className="stat">
            <div className="num">{counts.byCat[cat] || 0}</div>
            <div className="lbl">{spec.label}</div>
          </div>
        ))}
      </div>

      <h4 style={{ margin: '12px 0 8px' }}>Stored kinds (X-Ray, CBC, MRI, TSH, LFT…)</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.entries(counts.byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
          <span key={k} className="pill pill-info">{kindLabel(k)} · {n}</span>
        ))}
        {!Object.keys(counts.byKind).length && <span style={{ color: '#78716c' }}>No reports stored for this profile yet.</span>}
      </div>

      <h4 style={{ margin: '12px 0 8px' }}>Lab trends (from stored reports)</h4>
      {trends?.tests && Object.keys(trends.tests).length > 0 ? (
        <>
          <div className="toolbar-row" style={{ alignItems: 'center' }}>
            <select value={test} onChange={(e) => setTest(e.target.value)} style={{ padding: 8, fontSize: 14 }}>
              {Object.entries(trends.tests).map(([k, v]) => (
                <option key={k} value={k}>{v.display_name} ({v.points.length})</option>
              ))}
            </select>
            <RangeToggle value={range} onChange={setRange} />
          </div>
          <MiniChart points={points} color="#1e3a5f" unit={series?.unit || ''} />
          <div style={{ marginTop: 8 }}>
            {points.map((p, i) => (
              <div key={i} className="doc-row" style={{ padding: '6px 10px' }}>
                <div className="grow" style={{ fontSize: 13 }}>
                  <b>{p.value} {series.unit || ''}</b> <span className={`pill ${p.flag === 'normal' ? 'pill-ok' : 'pill-open'}`}>{p.flag}</span>
                  <span style={{ color: '#5d6b7a' }}> · {p.date}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : <div className="empty">Upload lab reports (CBC, TSH, LFT…) to unlock trends.</div>}

      <h4 style={{ margin: '16px 0 8px' }}>Prescription history by medicine</h4>
      {rx.length ? rx.slice(0, 12).map((r) => (
        <div key={r.medicine} className="doc-row">
          <div className="grow">
            <b>💊 {r.medicine}</b> <span className="pill pill-info">{r.count}×</span>
            <div style={{ fontSize: 13, color: '#5d6b7a' }}>
              {(r.entries || []).slice(0, 3).map((e, i) => (
                <span key={i}>{e.date}{e.dosage ? ` · ${e.dosage}` : ''}{i < Math.min(r.entries.length, 3) - 1 ? ' | ' : ''}</span>
              ))}
              {r.entries?.length > 3 ? ` +${r.entries.length - 3} more` : ''}
            </div>
          </div>
        </div>
      )) : <div className="empty">No e-prescriptions recorded yet.</div>}
    </div>
  )
}
