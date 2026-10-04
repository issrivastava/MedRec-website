import { useEffect, useState } from 'react'
import api from '../api'
import AdminActivity from '../components/AdminActivity'

export default function Admin() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [msgs, setMsgs] = useState([])
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [brand, setBrand] = useState(null)
  const [form, setForm] = useState({ clinic_name: '', clinic_address: '', support_email: '', timings: '', footer_note: '' })
  const [brandMsg, setBrandMsg] = useState('')
  const [brandBusy, setBrandBusy] = useState(false)

  const load = async () => {
    const [{ data: st }, { data: u }, { data: m }] = await Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/users', { params: { q: q || undefined, role: role || undefined } }),
      api.get('/api/admin/contact'),
    ])
    setStats(st); setUsers(u); setMsgs(m)
  }
  useEffect(() => { load().catch(console.error); loadBrand().catch(console.error) }, [])

  const loadBrand = async () => {
    const { data } = await api.get('/api/branding').catch(() => ({ data: null }))
    if (!data) return
    setBrand(data)
    setForm({
      clinic_name: data.custom?.clinic_name || '',
      clinic_address: data.custom?.clinic_address || '',
      support_email: data.custom?.support_email || '',
      timings: data.custom?.timings || '',
      footer_note: data.custom?.footer_note || '',
    })
  }

  const saveBrand = async (e) => {
    e?.preventDefault()
    setBrandBusy(true); setBrandMsg('')
    try {
      const { data } = await api.put('/api/branding', form)
      setBrand(data)
      setBrandMsg('✅ Branding saved — new PDFs use the custom header & footer.')
    } catch (err) {
      setBrandMsg(`⚠️ ${err.response?.data?.detail || err.message || 'Could not save'}`)
    } finally {
      setBrandBusy(false)
    }
  }

  const uploadLogo = async (file) => {
    if (!file) return
    setBrandBusy(true); setBrandMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/api/branding/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setBrand(data)
      setBrandMsg('✅ Logo uploaded — it now heads every PDF.')
    } catch (err) {
      setBrandMsg(`⚠️ ${err.response?.data?.detail || err.message || 'Logo upload failed'}`)
    } finally {
      setBrandBusy(false)
    }
  }

  const removeLogo = async () => {
    if (!confirm('Remove the custom logo? PDFs will use the default mark.')) return
    setBrandBusy(true); setBrandMsg('')
    try {
      const { data } = await api.delete('/api/branding/logo')
      setBrand(data)
      setBrandMsg('✅ Logo removed.')
    } catch (err) {
      setBrandMsg(`⚠️ ${err.response?.data?.detail || err.message || 'Could not remove logo'}`)
    } finally {
      setBrandBusy(false)
    }
  }

  const setUserRole = async (id, r) => {
    await api.patch(`/api/admin/users/${id}/role?role=${r}`)
    load()
  }
  const delUser = async (id) => {
    if (!confirm('Delete this user and all their data?')) return
    await api.delete(`/api/admin/users/${id}`)
    load()
  }

  return (
    <div style={s.wrap}>
      <h2>Admin Panel</h2>
      <AdminActivity />
      {stats && (
        <div style={s.grid}>
          {[['Users', stats.users_total], ['Patients', stats.patients], ['Doctors', stats.doctors],
            ['Front desk', stats.receptionists || 0],
            ['Documents', stats.documents], ['Booked appts', stats.appointments_booked],
            ['Today', stats.appointments_today || 0],
            ['Visit notes', stats.visit_notes], ['Reviews', stats.reviews || 0], ['Contact msgs', stats.contact_messages],
            ['Invoices', stats.invoices || 0], ['Revenue Rs.', stats.revenue_collected || 0], ['Pending Rs.', stats.fees_pending || 0]].map(([k, v]) => (
            <div key={k} style={s.stat}><div style={s.num}>{v}</div><div>{k}</div></div>
          ))}
        </div>
      )}

      <section style={s.card}>
        <h3>🖨️ PDF header &amp; footer (clinic branding)</h3>
        <p style={{ fontSize: 13, color: '#5d6b7a', margin: '0 0 10px' }}>
          Applies to <b>every</b> generated PDF — e-prescriptions, bill receipts, certificates,
          record exports, document PDFs and AI summaries. Leave a field blank to use the default.
        </p>
        {brand && (
          <p style={{ fontSize: 13, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
            Currently printing: <b>{brand.clinic_name}</b>
            {brand.support_email && <> · {brand.support_email}</>}
            {brand.timings && <> · {brand.timings}</>}
            {brand.has_custom_logo ? ' · 🖼️ custom logo' : ' · default mark'}
          </p>
        )}
        <form onSubmit={saveBrand} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 8, marginBottom: 10 }}>
          <label style={s.blabel}>Clinic name
            <input value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} placeholder="e.g. City Care Clinic" style={s.input} maxLength={120} />
          </label>
          <label style={s.blabel}>Address (header line)
            <input value={form.clinic_address} onChange={(e) => setForm({ ...form, clinic_address: e.target.value })} placeholder="e.g. 12 MG Road, Mumbai" style={s.input} maxLength={500} />
          </label>
          <label style={s.blabel}>Support email (footer)
            <input value={form.support_email} onChange={(e) => setForm({ ...form, support_email: e.target.value })} placeholder="e.g. care@clinic.com" style={s.input} maxLength={120} />
          </label>
          <label style={s.blabel}>Working hours (footer)
            <input value={form.timings} onChange={(e) => setForm({ ...form, timings: e.target.value })} placeholder="e.g. Mon–Sat, 10 AM – 8 PM" style={s.input} maxLength={200} />
          </label>
          <label style={{ ...s.blabel, gridColumn: '1 / -1' }}>Extra footer line (optional)
            <input value={form.footer_note} onChange={(e) => setForm({ ...form, footer_note: e.target.value })} placeholder="e.g. Emergency: 022-12345678" style={s.input} maxLength={200} />
          </label>
        </form>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <button onClick={saveBrand} disabled={brandBusy} style={s.btn}>{brandBusy ? 'Saving…' : 'Save branding'}</button>
          {brand?.logo_data_url && <img src={brand.logo_data_url} alt="Clinic logo" style={{ height: 44, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }} />}
          <label style={{ ...s.btn, background: '#0e9384', cursor: 'pointer' }}>
            ⬆ Upload logo
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {brand?.has_custom_logo && <button onClick={removeLogo} disabled={brandBusy}>Remove logo</button>}
        </div>
        {brandMsg && <small style={{ color: brandMsg.startsWith('✅') ? 'green' : '#b91c1c' }}>{brandMsg}</small>}
      </section>

      <section style={s.card}>
        <h3>Users</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input placeholder="Search name/email" value={q} onChange={(e) => setQ(e.target.value)} style={s.input} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={s.input}>
            <option value="">All roles</option><option value="patient">Patients</option>
            <option value="doctor">Doctors</option><option value="receptionist">Receptionists</option>
            <option value="nurse">Nurses</option><option value="admin">Admins</option>
          </select>
          <button onClick={load} style={s.btn}>Search</button>
        </div>
        {users.map((u) => (
          <div key={u.id} style={s.row}>
            <span><b>{u.full_name}</b> · {u.email} · <i>{u.role}</i></span>
            <span style={{ display: 'flex', gap: 6 }}>
              <select value={u.role} onChange={(e) => setUserRole(u.id, e.target.value)}>
                <option value="patient">patient</option><option value="doctor">doctor</option>
                <option value="receptionist">receptionist</option><option value="nurse">nurse</option>
                <option value="admin">admin</option>
              </select>
              <button onClick={() => delUser(u.id)}>Delete</button>
            </span>
          </div>
        ))}
      </section>

      <section style={s.card}>
        <h3>Contact messages ({msgs.length})</h3>        {msgs.map((m) => (
          <div key={m.id} style={s.msg}>
            <b>{m.subject || '(no subject)'}</b> — {m.name} ({m.email}) <small>{m.created_at.slice(0, 10)}</small>
            <p style={{ margin: '4px 0' }}>{m.message}</p>
            <button onClick={async () => { await api.delete(`/api/admin/contact/${m.id}`); load() }}>Delete</button>
          </div>
        ))}
        {!msgs.length && <p>No messages.</p>}
      </section>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 },
  stat: { background: '#fff', border: '1px solid #c9d4e2', borderRadius: 8, padding: 14, textAlign: 'center' },
  num: { fontSize: 28, fontWeight: 800, color: '#1e3a5f' },
  card: { border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16, background: '#fff' },
  input: { padding: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' },
  blabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 700, color: '#344054', minWidth: 0 },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' },
  msg: { borderBottom: '1px solid #eee', padding: '8px 0' },
}
