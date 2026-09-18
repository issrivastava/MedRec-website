import { useEffect, useRef, useState } from 'react'
import api, { AI_TIMEOUT } from '../api'
import { VoiceReader, MicButton, speak } from './CareTools'

/* Gemini-powered doubt-solver chat (local Ollama fallback — see backend).
   Keeps the last exchanges as context for follow-up questions. */
export default function AIAssistant() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: '👋 Hi! I\'m MedRec\'s AI assistant. Ask me any health or app-related doubt — I\'ll explain in simple words.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [engine, setEngine] = useState('')
  const [useRecords, setUseRecords] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    api.get('/api/assistant/status').then(({ data }) => setEngine(data.engine || '')).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const send = async (e) => {
    e?.preventDefault()
    const q = input.trim()
    if (!q || busy) return
    if (q.length < 2) return
    const history = [...messages, { role: 'user', text: q }]
      .filter((m) => m.text && !m.error)
      .slice(-7, -1)
      .map((m) => ({ role: m.role, text: m.text }))
    setMessages((m) => [...m, { role: 'user', text: q }])
    setInput('')
    setBusy(true)
    try {
      const { data } = await api.post('/api/assistant/ask', { question: q, history, use_records: useRecords }, { timeout: AI_TIMEOUT })
      setEngine(data.engine || '')
      setMessages((m) => [...m, { role: 'assistant', text: data.answer + (data.used_records ? '\n\n📎 Grounded in your MedRec records.' : '') }])
    } catch (err) {
      const detail = err.response?.data?.detail || 'Could not reach the AI. Please try again.'
      setMessages((m) => [...m, { role: 'assistant', text: `⚠️ ${detail}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  const suggestions = [
    'What is HbA1c?',
    'How do I book an appointment?',
    'What does high BP mean?',
    'How to upload a report?',
  ]

  return (
    <div>
      <div style={s.chat}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === 'user' ? s.userRow : s.aiRow}>
            <div style={m.role === 'user' ? s.userBubble : { ...s.aiBubble, ...(m.error ? s.errBubble : {}) }}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.text}</p>
              {m.role === 'assistant' && !m.error && <VoiceReader text={m.text} />}
            </div>
          </div>
        ))}
        {busy && (
          <div style={s.aiRow}>
            <div style={s.aiBubble}><span style={s.typing}>● ● ●</span></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
        {suggestions.map((t) => (
          <button key={t} type="button" disabled={busy} onClick={() => { setInput(t) }} style={s.chip}>
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your doubt… (e.g. What is diabetes?)"
          style={{ flex: 1, padding: 10, fontSize: 15 }}
          maxLength={2000}
        />
        <MicButton onText={(t) => setInput((v) => (v ? v + ' ' : '') + t)} />
        <button type="submit" disabled={busy || !input.trim()} style={s.sendBtn}>
          {busy ? '…' : 'Send →'}
        </button>
      </form>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 8 }}>
        <input type="checkbox" checked={useRecords} onChange={(e) => setUseRecords(e.target.checked)} />
        Ground in my MedRec records (reports, vitals, prescriptions) — RAG
      </label>

      <p style={{ fontSize: 12, color: '#5d6b7a', marginTop: 8 }}>
        ℹ️ AI answers are informational only — not medical advice. Always consult your doctor.
        {engine && <> · Answered by {engine}</>}
      </p>
    </div>
  )
}

const s = {
  chat: { border: '1px solid #dfe3e8', borderRadius: 8, background: '#f8f9fa', padding: 12, height: 'min(52vh, 420px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  userRow: { display: 'flex', justifyContent: 'flex-end' },
  aiRow: { display: 'flex', justifyContent: 'flex-start' },
  userBubble: { background: '#1e3a5f', color: '#fff', borderRadius: '12px 12px 2px 12px', padding: '8px 12px', maxWidth: '85%', fontSize: 14 },
  aiBubble: { background: '#fff', border: '1px solid #dfe3e8', borderRadius: '12px 12px 12px 2px', padding: '8px 12px', maxWidth: '85%', fontSize: 14, color: '#1a2e45' },
  errBubble: { borderColor: '#d8b4b8', background: '#f6e8ea' },
  typing: { letterSpacing: 3, color: '#8a6d3b' },
  chip: { padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13 },
  sendBtn: { padding: '10px 18px', background: '#1e3a5f', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' },
}
