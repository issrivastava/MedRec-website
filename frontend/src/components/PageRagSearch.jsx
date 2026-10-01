import { useEffect, useState } from 'react'
import api, { AI_TIMEOUT, openDocumentInline } from '../api'
import { VoiceReader } from './CareTools'

/* Vectorless page-index RAG: ask a question over your own documents.
   Backend ranks indexed pages with BM25 (no embeddings) and the answer
   cites exact pages — each citation card shows the source page + snippet. */
export default function PageRagSearch() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState([])
  const [engine, setEngine] = useState('')
  const [err, setErr] = useState('')
  const [role, setRole] = useState('')
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')

  useEffect(() => {
    api.get('/api/auth/me').then(({ data }) => {
      setRole(data.role || '')
      if (data.role === 'doctor') {
        api.get('/api/doctors/patients').then(({ data: list }) => {
          setPatients(list || [])
          if ((list || []).length === 1) setPatientId(list[0].patient_id)
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const ask = async (e) => {
    e?.preventDefault()
    const question = q.trim()
    if (!question || busy) return
    setBusy(true)
    setErr('')
    setAnswer('')
    setCitations([])
    try {
      const body = { question, top_k: 5 }
      if (role === 'doctor' && patientId) body.patient_id = patientId
      if (role === 'doctor' && !patientId) {
        setErr('Pick an assigned patient to read their records.')
        setBusy(false)
        return
      }
      const { data } = await api.post('/api/assistant/ask-records', body, { timeout: AI_TIMEOUT })
      setAnswer(data.answer || '')
      setCitations(data.citations || [])
      setEngine(data.engine || '')
    } catch (e2) {
      setErr(e2.response?.data?.detail || e2.message || 'Search failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  const openDoc = async (id) => {
    try {
      await openDocumentInline(id)
    } catch (e) {
      setErr(e.message || 'Could not open document')
    }
  }

  const maxScore = Math.max(0.01, ...citations.map((c) => c.score || 0))

  return (
    <div>
      <form onSubmit={ask} style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask your reports… (e.g. What was my HbA1c?)"
          style={{ flex: 1, padding: 10, fontSize: 15 }}
          maxLength={1000}
        />
        <button type="submit" disabled={busy || !q.trim()} style={s.sendBtn}>
          {busy ? 'Reading…' : 'Search →'}
        </button>
      </form>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
        {['What was my HbA1c?', 'Summarize my latest blood test', 'What medicines were prescribed?'].map((t) => (
          <button key={t} type="button" disabled={busy} onClick={() => setQ(t)} style={s.chip}>
            {t}
          </button>
        ))}
      </div>

      {role === 'doctor' && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 4 }}>
          Read records of:
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} style={{ padding: 6, flex: 1 }}>
            <option value="">— Select assigned patient —</option>
            {patients.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>{p.patient_name} ({p.patient_email})</option>
            ))}
          </select>
        </label>
      )}

      {err && <p style={{ color: 'red' }}>{err}</p>}

      {answer && (
        <div style={s.answer}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{answer}</p>
          <VoiceReader text={answer} />
          <p style={{ fontSize: 12, color: '#5d6b7a', margin: '8px 0 0' }}>
            ℹ️ Answered from your indexed pages only — not medical advice.
            {engine && <> · {engine}</>}
          </p>
        </div>
      )}

      {!!citations.length && (
        <div style={{ marginTop: 10 }}>
          <b style={{ fontSize: 14 }}>📄 Sources — {citations.length} page{citations.length > 1 ? 's' : ''}</b>
          {citations.map((c, i) => (
            <div key={`${c.document_id}-${c.page}-${i}`} style={s.cite}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>#{i + 1} · {c.title} — page {c.page}</b>
                <button type="button" onClick={() => openDoc(c.document_id)} style={s.openBtn}>Open document</button>
              </div>
              <div style={{ fontSize: 12, color: '#5d6b7a', margin: '2px 0' }}>
                {c.visit_date ? `${c.visit_date} · ` : ''}{c.report_kind || 'document'}
              </div>
              <p style={{ margin: '4px 0', fontSize: 14 }}>{c.snippet}</p>
              <div style={s.bar} title={`relevance ${c.score}`}>
                <div style={{ ...s.fill, width: `${Math.round(((c.score || 0) / maxScore) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  sendBtn: { padding: '10px 18px', background: '#0d9488', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' },
  chip: { padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13 },
  answer: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: 12, marginTop: 10, fontSize: 14 },
  cite: { border: '1px solid #dfe3e8', background: '#fff', borderRadius: 8, padding: 10, marginTop: 8 },
  openBtn: { padding: '4px 10px', fontSize: 13, cursor: 'pointer' },
  bar: { height: 5, background: '#eef2f7', borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', background: '#0d9488' },
}
