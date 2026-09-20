import { useEffect, useState } from 'react'
import api from '../api'
import { useProfile } from '../context/ProfileContext'

/* Structured clinical records: one row per allergy / condition / medicine / surgery.
   Stored in their own tables (allergy_records, medical_conditions,
   medication_records, surgical_records) instead of free-text blobs. */
const KINDS = {
  allergies: {
    title: 'Allergies', icon: '⚠️', nameKey: 'allergen', nameLabel: 'Allergen* (e.g. Penicillin)',
    fields: [
      ['reaction', 'Reaction (e.g. rash)', 'text'],
      ['severity', 'Severity', 'select:mild,moderate,severe'],
      ['status', 'Status', 'select:active,resolved'],
      ['diagnosed_date', 'Diagnosed on', 'date'],
      ['notes', 'Notes', 'text'],
    ],
    line: (r) => (<><b>{r.allergen}</b>{r.severity && <span className="pill pill-open" style={{ marginLeft: 6 }}>{r.severity}</span>} <span className="pill pill-info" style={{ marginLeft: 6 }}>{r.status}</span><div className="muted small">{[r.reaction, r.diagnosed_date].filter(Boolean).join(' · ')}</div></>),
  },
  conditions: {
    title: 'Conditions', icon: '🩺', nameKey: 'condition_name', nameLabel: 'Condition* (e.g. Hypertension)',
    fields: [
      ['kind', 'Type', 'select:chronic,past'],
      ['status', 'Status', 'select:active,managed,resolved'],
      ['severity', 'Severity', 'select:mild,moderate,severe'],
      ['diagnosed_date', 'Diagnosed on', 'date'],
      ['resolved_date', 'Resolved on', 'date'],
      ['notes', 'Notes', 'text'],
    ],
    line: (r) => (<><b>{r.condition_name}</b> <span className="pill pill-info">{r.kind}</span> <span className="pill pill-info" style={{ marginLeft: 6 }}>{r.status}</span><div className="muted small">{[r.severity, r.diagnosed_date].filter(Boolean).join(' · ')}</div></>),
  },
  medications: {
    title: 'Medications', icon: '💊', nameKey: 'medicine_name', nameLabel: 'Medicine* (e.g. Metformin)',
    fields: [
      ['dosage', 'Dosage (e.g. 500mg)', 'text'],
      ['frequency', 'Frequency (e.g. twice daily)', 'text'],
      ['status', 'Status', 'select:ongoing,stopped,completed'],
      ['start_date', 'Started on', 'date'],
      ['end_date', 'Ended on', 'date'],
      ['prescribed_by', 'Prescribed by', 'text'],
      ['notes', 'Notes', 'text'],
    ],
    line: (r) => (<><b>{r.medicine_name}</b>{r.dosage && ` — ${r.dosage}`}{r.frequency && ` · ${r.frequency}`} <span className="pill pill-info" style={{ marginLeft: 6 }}>{r.status}</span><div className="muted small">{[r.prescribed_by, r.start_date].filter(Boolean).join(' · ')}</div></>),
  },
  surgeries: {
    title: 'Surgeries', icon: '🏥', nameKey: 'procedure_name', nameLabel: 'Procedure* (e.g. Appendectomy)',
    fields: [
      ['surgery_date', 'Date', 'date'],
      ['hospital', 'Hospital', 'text'],
      ['surgeon', 'Surgeon', 'text'],
      ['outcome', 'Outcome', 'select:recovered,follow-up,complications'],
      ['notes', 'Notes', 'text'],
    ],
    line: (r) => (<><b>{r.procedure_name}</b> <span className="pill pill-info" style={{ marginLeft: 6 }}>{r.surgery_date || 'undated'}</span><div className="muted small">{[r.hospital, r.surgeon, r.outcome].filter(Boolean).join(' · ')}</div></>),
  },
}

function Section({ kind, memberId }) {
  const cfg = KINDS[kind]
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const params = memberId ? { family_member_id: memberId } : {}
    const { data } = await api.get(`/api/clinical/${kind}`, { params })
    setRows(data)
  }
  useEffect(() => { load().catch(() => setRows([])) }, [memberId])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const add = async (e) => {
    e.preventDefault()
    setMsg('')
    if (!form[cfg.nameKey]?.trim()) return setMsg('Name is required.')
    setBusy(true)
    try {
      await api.post(`/api/clinical/${kind}`, { ...form, ...(memberId ? { family_member_id: memberId } : {}) })
      setForm({})
      await load()
      setMsg('Saved.')
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this entry?')) return
    await api.delete(`/api/clinical/${kind}/${id}`).catch(() => {})
    load()
  }

  return (
    <div style={s.section}>
      <button onClick={() => setOpen((v) => !v)} style={s.head}>
        <span>{cfg.icon} {cfg.title} ({rows.length})</span><span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <form onSubmit={add} style={s.form}>
            <input placeholder={cfg.nameLabel} value={form[cfg.nameKey] || ''} onChange={set(cfg.nameKey)} style={s.input} />
            <div className="form-grid">
              {cfg.fields.map(([k, label, type]) => (
                type.startsWith('select:') ? (
                  <select key={k} value={form[k] || ''} onChange={set(k)} style={s.input}>
                    <option value="">{label}</option>
                    {type.slice(7).split(',').map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input key={k} type={type} placeholder={label} value={form[k] || ''} onChange={set(k)} style={s.input} />
                )
              ))}
            </div>
            <div>
              <button disabled={busy} style={s.btn}>{busy ? 'Saving…' : 'Add'}</button>
              {msg && <small style={{ marginLeft: 8, color: msg === 'Saved.' ? 'green' : 'red' }}>{msg}</small>}
            </div>
          </form>
          {rows.map((r) => (
            <div key={r.id} className="doc-row">
              <div className="grow" style={{ fontSize: 14 }}>{cfg.line(r)}</div>
              <button onClick={() => remove(r.id)} title="Delete">Delete</button>
            </div>
          ))}
          {!rows.length && <p className="muted small">None recorded yet.</p>}
        </div>
      )}
    </div>
  )
}

export default function StructuredRecords() {
  const { activeId, activeName } = useProfile()
  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ margin: '8px 0' }}>Structured records <small className="muted">— for {activeName} (one row each, searchable)</small></h4>
      {Object.keys(KINDS).map((k) => <Section key={k} kind={k} memberId={activeId} />)}
    </div>
  )
}

const s = {
  section: { border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8, background: '#fff' },
  head: { width: '100%', display: 'flex', justifyContent: 'space-between', border: 0, background: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 },
  input: { padding: 8, fontSize: 14, minWidth: 0 },
  btn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700, alignSelf: 'flex-start' },
}
