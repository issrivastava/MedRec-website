import { useEffect, useState } from 'react'
import api, { downloadBlobResponse, friendlyDownloadError } from '../api'
import { RxTemplates } from './CareTools'
import { calcAge } from '../utils'

const EMPTY_VITALS = { age: '', sex: '', bp_sys: '', bp_dia: '', pulse: '', spo2: '', temp_c: '', weight_kg: '' }

/* Print a downloaded Rx PDF via a hidden iframe (falls back to a new tab). */
async function printRx(noteId) {
  const res = await api.get(`/api/visits/${noteId}/rx-pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const cleanup = () => { setTimeout(() => { URL.revokeObjectURL(url) }, 5000) }
  try {
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.src = url
    frame.onload = () => {
      try {
        setTimeout(() => {
          frame.contentWindow.focus()
          frame.contentWindow.print()
          setTimeout(() => frame.remove(), 60000)
          cleanup()
        }, 400)
      } catch {
        window.open(url, '_blank')
        setTimeout(() => frame.remove(), 1000)
        cleanup()
      }
    }
    document.body.appendChild(frame)
  } catch {
    window.open(url, '_blank')
    cleanup()
  }
}

async function downloadRx(noteId) {
  const res = await api.get(`/api/visits/${noteId}/rx-pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const a = document.createElement('a'); a.href = url; a.download = `rx-${noteId.slice(0, 8)}.pdf`
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/* Doctor e-prescriptions / visit notes.
   Patient view: list mine. Doctor view: composer + list for selected patient. */
export default function VisitNotes({ role, patientId }) {
  const [notes, setNotes] = useState([])
  const [form, setForm] = useState({ note_type: 'prescription', title: '', content: '', medicines: '', visit_date: '', follow_up_date: '', diagnosis_code: '', diagnosis_name: '' })
  const [vitals, setVitals] = useState(EMPTY_VITALS)
  const [patInfo, setPatInfo] = useState(null) // {user, profile} for prefill + header
  const [showTpl, setShowTpl] = useState(false)
  const [safety, setSafety] = useState(null) // {warnings, checked} | {error} | {checking:true}
  const [sendMsg, setSendMsg] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState('')

  const load = async () => {
    const url = role === 'doctor' ? `/api/visits/patient/${patientId}` : '/api/visits/my'
    const { data } = await api.get(url)
    setNotes(data)
  }
  useEffect(() => { if (role === 'patient' || patientId) load().catch(console.error) }, [patientId])

  // Doctor composer: prefill name / age / sex from the patient's profile.
  useEffect(() => {
    if (role !== 'doctor' || !patientId) { setPatInfo(null); return }
    api.get(`/api/doctors/patients/${patientId}/info`).then(({ data }) => {
      setPatInfo(data)
      setVitals((v) => ({
        ...EMPTY_VITALS,
        age: v.age !== '' ? v.age : (calcAge(data?.profile?.dob) ?? ''),
        sex: v.sex || data?.profile?.gender || '',
      }))
    }).catch(() => setPatInfo(null))
  }, [role, patientId])

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
    const num = (x) => (x === '' || x == null ? undefined : Number(x))
    const vitalsOut = {
      ...(vitals.age !== '' ? { age: parseInt(vitals.age, 10) } : {}),
      ...(vitals.sex ? { sex: vitals.sex } : {}),
      ...(vitals.bp_sys !== '' ? { bp_sys: parseInt(vitals.bp_sys, 10) } : {}),
      ...(vitals.bp_dia !== '' ? { bp_dia: parseInt(vitals.bp_dia, 10) } : {}),
      ...(vitals.pulse !== '' ? { pulse: parseInt(vitals.pulse, 10) } : {}),
      ...(vitals.spo2 !== '' ? { spo2: parseInt(vitals.spo2, 10) } : {}),
      ...(vitals.temp_c !== '' ? { temp_c: num(vitals.temp_c) } : {}),
      ...(vitals.weight_kg !== '' ? { weight_kg: num(vitals.weight_kg) } : {}),
    }
    try {
      await api.post('/api/visits', { ...form, patient_id: patientId, medicines,
        title: form.title || undefined, visit_date: form.visit_date || undefined,
        follow_up_date: form.follow_up_date || undefined,
        diagnosis_code: form.diagnosis_code || undefined,
        diagnosis_name: form.diagnosis_name || undefined,
        vitals: Object.keys(vitalsOut).length ? vitalsOut : undefined })
      setForm({ note_type: 'prescription', title: '', content: '', medicines: '', visit_date: '', follow_up_date: '', diagnosis_code: '', diagnosis_name: '' })
      setVitals((v) => ({
        ...EMPTY_VITALS,
        age: calcAge(patInfo?.profile?.dob) ?? '',
        sex: patInfo?.profile?.gender || '',
      }))
      setSafety(null)
      setSendMsg('Sent to patient ✓')
      load()
    } catch (err) {
      setSendMsg(err.response?.data?.detail || 'Could not send')
    }
  }

  const rxCount = notes.filter((n) => n.note_type === 'prescription').length

  /* Bulk download: all e-prescriptions as one combined PDF (newest first). */
  const downloadAllRx = async () => {
    if (bulkBusy || rxCount === 0) return
    setBulkBusy(true); setBulkMsg('')
    try {
      const params = role === 'doctor' && patientId ? { patient_id: patientId } : {}
      const res = await api.get('/api/visits/bulk-pdf', { params, responseType: 'blob' })
      const name = await downloadBlobResponse(res, 'prescriptions.pdf')
      setBulkMsg(`✅ Saved ${name}`)
    } catch (e) {
      setBulkMsg(`⚠️ ${friendlyDownloadError(e)}`)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div>
      {role === 'patient' && <MedReminders />}
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
          <div style={s.patBar}>
            <span style={{ fontSize: 20 }}>🧍</span>
            <span style={{ minWidth: 0 }}>
              <b>{patInfo?.user?.full_name || 'Patient'}</b>
              {vitals.age !== '' && <span className="pill" style={{ marginLeft: 6 }}>{vitals.age} yrs</span>}
              {vitals.sex && <span className="pill" style={{ marginLeft: 6 }}>{vitals.sex}</span>}
              {patInfo?.user?.health_id && <span className="pill pill-info" style={{ marginLeft: 6 }}>🪪 {patInfo.user.health_id}</span>}
              <br /><small style={{ color: '#5d6b7a' }}>{patInfo?.user?.email || ''}</small>
            </span>
          </div>
          <div style={s.grid}>
            <label style={s.label}>Age (yrs)
              <input type="number" min="0" max="130" placeholder="Age" value={vitals.age} onChange={(e) => setVitals({ ...vitals, age: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>Sex
              <select value={vitals.sex} onChange={(e) => setVitals({ ...vitals, sex: e.target.value })} style={s.input}>
                <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </label>
            <label style={s.label}>BP sys (mmHg)
              <input type="number" min="50" max="300" placeholder="120" value={vitals.bp_sys} onChange={(e) => setVitals({ ...vitals, bp_sys: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>BP dia (mmHg)
              <input type="number" min="30" max="200" placeholder="80" value={vitals.bp_dia} onChange={(e) => setVitals({ ...vitals, bp_dia: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>Pulse (/min)
              <input type="number" min="20" max="250" placeholder="72" value={vitals.pulse} onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>SpO2 (%)
              <input type="number" min="50" max="100" placeholder="98" value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>Temp (°C)
              <input type="number" min="30" max="45" step="0.1" placeholder="37.0" value={vitals.temp_c} onChange={(e) => setVitals({ ...vitals, temp_c: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>Weight (kg)
              <input type="number" min="0" max="500" step="0.1" placeholder="65" value={vitals.weight_kg} onChange={(e) => setVitals({ ...vitals, weight_kg: e.target.value })} style={s.input} />
            </label>
          </div>
          <select value={form.note_type} onChange={(e) => setForm({ ...form, note_type: e.target.value })} style={s.input}>
            <option value="prescription">E-Prescription</option>
            <option value="note">Visit note</option>
          </select>
          <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={s.input} />
          <div style={s.grid}>
            <label style={s.label}>Diagnosis (ICD-10)
              <input placeholder="e.g. J06.9" value={form.diagnosis_code} onChange={(e) => setForm({ ...form, diagnosis_code: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>Diagnosis name
              <input placeholder="e.g. Acute upper respiratory infection" value={form.diagnosis_name} onChange={(e) => setForm({ ...form, diagnosis_name: e.target.value })} style={s.input} />
            </label>
          </div>
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
      {rxCount > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <button disabled={bulkBusy} onClick={downloadAllRx} title="Download every prescription on one designed PDF (newest first)">
            {bulkBusy ? '⏳ Preparing…' : `⬇ Download all prescriptions (${rxCount}, PDF)`}
          </button>
          {bulkMsg && <small style={{ color: bulkMsg.startsWith('✅') ? 'green' : '#b91c1c' }}>{bulkMsg}</small>}
        </div>
      )}
      {notes.map((n) => (
        <div key={n.id} style={s.note}>
          <b>[{n.note_type}] {n.title || '(no title)'}</b> <small>— Dr. {n.doctor_name} · {n.visit_date || n.created_at.slice(0, 10)}</small>
          {(n.diagnosis_code || n.diagnosis_name) && (
            <div style={{ marginTop: 4 }}><span className="pill pill-info">🩺 {[n.diagnosis_code, n.diagnosis_name].filter(Boolean).join(' — ')}</span></div>
          )}
          {n.vitals && Object.keys(n.vitals).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {n.vitals.age != null && <span className="pill">{n.vitals.age} yrs</span>}
              {n.vitals.sex && <span className="pill">{n.vitals.sex}</span>}
              {(n.vitals.bp_sys || n.vitals.bp_dia) && <span className="pill pill-open">🩸 BP {n.vitals.bp_sys || '—'}/{n.vitals.bp_dia || '—'}</span>}
              {n.vitals.pulse != null && <span className="pill">❤️ Pulse {n.vitals.pulse}</span>}
              {n.vitals.spo2 != null && <span className="pill pill-info">SpO2 {n.vitals.spo2}%</span>}
              {n.vitals.temp_c != null && <span className="pill">🌡 {n.vitals.temp_c} °C</span>}
              {n.vitals.weight_kg != null && <span className="pill">⚖️ {n.vitals.weight_kg} kg</span>}
            </div>
          )}
          <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{n.content}</p>
          {(n.medicines || []).map((m, i) => (
            <div key={i} style={s.med}>💊 <b>{m.name}</b>{m.dosage ? ` — ${m.dosage}` : ''}{m.frequency ? ` · ${m.frequency}` : ''}{m.duration ? ` × ${m.duration}` : ''}</div>
          ))}
          {n.follow_up_date && <div>🔁 Follow-up: {n.follow_up_date}</div>}
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => downloadRx(n.id).catch((e) => alert(e.message || 'Could not download'))}>⬇ Rx PDF</button>
            <button onClick={() => printRx(n.id).catch((e) => alert(e.message || 'Could not print'))}>🖨 Print</button>
            {role === 'patient' && (n.medicines || []).length > 0 && (
              <button onClick={async () => {
                if (!confirm('Ask your doctor for a refill of these medicines?')) return
                const { data } = await api.post(`/api/visits/${n.id}/refill`)
                alert(data.doctor ? `Refill requested — Dr. ${data.doctor} was notified.` : 'Refill requested.')
              }}>🔁 Request refill</button>
            )}
          </div>
        </div>
      ))}
      {!notes.length && <p>No notes yet.</p>}
    </div>
  )
}

/* Daily medicine reminders: patient sets medicine + time, the backend
   scheduler nudges every day (in-app + SMS when configured). */
export function MedReminders() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ medicine_name: '', dosage: '', remind_at: '09:00' })
  const load = async () => {
    const { data } = await api.get('/api/wellness/med-reminders').catch(() => ({ data: [] }))
    setRows(data || [])
  }
  useEffect(() => { load().catch(console.error) }, [])
  const add = async (e) => {
    e.preventDefault()
    await api.post('/api/wellness/med-reminders', form)
    setForm({ medicine_name: '', dosage: '', remind_at: '09:00' })
    load()
  }
  const toggle = async (r) => {
    await api.patch(`/api/wellness/med-reminders/${r.id}`,
      { medicine_name: r.medicine_name, dosage: r.dosage || undefined, remind_at: r.remind_at, active: !r.active })
    load()
  }
  return (
    <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <b>⏰ Daily medicine reminders</b>
      <form onSubmit={add} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        <input required placeholder="Medicine" value={form.medicine_name} onChange={(e) => setForm({ ...form, medicine_name: e.target.value })} style={s.input} />
        <input placeholder="Dosage (optional)" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} style={s.input} />
        <input type="time" value={form.remind_at} onChange={(e) => setForm({ ...form, remind_at: e.target.value })} required style={s.input} title="Remind me daily at" />
        <button type="submit">Add reminder</button>
      </form>
      {rows.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', opacity: r.active ? 1 : 0.55, flexWrap: 'wrap' }}>
          <span>💊 <b>{r.medicine_name}</b>{r.dosage ? ` — ${r.dosage}` : ''} · {r.remind_at} daily</span>
          <button onClick={() => toggle(r)}>{r.active ? 'Pause' : 'Resume'}</button>
          <button onClick={async () => { await api.delete(`/api/wellness/med-reminders/${r.id}`); load() }}>Delete</button>
        </div>
      ))}
      {!rows.length && <small style={{ color: '#5d6b7a' }}>No reminders yet — add one above and MedRec nudges you every day.</small>}
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12, minWidth: 0 },
  input: { padding: 8, fontSize: 14, fontFamily: 'inherit', minWidth: 0, maxWidth: '100%', width: '100%', boxSizing: 'border-box' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(140px,100%),1fr))', gap: 8, minWidth: 0 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 700, color: '#344054', minWidth: 0 },
  patBar: { display: 'flex', gap: 10, alignItems: 'flex-start', background: 'linear-gradient(180deg,#f0fdfa,#ffffff)', border: '1px solid #bfe6e0', borderRadius: 12, padding: '10px 12px', minWidth: 0 },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', alignSelf: 'flex-start' },
  note: { border: '1px solid #f1f5f4', borderLeft: '4px solid #16a34a', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: '#fff' },
  med: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', margin: '4px 0', fontSize: 14 },
  safetyBox: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 8 },
  warn: { borderLeft: '4px solid #d97706', padding: '4px 8px', margin: '4px 0', fontSize: 13, background: '#fff' },
}
