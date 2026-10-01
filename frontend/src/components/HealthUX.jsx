import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { KIND_META, DOC_TYPES } from '../reportKinds'

/* Shared HealthUX widgets — zero new dependencies (SVG + CSS only). */

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('medrec_theme') || 'light' } catch { return 'light' }
  })
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('medrec_theme', theme)
    } catch { /* ignore */ }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme()
  return (
    <button onClick={toggle} className="nav-ghost-btn" aria-label="Toggle dark mode"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

/* Range filter for trend charts: 3M / 6M / 1Y / All */
export const RANGES = [
  { key: '3M', label: '3M', months: 3 },
  { key: '6M', label: '6M', months: 6 },
  { key: '1Y', label: '1Y', months: 12 },
  { key: 'All', label: 'All', months: 0 },
]

export function RangeToggle({ value, onChange }) {
  return (
    <span className="range-toggle" role="tablist" aria-label="Timeline range">
      {RANGES.map((r) => (
        <button key={r.key} className={value === r.key ? 'on' : ''} onClick={() => onChange(r.key)}>{r.label}</button>
      ))}
    </span>
  )
}

export function filterByRange(points, rangeKey) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[3]
  if (!r.months) return points || []
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - r.months)
  return (points || []).filter((p) => {
    const d = new Date(p.date || p.measured_at || p.created_at)
    return Number.isFinite(d.getTime()) ? d >= cutoff : true
  })
}

