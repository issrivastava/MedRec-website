import { useEffect, useState } from 'react'
import api from '../api'

/* Health alerts: patient acknowledges; doctor views + sets approved ranges. */
export function AlertsPanel() {
  const [alerts, setAlerts] = useState([])
  const [idx, setIdx] = useState(0)
  const [showReviewed, setShowReviewed] = useState(false)
  const [touchX, setTouchX] = useState(null)
  const load = async () => {
    const { data } = await api.get('/api/labs/alerts/my')
    setAlerts(data)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const open = alerts.filter((a) => !a.acknowledged)
  const done = alerts.filter((a) => a.acknowledged)
  const list = showReviewed ? done : open
  // Keep the cursor valid when the list shrinks (e.g. after marking reviewed).
  const safeIdx = list.length ? Math.min(idx, list.length - 1) : 0
  const cur = list[safeIdx]

  if (!alerts.length) return <p>No health alerts — lab values look fine. 🎉</p>

  const go = (d) => {
    if (!list.length) return
    setIdx((i) => (Math.min(i, list.length - 1) + d + list.length) % list.length)
  }
  const markReviewed = async (id) => {
    await api.patch(`/api/labs/alerts/${id}`)
    await load()
    // Stay on the same position — the next alert slides in automatically.
  }
  const switchTab = (reviewed) => {
    setShowReviewed(reviewed)
    setIdx(0)
  }

  return (
    <div>
      <p style={{ color: '#1a2e45', fontWeight: 700, margin: '0 0 8px' }}>
        {open.length > 0
          ? `⚠ ${open.length} value(s) need attention — consider a checkup.`
          : 'All caught up — every alert reviewed. 🎉'}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => switchTab(false)}
          style={showReviewed ? s.tab : { ...s.tab, ...s.tabOn }}
        >
          Needs attention ({open.length})
        </button>
        <button
          type="button"
          onClick={() => switchTab(true)}
          style={showReviewed ? { ...s.tab, ...s.tabOn } : s.tab}
        >
          Reviewed ({done.length})
        </button>
      </div>

      {cur ? (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(1)
            if (e.key === 'ArrowLeft') go(-1)
          }}
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX == null) return
            const dx = e.changedTouches[0].clientX - touchX
            if (dx < -40) go(1)
            else if (dx > 40) go(-1)
            setTouchX(null)
          }}
          style={s.slide}
          aria-roledescription="carousel"
          aria-label={`Alert ${safeIdx + 1} of ${list.length}`}
        >
          <button type="button" onClick={() => go(-1)} disabled={list.length < 2} style={s.arrow} aria-label="Previous alert">‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#5d6b7a', marginBottom: 4 }}>
              {safeIdx + 1} of {list.length}
            </div>
            <span className={`pill ${cur.flag === 'high' ? 'pill-high' : 'pill-low'}`}>{cur.flag.toUpperCase()}</span>{' '}
            <b>{cur.test_name}: {cur.value} {cur.unit || ''}</b>
            <p style={{ margin: '4px 0' }}>{cur.message}</p>
            <small>{cur.created_at.slice(0, 10)}</small>
            {!cur.acknowledged && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => markReviewed(cur.id)}>Mark reviewed</button>
              </div>
            )}
            <div style={s.dots} role="tablist" aria-label="Choose alert">
              {list.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={i === safeIdx}
                  aria-label={`Alert ${i + 1}: ${a.test_name} ${a.flag}`}
                  onClick={() => setIdx(i)}
                  style={i === safeIdx ? { ...s.dot, ...s.dotOn } : s.dot}
                />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => go(1)} disabled={list.length < 2} style={s.arrow} aria-label="Next alert">›</button>
        </div>
      ) : (
        <p style={{ color: '#5d6b7a' }}>
          {showReviewed ? 'No reviewed alerts yet.' : 'Nothing needs attention right now.'}
        </p>
      )}
      <p style={{ fontSize: 12, color: '#5d6b7a', margin: '8px 0 0' }}>
        Tip: swipe, use ← → keys, or tap the dots to move between alerts.
      </p>
    </div>
  )
}

export function LabRanges({ patientId }) {
  const [ranges, setRanges] = useState([])
  const [defs, setDefs] = useState([])
  const [form, setForm] = useState({ test_key: 'hemoglobin', min_value: '', max_value: '', unit: '' })

  const load = async () => {
    const [{ data: r }, { data: d }] = await Promise.all([
      api.get('/api/labs/lab-ranges', { params: { patient_id: patientId } }),
      api.get('/api/labs/lab-ranges/defaults'),
    ])
    setRanges(r); setDefs(d)
  }
  useEffect(() => { if (patientId) load().catch(console.error) }, [patientId])

  const save = async (e) => {
    e.preventDefault()
    await api.post('/api/labs/lab-ranges', {
      test_key: form.test_key, patient_id: patientId,
      min_value: form.min_value === '' ? null : +form.min_value,
      max_value: form.max_value === '' ? null : +form.max_value,
      unit: form.unit || undefined,
    })
    load()
  }

  return (
    <div>
      <b>Approved ranges for this patient</b>
      {ranges.map((r) => (
        <div key={r.id} style={s.row}><span>{r.display_name}: {r.min_value}–{r.max_value} {r.unit || ''} {r.patient_id ? '(custom)' : '(default)'}</span></div>
      ))}
      <form onSubmit={save} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={form.test_key} onChange={(e) => setForm({ ...form, test_key: e.target.value })} style={s.input}>
          {defs.map((d) => <option key={d.test_key} value={d.test_key}>{d.display_name}</option>)}
        </select>
        <input placeholder="Min" value={form.min_value} onChange={(e) => setForm({ ...form, min_value: e.target.value })} style={{ ...s.input, width: 80 }} />
        <input placeholder="Max" value={form.max_value} onChange={(e) => setForm({ ...form, max_value: e.target.value })} style={{ ...s.input, width: 80 }} />
        <input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ ...s.input, width: 90 }} />
        <button style={s.btn}>Set</button>
      </form>
    </div>
  )
}

const s = {
  slide: { display: 'flex', alignItems: 'stretch', gap: 4, background: '#eef2f7', border: '1px solid #c9d4e2', borderRadius: 8, padding: 10, outline: 'none' },
  arrow: { border: 0, background: 'transparent', fontSize: 28, lineHeight: 1, cursor: 'pointer', color: '#1e3a5f', padding: '0 6px', alignSelf: 'center' },
  dots: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: '50%', border: '1px solid #93a3b8', background: 'transparent', cursor: 'pointer', padding: 0 },
  dotOn: { background: '#1e3a5f', borderColor: '#1e3a5f' },
  tab: { padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid #c9d4e2', background: '#fff' },
  tabOn: { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' },
  row: { borderBottom: '1px solid #eee', padding: '6px 0' },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
}
