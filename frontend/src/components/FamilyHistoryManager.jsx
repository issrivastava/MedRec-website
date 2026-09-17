import { useEffect, useState } from 'react'
import api from '../api'
import { useProfile } from '../context/ProfileContext'

/* Structured family history entries per active profile:
   relation + condition + onset + status + severity + year + notes. */
export default function FamilyHistoryManager() {
  const { activeId, activeName } = useProfile()
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState({ relation: '', condition: '', age_onset: '', status: 'unknown', severity: '', year_diagnosed: '', notes: '' })
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const { data } = await api.get('/api/history/family-history', {
      params: activeId ? { family_member_id: activeId } : {},
    })
    setEntries(data)
  }

  useEffect(() => { load().catch(() => setEntries([])) }, [activeId])

  const submit = async (e) => {
    e.preventDefault()
    setMsg('')
    if (!form.relation || !form.condition) return setMsg('Relation and condition are required')
    const payload = {
      family_member_id: activeId || undefined,
      relation: form.relation,
      condition: form.condition,
      age_onset: form.age_onset ? Number(form.age_onset) : undefined,
      status: form.status || 'unknown',
      severity: form.severity || undefined,
      year_diagnosed: form.year_diagnosed ? Number(form.year_diagnosed) : undefined,
      notes: form.notes || undefined,
    }
    try {
      if (editing) await api.put(`/api/history/family-history/${editing}`, payload)
      else await api.post('/api/history/family-history', payload)
      setForm({ relation: '', condition: '', age_onset: '', status: 'unknown', severity: '', year_diagnosed: '', notes: '' })
      setEditing(null)
      load()
    } catch (err) {
      setMsg(err.response?.data?.detail ? JSON.stringify(err.response.data.detail) : 'Could not save')
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#5d6b7a', margin: '0 0 10px' }}>
        Detailed heredity for <b>{activeName}</b> — e.g. father diabetic at 45, mother hypertensive, sibling asthma.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div className="form-grid">
          <input placeholder="Relation* (father, mother…)" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} style={s.input} />
          <input placeholder="Condition* (diabetes, heart disease…)" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} style={s.input} />
          <input type="number" placeholder="Age at onset" value={form.age_onset} onChange={(e) => setForm({ ...form, age_onset: e.target.value })} style={s.input} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={s.input}>
            <option value="unknown">Status: unknown</option><option value="alive">Alive</option><option value="deceased">Deceased</option>
          </select>
          <input placeholder="Severity (mild/moderate/severe)" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} style={s.input} />
          <input type="number" placeholder="Year diagnosed" value={form.year_diagnosed} onChange={(e) => setForm({ ...form, year_diagnosed: e.target.value })} style={s.input} />
        </div>
        <textarea placeholder="Notes (treatment, complications…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={s.input} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={s.btn}>{editing ? 'Save' : 'Add entry'}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm({ relation: '', condition: '', age_onset: '', status: 'unknown', severity: '', year_diagnosed: '', notes: '' }) }}>Cancel</button>}
        </div>
      </form>
      {msg && <p style={{ color: 'red' }}>{msg}</p>}
      {entries.map((e) => (
        <div key={e.id} className="doc-row">
          <div className="grow">
            <b>{e.condition}</b> <span className="pill pill-info">{e.relation}</span>{' '}
            <span className="pill" style={{ background: '#eef2f7' }}>{e.status}</span>
            <div style={{ fontSize: 13, color: '#5d6b7a' }}>
              {[e.age_onset != null && `onset ${e.age_onset}y`, e.year_diagnosed && `dx ${e.year_diagnosed}`, e.severity].filter(Boolean).join(' · ')}
              {e.notes ? ` — ${e.notes}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => { setEditing(e.id); setForm({ relation: e.relation || '', condition: e.condition || '', age_onset: e.age_onset ?? '', status: e.status || 'unknown', severity: e.severity || '', year_diagnosed: e.year_diagnosed ?? '', notes: e.notes || '' }) }}>Edit</button>
            <button onClick={async () => { await api.delete(`/api/history/family-history/${e.id}`); load() }}>Delete</button>
          </div>
        </div>
      ))}
      {!entries.length && <div className="empty">No family history entries for this profile yet.</div>}
    </div>
  )
}

const s = {
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
}
