import { useEffect, useRef, useState } from 'react'
import api, { AI_TIMEOUT } from '../api'

/* Model picker: use a different local brain for summaries + understanding. */
export function ModelPicker({ onChange }) {
  const [info, setInfo] = useState(null)
  const load = async () => {
    const [{ data: m }, { data: s }] = await Promise.all([
      api.get('/api/documents/ai-models').catch(() => ({ data: null })),
      api.get('/api/documents/ai-status').catch(() => ({ data: null })),
    ])
    setInfo({ ...(m || {}), status: s })
  }
  useEffect(() => { load().catch(console.error) }, [])
  if (!info) return null
  return (
    <div style={{ fontSize: 13, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, marginBottom: 8 }}>
      <b>🧠 AI model:</b>{' '}
      <select value={info.active || ''} onChange={async (e) => {
        await api.post('/api/documents/ai-model', { model: e.target.value })
        onChange?.(e.target.value); load()
      }} style={{ padding: 4 }}>
        {(info.models || []).map((m) => <option key={m} value={m}>{m}{m === info.active ? ' (active)' : ''}</option>)}
      </select>{' '}
      {info.vision_model
        ? <span style={{ color: '#166534' }}>👁 vision: {info.vision_model} (reads scan photos)</span>
        : <span style={{ color: '#92400e' }}>👁 no vision model — <code>ollama pull moondream</code> to read scan photos directly</span>}
      {!!(info.suggested || []).length && (
        <div style={{ color: '#64748b', marginTop: 4 }}>
          Sharper understanding: <code>ollama pull qwen2.5:7b</code> (~4.7GB), then pick it above.
        </div>
      )}
      {info.status && !info.status.tesseract_ok && (
        <div style={{ color: '#92400e', marginTop: 4 }}>⚠️ Tesseract missing — photo text extraction off. <code>winget install UB-Mannheim.TesseractOCR</code>, restart backend.</div>
      )}
    </div>
  )
}

