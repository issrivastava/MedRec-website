import { useEffect, useState } from 'react'
import api from '../api'

export default function Pharmacy() {
  const [items, setItems] = useState([])
  const [alerts, setAlerts] = useState(null)
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ name: '', quantity: 0, price: '', batch_no: '', expiry_date: '', low_stock_at: '' })
  const [check, setCheck] = useState('')
  const [warnings, setWarnings] = useState(null)

  const load = async () => {
    const [{ data: it }, { data: al }] = await Promise.all([
      api.get('/api/pharmacy/items', { params: q ? { q } : {} }),
      api.get('/api/pharmacy/alerts').catch(() => ({ data: null })),
    ])
    setItems(it)
    setAlerts(al)
  }
  useEffect(() => { load().catch(console.error) }, [])

  const add = async (e) => {
    e.preventDefault()
    await api.post('/api/pharmacy/items', {
      name: form.name,
      quantity: parseInt(form.quantity, 10) || 0,
      price: form.price ? parseFloat(form.price) : undefined,
      batch_no: form.batch_no || undefined,
      expiry_date: form.expiry_date || undefined,
      low_stock_at: form.low_stock_at ? parseInt(form.low_stock_at, 10) : undefined,
    })
    setForm({ name: '', quantity: 0, price: '', batch_no: '', expiry_date: '', low_stock_at: '' })
    load()
  }

  const dispense = async (item) => {
    const qty = prompt(`Dispense how many of ${item.name}? (in stock: ${item.quantity})`, '1')
    if (!qty) return
    const pid = prompt('Patient ID (optional, blank to skip)') || undefined
    await api.post('/api/pharmacy/dispense', { item_id: item.id, quantity: parseInt(qty, 10), patient_id: pid || undefined })
    load()
  }

  const runCheck = async () => {
    const meds = check.split(',').map((x) => x.trim()).filter(Boolean)
    const { data } = await api.post('/api/pharmacy/interactions', { medicines: meds })
    setWarnings(data)
  }

  return (
    <div style={s.wrap}>
      <h2>Pharmacy &amp; Inventory</h2>
      {alerts && (
        <div style={s.grid}>
          {[['Low stock', alerts.low_stock], ['Out of stock', alerts.out_of_stock], ['Expired', alerts.expired], ['Expiring 30d', alerts.expiring_30d]].map(([k, v]) => (
            <div key={k} style={s.stat}><div style={s.num}>{v}</div><div>{k}</div></div>
          ))}
        </div>
      )}
      <form onSubmit={add} style={s.card}>
        <h3>Add stock</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input required placeholder="Medicine name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={s.input} />
          <input placeholder="Qty" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={s.input} />
          <input placeholder="Price Rs." type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={s.input} />
          <input placeholder="Batch" value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} style={s.input} />
          <input placeholder="Expiry" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} style={s.input} />
          <input placeholder="Low-stock at" type="number" min="0" value={form.low_stock_at} onChange={(e) => setForm({ ...form, low_stock_at: e.target.value })} style={s.input} />
          <button type="submit" style={s.btn}>Add</button>
        </div>
      </form>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input placeholder="Search medicines" value={q} onChange={(e) => setQ(e.target.value)} style={s.input} />
        <button onClick={load} style={s.btn}>Search</button>
      </div>
      {items.map((it) => (
        <div key={it.id} style={s.row}>
          <span><b>{it.name}</b> · {it.quantity} {it.unit || 'units'}{it.batch_no ? ` · batch ${it.batch_no}` : ''}{it.expiry_date ? ` · exp ${it.expiry_date}` : ''}{it.price ? ` · Rs.${it.price}` : ''}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => dispense(it)}>Dispense</button>
            <button onClick={async () => { if (confirm('Delete item?')) { await api.delete(`/api/pharmacy/items/${it.id}`); load() } }}>Delete</button>
          </span>
        </div>
      ))}
      <section style={s.card}>
        <h3>Drug interaction screen (offline rules)</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Comma-separated: warfarin, aspirin" value={check} onChange={(e) => setCheck(e.target.value)} style={{ ...s.input, flex: 1 }} />
          <button onClick={runCheck} style={s.btn}>Check</button>
        </div>
        {warnings && (
          <div style={{ marginTop: 8 }}>
            <div>Checked {warnings.checked} medicine(s).</div>
            {warnings.warnings.map((w, i) => (
              <div key={i} style={{ color: w.level === 'major' ? '#b91c1c' : '#b45309' }}>⚠ [{w.level}] {w.pair?.join(' + ')} — {w.reason}</div>
            ))}
            {!warnings.warnings.length && <div style={{ color: '#15803d' }}>No known risky pairs in the built-in list.</div>}
            <small>{warnings.disclaimer}</small>
          </div>
        )}
      </section>
    </div>
  )
}

const s = {
  wrap: { maxWidth: 900, margin: '0 auto', padding: 16 },
  grid: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  stat: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, minWidth: 130, textAlign: 'center' },
  num: { fontSize: 22, fontWeight: 700 },
  card: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' },
  input: { border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px' },
  btn: { border: '1px solid #0d9488', borderRadius: 6, padding: '6px 12px', background: '#0d9488', color: '#fff', cursor: 'pointer' },
}
