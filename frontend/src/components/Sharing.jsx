import { useEffect, useState } from 'react'
import api from '../api'

/* Secure share links (expiring + QR) + granular consent manager. */
export function ShareManager() {
  const [links, setLinks] = useState([])
  const [form, setForm] = useState({ scope: 'documents', expires_in_hours: 72, max_views: 5, label: '' })
  const load = async () => { const { data } = await api.get('/api/sharing/share'); setLinks(data) }
  useEffect(() => { load().catch(console.error) }, [])

  const create = async (e) => {
    e.preventDefault()
    const { data } = await api.post('/api/sharing/share', { ...form, expires_in_hours: +form.expires_in_hours || 72, max_views: +form.max_views || 0 })
    setForm({ scope: 'documents', expires_in_hours: 72, max_views: 5, label: '' })
    load()
    alert(`Share link created:\n${window.location.origin}/s/${data.token}`)
  }

  return (
    <div>
      <form onSubmit={create} style={s.form}>
        <b>New secure share link (QR for hospital / family)</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} style={s.input}>
            <option value="documents">Documents</option><option value="vitals">Vitals</option>
            <option value="prescriptions">Prescriptions</option><option value="all">Everything</option>
          </select>
          <input type="number" value={form.expires_in_hours} onChange={(e) => setForm({ ...form, expires_in_hours: e.target.value })} title="Expires in hours" style={{ ...s.input, width: 110 }} />
          <input type="number" value={form.max_views} onChange={(e) => setForm({ ...form, max_views: e.target.value })} title="Max views (0=unlimited)" style={{ ...s.input, width: 110 }} />
          <input placeholder="Label (e.g. City Hospital)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} style={s.input} />
          <button style={s.btn}>Create link</button>
        </div>
      </form>
      {links.map((l) => {
        const url = `${window.location.origin}/s/${l.token}`
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`
        return (
          <div key={l.id} style={s.row}>
            <img src={qr} alt="QR" width={70} height={70} style={{ border: '1px solid #eee', borderRadius: 8 }} />
            <div style={{ flex: 1 }}>
              <b>{l.label || l.scope}</b> · {l.views}/{l.max_views || '∞'} views · expires {l.expires_at?.slice(0, 16).replace('T', ' ')}
              <br /><code style={{ fontSize: 12, wordBreak: 'break-all' }}>{url}</code>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={() => { navigator.clipboard?.writeText(url); alert('Copied!') }}>Copy</button>
                <a href={url} target="_blank" rel="noreferrer"><button>Open</button></a>
                {!l.revoked && <button onClick={async () => { await api.delete(`/api/sharing/share/${l.id}`); load() }}>Revoke</button>}
                {l.revoked && <i>revoked</i>}
              </div>
            </div>
          </div>
        )
      })}
      {!links.length && <p>No share links yet.</p>}
    </div>
  )
}

export function ConsentManager({ doctors }) {
  const [rows, setRows] = useState([])
  const scopes = ['records', 'vitals', 'prescriptions', 'chat']
  const load = async () => { const { data } = await api.get('/api/sharing/consents'); setRows(data) }
  useEffect(() => { load().catch(console.error) }, [])

  const set = async (doctor_id, scope, allowed) => {
    await api.post('/api/sharing/consents', { doctor_id, scope, allowed })
    load()
  }

  const byDoctor = {}
  rows.forEach((r) => { (byDoctor[r.doctor_id] ||= { name: r.doctor_name, scopes: {} })[r.doctor_id]; byDoctor[r.doctor_id].scopes[r.scope] = r.allowed })

  return (
    <div>
      <p style={{ color: '#64748b', fontSize: 13 }}>Control what each doctor can see. Default is allowed — turn off to restrict. Doctors see only allowed scopes.</p>
      {(doctors || []).map((d) => (
        <div key={d.doctor_id} style={s.row}>
          <b>{d.doctor_name}</b>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {scopes.map((sc) => {
              const allowed = byDoctor[d.doctor_id]?.scopes[sc] !== false
              return (
                <label key={sc} style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={allowed} onChange={(e) => set(d.doctor_id, sc, e.target.checked)} /> {sc}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {!(doctors || []).length && <p>No linked doctors yet.</p>}
    </div>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 },
  input: { padding: 8, fontSize: 14 },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  row: { display: 'flex', gap: 10, border: '1px solid #f1f5f4', borderRadius: 10, padding: 10, marginBottom: 8, background: '#fff', alignItems: 'center', flexWrap: 'wrap' },
}
