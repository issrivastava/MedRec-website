import { useEffect, useState } from 'react'
import api from '../api'

/* Voice helpers: read any text aloud + mic dictation (Web Speech API, no backend). */
export function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance((text || '').slice(0, 2000))
    u.rate = 1; u.lang = 'en-IN'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* unsupported */ }
}
export function stopSpeak() { try { window.speechSynthesis.cancel() } catch { } }

export function VoiceReader({ text, label }) {
  if (!('speechSynthesis' in window)) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 8 }}>
      <button type="button" title="Listen" onClick={() => speak(text)} style={s.mini}>🔊 {label || 'Listen'}</button>
      <button type="button" title="Stop" onClick={stopSpeak} style={s.mini}>⏹</button>
    </span>
  )
}

export function MicButton({ onText }) {
  const [on, setOn] = useState(false)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const toggle = () => {
    if (on) { setOn(false); return }
    const rec = new SR()
    rec.lang = 'en-IN'
    rec.onresult = (e) => { onText(e.results[0][0].transcript); setOn(false) }
    rec.onend = () => setOn(false)
    rec.start(); setOn(true)
  }
  return <button type="button" onClick={toggle} style={s.mini} title="Dictate">{on ? '● Recording…' : '🎤 Dictate'}</button>
}

const s = { mini: { padding: '2px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 6 } }

/* Rx templates + referrals, grouped for doctor/patient dashboards. */
export function RxTemplates({ onInsert }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ name: '', content: '', medicines: '' })
  const load = async () => { const { data } = await api.get('/api/care/rx-templates').catch(() => ({ data: [] })); setRows(data) }
  useEffect(() => { load().catch(console.error) }, [])
  const create = async (e) => {
    e.preventDefault()
    const meds = form.medicines.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, dosage, frequency, duration] = l.split('|').map((x) => (x || '').trim())
      return { name, dosage, frequency, duration }
    })
    await api.post('/api/care/rx-templates', { name: form.name, content: form.content || undefined, medicines: meds.length ? meds : undefined })
    setForm({ name: '', content: '', medicines: '' }); load()
  }
  return (
    <div>
      <form onSubmit={create} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <input placeholder="Template name (e.g. Viral fever)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ padding: 8 }} />
        <input placeholder="Advice text" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ padding: 8, minWidth: 200 }} />
        <input placeholder="Meds: Name | Dose | Freq | Days" value={form.medicines} onChange={(e) => setForm({ ...form, medicines: e.target.value })} style={{ padding: 8, minWidth: 200 }} />
        <button>Save template</button>
      </form>
      {rows.map((t) => (
        <div key={t.id} style={s2.row}>
          <span><b>{t.name}</b> — {(t.content || '').slice(0, 80)} {(t.medicines || []).map((m) => m.name).join(', ')}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            {onInsert && <button onClick={() => onInsert(t)}>Insert</button>}
            <button onClick={async () => { await api.delete(`/api/care/rx-templates/${t.id}`); load() }}>Delete</button>
          </span>
        </div>
      ))}
      {!rows.length && <small>No templates yet — save frequent prescriptions here.</small>}
    </div>
  )
}

export function ReferralBox({ role, patientId }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ patient_id: '', to_doctor_email: '', reason: '' })
  const load = async () => { const { data } = await api.get('/api/care/referrals').catch(() => ({ data: [] })); setRows(data) }
  useEffect(() => { load().catch(console.error) }, [])
  useEffect(() => { if (patientId) setForm((f) => ({ ...f, patient_id: patientId })) }, [patientId])
  const create = async (e) => {
    e.preventDefault()
    await api.post('/api/care/referrals', form)
    setForm({ patient_id: patientId || '', to_doctor_email: '', reason: '' }); load()
  }
  return (
    <div>
      {role === 'doctor' && (
        <form onSubmit={create} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <input placeholder="Patient ID" value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} required style={{ padding: 8 }} />
          <input placeholder="To doctor email" value={form.to_doctor_email} onChange={(e) => setForm({ ...form, to_doctor_email: e.target.value })} style={{ padding: 8 }} />
          <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required style={{ padding: 8, minWidth: 200 }} />
          <button>Refer</button>
        </form>
      )}
      {rows.map((r) => (
        <div key={r.id} style={s2.row}>
          <span><b>{r.patient_name}</b> → {r.to_doctor_email || r.to_doctor_id} · {r.reason} <small>({r.status})</small></span>
          <select value={r.status} onChange={async (e) => { await api.patch(`/api/care/referrals/${r.id}?status=${e.target.value}`); load() }}>
            <option value="pending">pending</option><option value="accepted">accepted</option>
            <option value="declined">declined</option><option value="completed">completed</option>
          </select>
        </div>
      ))}
      {!rows.length && <small>No referrals yet.</small>}
    </div>
  )
}

const s2 = {
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, border: '1px solid #eee', borderRadius: 8, padding: '6px 10px', marginBottom: 6, background: '#fff', fontSize: 14, flexWrap: 'wrap' },
  card: { border: '1px solid #e9d5ff', background: '#faf5ff', borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 14 },
}