/* Per-document AI actions: understand (classify+extract, optional apply) + OCR preview. */
export function DocAIActions({ doc, onApplied, canApply = true }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [preview, setPreview] = useState(null)
  const [msg, setMsg] = useState('')

  const understand = async (apply) => {
    setBusy(true); setMsg('')
    try {
      const { data } = await api.post(`/api/documents/${doc.id}/understand`, null, { params: { apply }, timeout: AI_TIMEOUT })
      setResult(data)
      if (apply && data.applied?.length) { setMsg(`✅ Applied: ${data.applied.join(', ')}`); onApplied?.() }
      else if (apply) setMsg('Nothing new to apply.')
    } catch (err) {
      const raw = err.response?.data?.detail || err.message || 'AI understanding failed'
      const low = String(raw).toLowerCase()
      setMsg(low.includes('no json') || low.includes('model reply')
        ? '⚠️ AI gave an unclear reply — nothing changed. Try again or pick the type manually.'
        : `⚠️ ${raw}`)
    } finally { setBusy(false) }
  }

  const showText = async () => {
    if (preview) { setPreview(null); return }
    const { data } = await api.get(`/api/documents/${doc.id}/ocr-text`).catch(() => ({ data: null }))
    setPreview(data)
  }

  const u = result?.understanding
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      <button disabled={busy} onClick={() => understand(false)} title="AI reads type + content (no changes)">🧠 {busy ? '…' : 'Understand'}</button>
      {canApply && <button disabled={busy} onClick={() => understand(true)} title="AI fills kind/category/doctor/hospital/date">✨ Auto-fix type</button>}
      <button onClick={showText} title="Show the text the AI can see">👁 Text</button>
      {msg && <small style={{ color: '#475569' }}>{msg}</small>}
      {u && (
        <span style={{ fontSize: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 8px' }}>
          {u.one_line} <i>({u.report_kind || u.doc_type}, {u.confidence}{result.vision_used ? ', 👁 vision' : ''} · {result.model_used})</i>
          {!!u.key_values?.length && <span> · {u.key_values.slice(0, 3).map((k) => `${k.test} ${k.value}${k.unit ? ' ' + k.unit : ''}`).join(' · ')}</span>}
        </span>
      )}
      {preview && (
        <span style={{ fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', maxWidth: 420 }}>
          <b>Extracted text ({preview.chars} chars):</b> {preview.preview || <i>(none — image-only or empty file)</i>}
        </span>
      )}
    </span>
  )
}

/* Smart upload queue: drag-drop + multi-file + per-file AI detect + upload. */
export default function SmartUpload({ meta, activeId, onUploaded, notify }) {
  const [queue, setQueue] = useState([]) // {key, file, status, note, ai, aiBusy}
  const dropRef = useRef(null)

  const addFiles = (files) => {
    const list = [...(files || [])].filter((f) => f && f.size !== undefined)
    if (!list.length) return
    const empties = list.filter((f) => f.size === 0)
    if (empties.length) notify?.(`⚠️ Skipped empty file(s): ${empties.map((f) => f.name).join(', ')}`)
    setQueue((q) => [...q, ...list.filter((f) => f.size > 0).map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file,
      status: 'queued', note: '', ai: null, aiBusy: false,
    }))])
  }

  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const over = (e) => { e.preventDefault() }
    const drop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }
    el.addEventListener('dragover', over)
    el.addEventListener('drop', drop)
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('drop', drop) }
  }, [])

  const detect = async (key) => {
    setQueue((q) => q.map((it) => it.key === key ? { ...it, aiBusy: true, note: '' } : it))
    const item = queue.find((it) => it.key === key)
    try {
      const fd = new FormData()
      fd.append('file', item.file)
      fd.append('title', meta.title || item.file.name)
      const { data } = await api.post('/api/documents/understand', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: AI_TIMEOUT })
      setQueue((q) => q.map((it) => it.key === key ? {
        ...it, aiBusy: false, ai: data,
        note: `AI: ${data.understanding.one_line} (${data.understanding.confidence}${data.vision_used ? ', 👁 vision' : ''})`,
      } : it))
    } catch (err) {
      const raw = err.response?.data?.detail || err.message || 'AI detect failed'
      const low = String(raw).toLowerCase()
      const friendly = low.includes('no json') || low.includes('model reply') || low.includes('parse')
        ? 'AI gave an unclear reply — skipped. You can still Upload; pick the type manually.'
        : low.includes('not reachable') || low.includes('all models failed') || low.includes('ollama')
          ? 'Ollama is not running — skipped. You can still Upload (start Ollama for AI help).'
          : `AI detect skipped: ${raw} — you can still Upload.`
      setQueue((q) => q.map((it) => it.key === key ? {
        ...it, aiBusy: false, note: friendly,
      } : it))
    }
  }

  const uploadOne = async (key) => {
    const item = queue.find((it) => it.key === key)
    if (!item) return
    setQueue((q) => q.map((it) => it.key === key ? { ...it, status: 'uploading', note: '' } : it))
    try {
      const ai = item.ai?.understanding
      const fd = new FormData()
      fd.append('file', item.file)
      const fields = {
        title: meta.title || ai?.one_line?.slice(0, 80) || item.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        doc_type: meta.doc_type !== 'report' ? meta.doc_type : (ai?.doc_type || 'report'),
        category: meta.category || ai?.category || '',
        report_kind: meta.report_kind || ai?.report_kind || '',
        doctor_name: meta.doctor_name || ai?.doctor_name || '',
        hospital: meta.hospital || ai?.hospital || '',
        visit_date: meta.visit_date || ai?.visit_date || '',
        notes: meta.notes || '',
        family_member_id: meta.family_member_id || activeId || '',
      }
      Object.entries(fields).forEach(([k, v]) => { if (v) fd.append(k, v) })
      await api.post('/api/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setQueue((q) => q.map((it) => it.key === key ? { ...it, status: 'done', note: '✅ Uploaded' } : it))
      onUploaded?.()
    } catch (err) {
      setQueue((q) => q.map((it) => it.key === key ? {
        ...it, status: 'error', note: `❌ ${err.response?.data?.detail || err.message}`,
      } : it))
    }
  }

  const uploadAll = async () => {
    for (const it of queue.filter((i) => i.status === 'queued' || i.status === 'error')) {
      await uploadOne(it.key)
    }
  }

  return (
    <div>
      <div ref={dropRef} style={s.drop}>
        <b>📥 Drop scan photos / PDFs here</b> or{' '}
        <label style={s.browse}>Browse files<input type="file" multiple accept="image/*,video/*,.pdf,.txt" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} /></label>
        <div style={{ fontSize: 12, color: '#64748b' }}>Multiple files OK · empty files rejected · tip: run 🧠 AI detect before uploading so type + content are pre-filled</div>
      </div>
      {!!queue.length && (
        <div style={{ marginTop: 8 }}>
          {queue.map((it) => (
            <div key={it.key} style={s.row}>
              <span style={{ flex: 1 }}>📎 <b>{it.file.name}</b> <small>({(it.file.size / 1048576).toFixed(1)} MB)</small>
                <br /><small style={{ color: it.status === 'error' ? '#b91c1c' : '#475569' }}>{it.note || it.status}</small>
                {it.ai && <><br /><small>OCR: {it.ai.ocr_chars} chars · model: {it.ai.model_used}{it.ai.vision_used ? ' · 👁 vision' : ''}</small></>}
              </span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {it.status !== 'done' && <button disabled={it.aiBusy} onClick={() => detect(it.key)}>{it.aiBusy ? '🧠…' : '🧠 AI detect'}</button>}
                {it.status !== 'done' && it.status !== 'uploading' && <button onClick={() => uploadOne(it.key)}>Upload</button>}
                {it.status === 'uploading' && <i>Uploading…</i>}
                <button onClick={() => setQueue((q) => q.filter((x) => x.key !== it.key))}>✕</button>
              </span>
            </div>
          ))}
          <button onClick={uploadAll} style={s.primary}>Upload all pending</button>
        </div>
      )}
    </div>
  )
}

const s = {
  drop: { border: '2px dashed #94a3b8', borderRadius: 12, padding: 16, textAlign: 'center', background: '#f8fafc' },
  browse: { color: '#1d4ed8', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' },
  row: { display: 'flex', gap: 8, justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, marginBottom: 6, background: '#fff', fontSize: 13, flexWrap: 'wrap' },
  primary: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
}