/* Minimal SVG line chart (no deps). points: [{date, value}] */
export function MiniChart({ points, color = '#0d9488', unit = '', height = 140 }) {
  const W = 520, H = height, P = 30
  const data = useMemo(() => (points || [])
    .filter((p) => p && p.value != null && Number.isFinite(Number(p.value)))
    .map((p) => ({ date: p.date, value: Number(p.value) })), [points])
  if (!data.length) return <div style={{ fontSize: 13, color: '#667085' }}>No readings in this range.</div>
  const vals = data.map((d) => d.value)
  let min = Math.min(...vals), max = Math.max(...vals)
  if (min === max) { min -= 1; max += 1 }
  const span = max - min || 1
  const xy = data.map((p, i) => ({
    x: P + (i * (W - 2 * P)) / Math.max(data.length - 1, 1),
    y: H - P - ((p.value - min) / span) * (H - 2 * P),
    ...p,
  }))
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      <path d={`${d} L${xy[xy.length - 1].x.toFixed(1)},${H - P} L${xy[0].x.toFixed(1)},${H - P} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {xy.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === xy.length - 1 ? 4.5 : 2.5}
          fill={i === xy.length - 1 ? color : '#fff'} stroke={color} strokeWidth="2">
          <title>{`${p.date}: ${p.value}${unit ? ` ${unit}` : ''}`}</title>
        </circle>
      ))}
      <text x={P} y={H - 8} fontSize="10" fill="#64748b">{data[0].date?.slice(0, 10)}</text>
      <text x={W - P} y={H - 8} textAnchor="end" fontSize="10" fill="#64748b">{data[data.length - 1].date?.slice(0, 10)}</text>
    </svg>
  )
}

/* Status badges for a document — type-aware, never generic "Lab Report". */
export function statusBadges(d) {
  const out = []
  if (d?.has_summary) out.push({ label: '✓ Verified by AI', cls: 'badge-ok' })
  else if ((d?.ocr_chars || 0) > 20) {
    const kind = d?.report_kind
    if (kind && KIND_META[kind]) out.push({ label: `${KIND_META[kind].icon} ${KIND_META[kind].label}`, cls: 'badge-info' })
    else if (d?.doc_type && DOC_TYPES[d.doc_type]) {
      const icon = d.doc_type === 'prescription' ? '🧾' : d.doc_type === 'lab' ? '🧪' : d.doc_type === 'scan' ? '🩻' : '📄'
      out.push({ label: `${icon} ${DOC_TYPES[d.doc_type]}`, cls: 'badge-info' })
    }
    else out.push({ label: '📄 Document', cls: 'badge-info' })
  }
  else out.push({ label: '⏳ Pending Review', cls: 'badge-warn' })
  if (d?.doc_type === 'prescription') out.push({ label: '💊 Rx', cls: 'badge-teal' })
  if (d?.doc_type === 'scan') out.push({ label: '🩻 Scan', cls: 'badge-info' })
  if (d?.doc_type === 'lab') out.push({ label: '🧪 Lab', cls: 'badge-teal' })
  return out
}

export function RecordCard({ d, icon, onPreview, onSummarize }) {
  const kindKey = d?.report_kind
  const kindMeta = kindKey && KIND_META[kindKey]
  return (
    <div className="record-card">
      <div className="record-card-top">
        <span className="record-ico">{icon || '📄'}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="record-title">{d.title}</p>
          <p className="record-meta">
            {[d.visit_date, d.doctor_name, d.hospital].filter(Boolean).join(' · ') || 'Undated'}
          </p>
          {(kindMeta || d?.category) && (
            <p style={{ fontSize: 12, color: '#475569', margin: '2px 0 0' }}>
              {kindMeta ? `${kindMeta.icon} ${kindMeta.label}` : ''}
              {d?.category && <span style={{ marginLeft: 6, background: '#f1f5f9', borderRadius: 6, padding: '0 6px' }}>{d.category}</span>}
            </p>
          )}
        </div>
      </div>
      <div className="badge-row">
        {statusBadges(d).map((b) => <span key={b.label} className={`badge ${b.cls}`}>{b.label}</span>)}
      </div>
      <div className="card-actions">
        <button onClick={() => onPreview?.(d)}>👁 Preview</button>
        {onSummarize && <button onClick={() => onSummarize(d.id)}>✦ AI Summary</button>}
      </div>
    </div>
  )
}

/* Inline preview modal: metadata + OCR text + summary shortcut */
export function DocPreviewModal({ doc, onClose, onSummarize }) {
  const [ocr, setOcr] = useState(null)
  useEffect(() => {
    if (!doc) return
    setOcr(null)
    api.get(`/api/documents/${doc.id}/ocr-text`).then(({ data }) => setOcr(data)).catch(() => setOcr({ preview: '', chars: 0 }))
  }, [doc])
  if (!doc) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 style={{ margin: 0 }}>{doc.title}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#667085' }}>
              {[doc.visit_date, doc.doctor_name, doc.hospital].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="badge-row" style={{ marginBottom: 10 }}>
          {statusBadges(doc).map((b) => <span key={b.label} className={`badge ${b.cls}`}>{b.label}</span>)}
        </div>
        <h4 style={{ margin: '10px 0 6px', fontSize: 13.5 }}>OCR text {(ocr?.chars ?? doc.ocr_chars ?? 0) > 0 && `(${ocr?.chars ?? doc.ocr_chars} chars)`}</h4>
        <div className="ocr-box">{ocr ? (ocr.preview || 'No readable text yet — photo/scan may still be processing.') : 'Loading…'}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {onSummarize && <button onClick={() => onSummarize(doc.id)}>✦ Generate AI summary</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

/* Countdowns: next appointment + upcoming follow-ups/vaccines */
export function CountdownWidgets({ appointments = [], vaccinations = [], notes = [] }) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const upcoming = (appointments || [])
    .filter((a) => a.status === 'booked' && a.date)
    .map((a) => ({ ...a, _d: new Date(a.date) }))
    .filter((a) => a._d >= now)
    .sort((x, y) => x._d - y._d)
    .slice(0, 2)
  const dueVac = (vaccinations || []).filter((v) => v.status !== 'given' && v.due_date).slice(0, 2)
  const followUps = (notes || []).filter((n) => n.follow_up_date).slice(0, 2)
  const daysUntil = (d) => Math.max(0, Math.round((new Date(d) - now) / 86400000))
  if (!upcoming.length && !dueVac.length && !followUps.length) return null
  return (
    <div className="ux-widget" style={{ marginBottom: 12 }}>
      <h4>⏳ Coming up</h4>
      <div className="countdown-row">
        {upcoming.map((a) => (
          <div key={a.id} className="countdown-chip">
            <div style={{ fontSize: 12, color: '#667085' }}>📅 Appointment · {a.date} {a.start_time || ''}</div>
            <b>{daysUntil(a.date) === 0 ? 'Today!' : `${daysUntil(a.date)}d left`}</b>
            <div style={{ fontSize: 12 }}>{a.doctor_name || ''}</div>
          </div>
        ))}
        {followUps.map((n) => (
          <div key={n.id} className="countdown-chip">
            <div style={{ fontSize: 12, color: '#667085' }}>🔁 Follow-up · {n.follow_up_date}</div>
            <b>{daysUntil(n.follow_up_date) === 0 ? 'Today!' : `${daysUntil(n.follow_up_date)}d left`}</b>
            <div style={{ fontSize: 12 }}>{n.title || 'Visit note'}</div>
          </div>
        ))}
        {dueVac.map((v) => (
          <div key={v.id} className="countdown-chip">
            <div style={{ fontSize: 12, color: '#667085' }}>💉 {v.vaccine_name} · due {v.due_date}</div>
            <b>{daysUntil(v.due_date) === 0 ? 'Due today!' : `${daysUntil(v.due_date)}d left`}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Gamified milestones from existing counts */
export function Milestones({ docs = [], vitalsCount = 0, apptsKept = 0 }) {
  const miles = [
    { icon: '📄', label: 'First record', done: docs.length >= 1, pct: Math.min(100, docs.length * 100) },
    { icon: '🗂️', label: 'Organizer ×5', done: docs.length >= 5, pct: Math.min(100, (docs.length / 5) * 100) },
    { icon: '❤️', label: 'Vitals logger', done: vitalsCount >= 3, pct: Math.min(100, (vitalsCount / 3) * 100) },
    { icon: '📅', label: 'Kept visits', done: apptsKept >= 1, pct: Math.min(100, apptsKept * 100) },
  ]
  const done = miles.filter((m) => m.done).length
  return (
    <div className="ux-widget" style={{ marginBottom: 12 }}>
      <h4>🏆 Health milestones · {done}/{miles.length}</h4>
      <div className="mile-grid">
        {miles.map((m) => (
          <div key={m.label} className={`mile${m.done ? ' done' : ''}`}>
            <span>{m.icon} {m.done ? '✓ ' : ''}{m.label}</span>
            <div className="bar"><i style={{ width: `${m.pct}%` }} /></div>
          </div>
        ))}
      </div>
      {done < miles.length && (
        <p style={{ fontSize: 12.5, color: '#667085', margin: '8px 0 0' }}>
          💡 Reminder: upload reports, log vitals weekly, and keep appointments to finish all badges.
        </p>
      )}
    </div>
  )
}

/* Drag-and-drop file zone (click also works) */
export function Dropzone({ accept, onFile, children }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const f = e.dataTransfer?.files?.[0]
        if (f) onFile?.(f)
      }}
      onClick={() => document.getElementById('ux-drop-input')?.click()}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('ux-drop-input')?.click() }}
    >
      <input id="ux-drop-input" type="file" accept={accept} hidden
        onChange={(e) => { const f = e.target.files[0]; if (f) onFile?.(f); e.target.value = '' }} />
      {children || <span>📥 Drag & drop a report here, or click to browse</span>}
    </div>
  )
}

/* ---------- UX primitives: toasts, skeletons, empty states, file tabs, drawer ---------- */

let _toastPush = null
export function toast(msg, kind = '') {
  try { _toastPush?.({ msg, kind, id: Date.now() + Math.random() }) } catch { /* noop */ }
}

export function ToastHost() {
  const [items, setItems] = useState([])
  useEffect(() => {
    _toastPush = (t) => {
      setItems((xs) => [...xs.slice(-3), t])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4200)
    }
    return () => { _toastPush = null }
  }, [])
  if (!items.length) return null
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  )
}

export function Skeleton({ rows = 3, height = 58 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" style={{ height }} />)}
    </div>
  )
}

export function EmptyState({ icon = '📭', title = 'Nothing here yet', hint = '', action = null }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 30 }}>{icon}</div>
      <b>{title}</b>
      {hint && <p style={{ margin: '6px 0 0' }}>{hint}</p>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}

/* Top-level Type tabs for the file manager: kind-aware counts. */
export function FileTabs({ docs = [], value = '', onChange }) {
  const counts = useMemo(() => {
    const c = { '': docs.length, lab: 0, scan: 0, report: 0, prescription: 0, other: 0 }
    docs.forEach((d) => { if (c[d.doc_type] != null) c[d.doc_type] += 1 })
    return c
  }, [docs])
  const tabs = [
    { key: '', label: 'All' },
    { key: 'lab', label: '🧪 Labs' },
    { key: 'scan', label: '🩻 Scans' },
    { key: 'report', label: '📄 Reports' },
    { key: 'prescription', label: '🧾 Prescriptions' },
    { key: 'other', label: '📁 Other' },
  ]
  return (
    <div className="file-tabs" role="tablist" aria-label="Filter by file type">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key}
          className={`file-tab${value === t.key ? ' on' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}<span className="cnt">{counts[t.key] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}

/* Slide-over preview: real file (image/video/pdf) + metadata + actions. */
export function PreviewDrawer({ doc, onClose, onSummarize, onDelete }) {
  const [url, setUrl] = useState(null)
  const [ocr, setOcr] = useState(null)
  useEffect(() => {
    if (!doc) return
    let live = true
    let obj = null
    setUrl(null); setOcr(null)
    api.get(`/api/documents/${doc.id}/download`, { responseType: 'blob' })
      .then((res) => {
        if (!live) return
        obj = URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] || doc.file_mimetype }))
        setUrl(obj)
      }).catch(() => { if (live) setUrl('error') })
    api.get(`/api/documents/${doc.id}/ocr-text`).then(({ data }) => { if (live) setOcr(data) }).catch(() => {})
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => { live = false; window.removeEventListener('keydown', onKey); if (obj) URL.revokeObjectURL(obj) }
  }, [doc])
  if (!doc) return null
  const mt = doc.file_mimetype || ''
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Preview ${doc.title}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div><h3 style={{ margin: 0 }}>{doc.title}</h3>
            <p className="record-meta">{[doc.visit_date, doc.doctor_name, doc.hospital].filter(Boolean).join(' · ') || 'Undated'}</p></div>
          <button onClick={onClose} aria-label="Close preview">✕</button>
        </div>
        <div className="badge-row" style={{ margin: '8px 0' }}>{statusBadges(doc).map((b) => <span key={b.label} className={`badge ${b.cls}`}>{b.label}</span>)}</div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!url ? <div style={{ padding: 16 }}><Skeleton rows={1} height={160} /></div>
            : url === 'error' ? <p style={{ padding: 16 }}>⚠️ Could not load preview — use View/PDF instead.</p>
              : mt.startsWith('image/') ? <img src={url} alt={doc.title} style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }} />
                : mt.startsWith('video/') ? <video src={url} controls style={{ maxWidth: '100%', maxHeight: 420 }} />
                  : <iframe src={url} title={doc.title} style={{ width: '100%', height: 420, border: 0 }} />}
        </div>
        <h4 style={{ margin: '12px 0 6px', fontSize: 13.5 }}>Extracted text {ocr?.chars ? `(${ocr.chars} chars)` : ''}</h4>
        <div className="ocr-box">{ocr ? (ocr.preview || 'No readable text yet.') : 'Loading…'}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {onSummarize && <button onClick={() => onSummarize(doc.id)}>✦ AI Summary</button>}
          {onDelete && <button onClick={() => onDelete(doc.id)}>🗑 Delete</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
