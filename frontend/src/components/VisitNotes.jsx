import { useEffect, useState } from 'react'
import api from '../api'
import { RxTemplates } from './CareTools'

/* Doctor e-prescriptions / visit notes.
   Patient view: list mine. Doctor view: composer + list for selected patient. */
export default function VisitNotes({ role, patientId }) {
  const [notes, setNotes] = useState([])
  const [form, setForm] = useState({ note_type: 'prescription', title: '', content: '', medicines: '', visit_date: '', follow_up_date: '' })
  const [showTpl, setShowTpl] = useState(false)
  const [safety, setSafety] = useState(null) // {warnings, checked} | {error} | {checking:true}
  const [sendMsg, setSendMsg] = useState('')

  const load = async () => {
    const url = role === 'doctor' ? `/api/visits/patient/${patientId}` : '/api/visits/my'
    const { data } = await api.get(url)
    setNotes(data)
  }
  useEffect(() => { if (role === 'patient' || patientId) load().catch(console.error) }, [patientId])

  const medNames = () =>
    form.medicines.split('\n').map((l) => l.split('|')[0].trim()).filter(Boolean)

  const checkSafety = async () => {
    setSafety({ checking: true })
    try {
      const { data } = await api.post('/api/practice/rx-safety',
        { patient_id: patientId, medicines: medNames() })
      setSafety(data)
    } catch (e) {
      setSafety({ error: e.response?.data?.detail || 'Safety check failed' })
    }
  }

  const create = async (e) => {
    e.preventDefault()
    setSendMsg('')
    const medicines = form.medicines.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, dosage, frequency, duration] = l.split('|').map((s) => (s || '').trim())
      return { name, dosage, frequency, duration }
    })
    try {
      await api.post('/api/visits', { ...form, patient_id: patientId, medicines,
        title: form.title || undefined, visit_date: form.visit_date || undefined,
        follow_up_date: form.follow_up_date || undefined })
      setForm({ note_type: 'prescription', title: '', content: '', medicines: '', visit_date: '', follow_up_date: '' })
      setSafety(null)
      setSendMsg('Sent to patient ✓')
      load()
    } catch (err) {
      setSendMsg(err.response?.data?.detail || 'Could not send')
    }
  }

  return (
    <div>
      {role === 'doctor' && patientId && (
        <form onSubmit={create} style={s.form}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setShowTpl((v) => !v)}>{showTpl ? 'Hide templates' : '📋 Rx templates'}</button>
          </div>
          {showTpl && <RxTemplates onInsert={(t) => {
            const medLines = (t.medicines || []).map((m) => `${m.name} | ${m.dosage || ''} | ${m.frequency || ''} | ${m.duration || ''}`).join('\n')
            setForm((f) => ({ ...f, content: t.content || f.content, medicines: medLines || f.medicines, title: f.title || t.name }))
            setShowTpl(false)
          }} />}
          <select value={form.note_type} onChange={(e) => setForm({ ...form, note_type: e.target.value })} style={s.input}>
            <option value="prescription">E-Prescription</option>
            <option value="note">Visit note</option>
          </select>
          <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={s.input} />
          <textarea placeholder="Advice / findings" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required rows={3} style={s.input} />
          <textarea placeholder="Medicines — one per line: Name | Dosage | Frequency | Duration" value={form.medicines} onChange={(e) => { setForm({ ...form, medicines: e.target.value }); setSafety(null) }} rows={3} style={s.input} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} style={s.input} />
            <input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} style={s.input} title="Follow-up date" />
          </div>
          {safety?.checking && <small>🛡️ Checking allergies + ongoing meds…</small>}
          {safety?.error && <small style={{ color: '#b91c1c' }}>⚠️ {safety.error}</small>}
          {safety?.warnings && (
            <div style={s.safetyBox}>
              {safety.warnings.length === 0
                ? <small style={{ color: '#166534' }}>🛡️ Clear — no allergy or duplicate-medicine flags for {safety.checked} medicine(s).</small>
                : safety.warnings.map((w, i) => (
                  <div key={i} style={{ ...s.warn, borderLeftColor: w.level === 'major' ? '#dc2626' : '#d97706' }}>
                    <b>{w.level === 'major' ? '🔴' : '🟠'} {w.medicine}</b> — {w.reason}
                  </div>
                ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={checkSafety} disabled={!medNames().length}>
              🛡️ Safety check{medNames().length ? ` (${medNames().length})` : ''}
            </button>
            <button style={s.btn}>Send to patient</button>
          </div>
          {sendMsg && <small style={{ color: sendMsg.includes('✓') ? 'green' : '#b91c1c' }}>{sendMsg}</small>}
        </form>
      )}
      {notes.map((n) => (
        <div key={n.id} style={s.note}>
          <b>[{n.note_type}] {n.title || '(no title)'}</b> <small>— Dr. {n.doctor_name} · {n.visit_date || n.created_at.slice(0, 10)}</small>
          <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{n.content}</p>
          {(n.medicines || []).map((m, i) => (
            <div key={i} style={s.med}>💊 <b>{m.name}</b>{m.dosage ? ` — ${m.dosage}` : ''}{m.frequency ? ` · ${m.frequency}` : ''}{m.duration ? ` × ${m.duration}` : ''}</div>
          ))}
          {n.follow_up_date && <div>Follow-up: {n.follow_up_date}</div>}
          <div style={{ marginTop: 6 }}>
            <button onClick={async () => {
              const res = await api.get(`/api/visits/${n.id}/rx-pdf`, { responseType: 'blob' })
              const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
              const a = document.createElement('a'); a.href = url; a.download = `rx-${n.id.slice(0, 8)}.pdf`
              document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000)
            }}>⬇ Rx PDF (signed)</button>
          </div>
        </div>
      ))}
      {!notes.length && <p>No notes yet.</p>}
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  input: { padding: 8, fontSize: 14, fontFamily: 'inherit' },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', alignSelf: 'flex-start' },
  note: { border: '1px solid #f1f5f4', borderLeft: '4px solid #16a34a', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: '#fff' },
  med: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', margin: '4px 0', fontSize: 14 },
  safetyBox: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 8 },
  warn: { borderLeft: '4px solid #d97706', padding: '4px 8px', margin: '4px 0', fontSize: 13, background: '#fff' },
}
