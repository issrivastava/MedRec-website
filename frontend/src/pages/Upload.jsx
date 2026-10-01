import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { kindsForCategory, docTypeForKind, categoryForKind, kindLabel } from '../reportKinds'
import { useProfile } from '../context/ProfileContext'
import CameraCapture from '../components/CameraCapture'
import { Dropzone, ToastHost, toast } from '../components/HealthUX'

const ACCEPT = '.pdf,.doc,.docx,.csv,.txt,image/*'

export default function Upload() {
  const { activeId } = useProfile()
  const [meta, setMeta] = useState({
    title: '', doc_type: 'report', category: '', report_kind: '',
    doctor_name: '', hospital: '', visit_date: '', notes: '',
    family_member_id: '',
  })
  const [family, setFamily] = useState([])
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState(1) // 1 pick → 2 review → 3 done
  const [camMode, setCamMode] = useState(null) // null | 'photo' | 'video'
  const fileRef = useRef(null)

  useEffect(() => {
    api.get('/api/family').then(({ data }) => setFamily(data)).catch(() => {})
  }, [])

  // Default attribution to the active family profile
  useEffect(() => {
    setMeta((m) => ({ ...m, family_member_id: activeId || '' }))
  }, [activeId])

  const onKindChange = (kind) => {
    // Kind is authoritative — derive Category + Type so a Prescription kind
    // can never stay saved as Type=Report.
    if (!kind) { setMeta((m) => ({ ...m, report_kind: '' })); return }
    setMeta((m) => ({
      ...m,
      report_kind: kind,
      category: categoryForKind(kind) || m.category,
      doc_type: docTypeForKind(kind) || m.doc_type,
    }))
  }

  const onCategoryChange = (cat) => {
    setMeta((m) => ({ ...m, category: cat, report_kind: '' }))
  }

  const onTypeChange = (t) => {
    // Manual Type pick clears a contradicting kind (kind will be re-derived
    // on save if left empty), so stale kinds can't stick.
    setMeta((m) => ({ ...m, doc_type: t }))
  }

  const pickFile = (e) => {
    const f = e.target.files[0] || null
    setFile(f)
    e.target.value = ''
    setMsg('')
    if (!f) return
    setStep(2)
    classifyFile(f)
  }

  const dropFile = (f) => {
    if (!f) return
    setFile(f)
    setMsg('')
    setStep(2)
    classifyFile(f)
  }

  const classifyFile = (f) => {
    // smart upload: auto-suggest title/category/kind from filename
    const fd = new FormData()
    fd.append('title', '')
    fd.append('filename', f.name || '')
    api.post('/api/documents/auto-classify', fd).then(({ data }) => {
      setMeta((m) => ({
        ...m,
        title: m.title || data.suggested_title || '',
        category: m.category || data.suggested_category || '',
        report_kind: m.report_kind || data.suggested_kind || '',
        doc_type: m.doc_type === 'report' && data.suggested_doc_type ? data.suggested_doc_type : m.doc_type,
      }))
      if (data.possible_duplicates?.length) setMsg(`⚠️ Possible duplicate: ${data.possible_duplicates[0].title}`)
      else setMsg(`✨ Smart detect: ${data.suggested_kind || data.suggested_doc_type || 'report'} (${data.confidence} confidence)`)
    }).catch(() => {})
  }

  // In-page camera capture (photo snap or video clip) — works on any device.
  const onCameraFile = (f) => {
    setFile(f)
    setCamMode(null)
    setStep(2)
    classifyFile(f)
  }

  const doUpload = async (e) => {
    e.preventDefault()
    if (!file) { setStep(1); return setMsg('Choose a file — PDF, Word (.doc/.docx), CSV or text.') }
    if (file.size === 0) return setMsg('⚠️ That file is empty (0 bytes) — please pick the real file again.')
    if (!meta.title) { setStep(2); return setMsg('Title is required') }
    setBusy(true); setProgress(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v) })
      await api.post('/api/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => {
          if (ev.total) setProgress(Math.round((ev.loaded / ev.total) * 100))
          else setProgress((p) => Math.min(95, p + 10))
        },
      })
      setProgress(100)
      setMsg('✅ Uploaded — lab values auto-checked for alerts.')
      toast('✅ Uploaded — lab values auto-checked', 'ok')
      setStep(3)
      setFile(null)
      setMeta({ title: '', doc_type: 'report', category: '', report_kind: '', doctor_name: '', hospital: '', visit_date: '', notes: '', family_member_id: activeId || '' })
    } catch (err) {
      const m = `Upload failed: ${err.response?.data?.detail || err.message}`
      setMsg(m)
      toast(`❌ ${m}`, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={s.wrap} className="rise">
      <h2 style={{ margin: '0 0 4px' }}>📤 Upload</h2>
      <p style={{ color: '#5d6b7a', margin: '0 0 16px', maxWidth: 720 }}>
        Upload a <b>PDF</b>, <b>Word document (.doc/.docx)</b>, <b>CSV</b> or <b>text (.txt)</b> file —
        lab report, prescription, scan or discharge summary. Text is extracted automatically
        for search and AI summaries.
      </p>
      <div className="wizard-steps" aria-label="Upload steps">
        <div className={`wstep${step === 1 ? ' on' : step > 1 ? ' done' : ''}`}>1 · Pick file</div>
        <div className={`wstep${step === 2 ? ' on' : step > 2 ? ' done' : ''}`}>2 · Review type</div>
        <div className={`wstep${step === 3 ? ' on' : ''}`}>3 · Done</div>
      </div>
      <section style={s.card}>
        {step === 1 && (
          <div style={s.form}>
            <div style={{ marginBottom: 4 }}>
              <Dropzone accept={ACCEPT} onFile={dropFile} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => fileRef.current?.click()}>📁 Choose PDF / DOC / CSV / TXT</button>
              <button type="button" onClick={() => setCamMode('photo')}>📷 Take photo</button>
              <button type="button" onClick={() => setCamMode('video')}>🎥 Record video</button>
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} hidden />
            <p style={{ fontSize: 12, color: '#5d6b7a', margin: 0 }}>
              Accepted: .pdf, .doc, .docx, .csv, .txt (and photos) up to 15 MB, videos up to 100 MB.
            </p>
          </div>
        )}
        {step >= 2 && (
        <form onSubmit={doUpload} style={s.form}>
          {step === 2 && (
            <button type="button" onClick={() => { setStep(1); setFile(null) }} style={s.linkBtn}>← Pick a different file</button>
          )}
          <input
            placeholder="Title* e.g. CBC Report Jan, Discharge Summary"
            value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            style={s.input}
          />
          <div className="form-grid">
            <select value={meta.doc_type} onChange={(e) => onTypeChange(e.target.value)} style={s.input} title="Document type — auto-set from Kind when Kind is picked">
              <option value="report">Report (ECG, Echo, clinical…)</option>
              <option value="prescription">Prescription</option>
              <option value="lab">Lab</option>
              <option value="scan">Scan / Imaging</option>
              <option value="other">Other</option>
            </select>
            <select value={meta.family_member_id} onChange={(e) => setMeta({ ...meta, family_member_id: e.target.value })} style={s.input}>
              <option value="">Belongs to: Me</option>
              {family.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <select value={meta.category} onChange={(e) => onCategoryChange(e.target.value)} style={s.input} title="Report category">
              <option value="">Category: auto-detect</option>
              <option value="lab">Pathology Lab (CBC, TSH, LFT…)</option>
              <option value="imaging">Radiology / Imaging (X-Ray, MRI…)</option>
              <option value="cardiology">Cardiac (ECG, Echo…)</option>
              <option value="prescription">Prescription & Clinical</option>
              <option value="other">Other</option>
            </select>
            <select value={meta.report_kind} onChange={(e) => onKindChange(e.target.value)} style={s.input} title="Report kind — picking a Kind auto-sets Category + Type">
              <option value="">Kind: auto-detect from title</option>
              {kindsForCategory(meta.category).map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
            </select>
          </div>
          {meta.report_kind && (
            <p style={{ fontSize: 12, color: '#0a6e63', margin: 0 }}>
              Will save as: <b>{kindLabel(meta.report_kind)}</b> · {meta.category} · {meta.doc_type}
            </p>
          )}
          <div className="form-grid">
            <input placeholder="Doctor name" value={meta.doctor_name} onChange={(e) => setMeta({ ...meta, doctor_name: e.target.value })} style={s.input} />
            <input placeholder="Hospital" value={meta.hospital} onChange={(e) => setMeta({ ...meta, hospital: e.target.value })} style={s.input} />
          </div>
          <div className="form-grid">
            <input type="date" value={meta.visit_date} onChange={(e) => setMeta({ ...meta, visit_date: e.target.value })} style={s.input} />
            <input placeholder="Notes" value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} style={s.input} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => fileRef.current?.click()}>📁 Choose PDF / DOC / CSV / TXT</button>
            <button type="button" onClick={() => setCamMode('photo')}>📷 Take photo</button>
            <button type="button" onClick={() => setCamMode('video')}>🎥 Record video</button>
          </div>
          <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} hidden />
          {camMode && (
            <CameraCapture
              initialMode={camMode}
              onCapture={onCameraFile}
              onClose={() => setCamMode(null)}
            />
          )}
          {file && (
            <div style={s.picked}>
              📎 {file.name} ({(file.size / 1048576).toFixed(1)} MB)
              {' '}<button type="button" onClick={() => { setFile(null); setStep(1) }} style={s.linkBtn}>remove</button>
            </div>
          )}
          {busy && (
            <div role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"
              style={{ height: 8, borderRadius: 999, background: 'var(--line-soft)', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--brand)', transition: 'width .2s' }} />
            </div>
          )}
          <button style={s.primaryBtn} disabled={busy}>{busy ? `Uploading… ${progress}%` : step === 3 ? 'Upload another' : 'Confirm & Upload'}</button>
        </form>
        )}
        {camMode && (
          <CameraCapture
            initialMode={camMode}
            onCapture={onCameraFile}
            onClose={() => setCamMode(null)}
          />
        )}
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} hidden style={{ display: 'none' }} />
        {msg && <p style={{ color: msg.startsWith('✅') || msg.startsWith('✨') ? 'green' : '#b45309', marginBottom: 0 }}>{msg}</p>}
        <p style={{ fontSize: 13, marginBottom: 0 }}>
          <Link to="/patient" style={{ fontWeight: 700 }}>View My Records →</Link>
          {step === 3 && <button type="button" onClick={() => setStep(1)} style={{ ...s.linkBtn, marginLeft: 12 }}>＋ Upload another file</button>}
        </p>
      </section>
      <ToastHost />
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #0a6e63', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
  form: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  input: { padding: '10px 12px', fontSize: 14, minWidth: 0, maxWidth: '100%', borderRadius: 12 },
  primaryBtn: { padding: '9px 18px', background: '#101828', color: '#fff', border: '1px solid #101828', cursor: 'pointer', fontWeight: 650, alignSelf: 'flex-start', borderRadius: 12 },
  linkBtn: { background: 'none', border: 0, color: '#0a6e63', cursor: 'pointer', padding: 0, fontWeight: 700, boxShadow: 'none' },
  picked: { fontSize: 13, color: '#344054', background: '#fbfcfd', border: '1px dashed #d6dce4', borderRadius: 12, padding: 8 },
}
