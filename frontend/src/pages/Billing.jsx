import { useEffect, useState } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

// Bill types — keep in sync with BILL_CATEGORIES in backend billing.py.
const BILL_CATEGORIES = [
  ['consultation', 'Consultation Fees'],
  ['lab', 'Lab Tests'],
  ['xray', 'X-Ray'],
  ['mri', 'MRI Scan'],
  ['imaging', 'Other Imaging (CT/Ultrasound)'],
  ['pharmacy', 'Pharmacy / Medicines'],
  ['procedure', 'Procedure / Surgery'],
  ['room', 'Room / Bed Charges'],
  ['vaccination', 'Vaccination'],
  ['other', 'Other'],
]
const catLabel = (c) => (BILL_CATEGORIES.find(([v]) => v === c) || ['other', 'Other'])[1]
const statusPill = (s) =>
  s === 'paid' ? 'pill-ok'
  : s === 'issued' ? 'pill-info'
  : s === 'partially_paid' ? 'pill-low'
  : (s === 'cancelled' || s === 'refunded') ? 'pill-open' : 'pill'
const inr = (n) => `Rs.${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/* Patient picker: type a name → pick from directory search (staff-wide;
   doctors are auto-scoped to assigned patients by the backend). */
function PatientPicker({ value, onPick, placeholder }) {
  const [term, setTerm] = useState('')
  const [opts, setOpts] = useState([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!term.trim()) { setOpts([]); setOpen(false); return }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/api/directory/patients/search', { params: { q: term, limit: 10 } })
        setOpts(data.results || [])
        setOpen(true)
      } catch { setOpts([]); setOpen(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [term])
  if (value) {
    return (
      <span className="pill pill-info" style={{ padding: '8px 12px', fontSize: 14 }}>
        <b>{value.full_name}</b>
        <span> · {value.health_id || value.email}</span>
        {' '}<button type="button" onClick={() => { onPick(null); setTerm('') }} style={s.linkBtn}>✕ change</button>
      </span>
    )
  }
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <input
        placeholder={placeholder || 'Type patient name…'}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => opts.length && setOpen(true)}
        style={{ minWidth: 220 }}
      />
      {open && !!opts.length && (
        <span style={s.drop}>
          {opts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPick(p); setOpen(false); setTerm('') }}
              style={s.dropItem}
            >
              <b>{p.full_name}</b> <small>· {p.health_id || p.email}{p.phone ? ` · ${p.phone}` : ''}</small>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

export default function Billing() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [summary, setSummary] = useState(null)
  const [patient, setPatient] = useState(null) // filter picker value
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [form, setForm] = useState({ patient_id: '', category: 'consultation', amount: '', payment_mode: 'upi', notes: '', insurance_provider: '', insurance_policy_no: '', referred_by: '' })
  const [formPatient, setFormPatient] = useState(null) // create-form picker value
  const [items, setItems] = useState([]) // line items: [{label, qty, rate}]
  const [newItem, setNewItem] = useState({ label: '', qty: 1, rate: '' })
  const itemsTotal = items.reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [upi, setUpi] = useState(null)
  const [upiRefs, setUpiRefs] = useState({})
  const staff = ['doctor', 'receptionist', 'nurse', 'admin'].includes(user?.role)

  const load = async (pid, st, cat) => {
    const params = {}
    if (pid) params.patient_id = pid
    if (st) params.status = st
    if (cat) params.category = cat
    const { data } = await api.get('/api/billing/invoices', { params })
    setInvoices(data)
    if (staff) {
      try {
        const { data: sm } = await api.get('/api/billing/revenue/summary')
        setSummary(sm)
      } catch { /* ignore */ }
    }
  }
  useEffect(() => { load().catch((e) => setErr(e.message || 'Could not load bills')) }, [])
  useEffect(() => { api.get('/api/billing/upi').then(({ data }) => setUpi(data)).catch(() => setUpi(null)) }, [])

  const printReceipt = async (inv) => {
    const { data } = await api.get(`/api/billing/invoices/${inv.id}/receipt`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${inv.receipt_no || 'receipt'}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const create = async (e) => {
    e.preventDefault()
    setErr(''); setOk('')
    const pid = formPatient ? formPatient.id : form.patient_id
    if (!pid) { setErr('Pick a patient first — type their name above.'); return }
    try {
      const computed = items.length ? Math.round(itemsTotal * 100) / 100 : (parseFloat(form.amount) || 0)
      const { data: inv } = await api.post('/api/billing/invoices', {
        patient_id: pid,
        category: form.category || 'consultation',
        items: items.length ? items.map((it) => ({ label: it.label, qty: Number(it.qty) || 1, rate: Number(it.rate) || 0 })) : undefined,
        amount: computed,
        payment_mode: form.payment_mode || undefined,
        notes: form.notes || undefined,
        insurance_provider: form.insurance_provider || undefined,
        insurance_policy_no: form.insurance_policy_no || undefined,
        referred_by: form.referred_by || undefined,
      })
      setForm({ patient_id: '', category: 'consultation', amount: '', payment_mode: 'upi', notes: '', insurance_provider: '', insurance_policy_no: '', referred_by: '' })
      setFormPatient(null)
      setItems([])
      setNewItem({ label: '', qty: 1, rate: '' })
      await load(patient?.id, status, category)
      try {
        await printReceipt(inv)
        setOk(`Bill ${inv.receipt_no} saved — receipt downloaded, open it to print.`)
      } catch {
        setOk(`Bill ${inv.receipt_no} saved.`)
        setErr('Receipt download failed — press "Print / PDF" on the bill row to retry.')
      }
    } catch (e2) {
      setErr(e2.response?.data?.detail || e2.message || 'Could not save the bill')
    }
  }

  const pay = async (id) => {
    setErr(''); setOk('')
    try {
      const amt = prompt('Amount received (Rs.)?')
      if (!amt) return
      const mode = prompt('Mode: cash/card/upi/netbanking/insurance/other', 'upi') || 'upi'
      let upiRef
      if (mode === 'upi') {
        upiRef = prompt('UPI reference / UTR (from payer, optional)') || undefined
      }
      await api.post(`/api/billing/invoices/${id}/pay`, { paid_amount: parseFloat(amt), payment_mode: mode, ...(upiRef ? { upi_ref: upiRef } : {}) })
      setOk('Payment recorded.')
      load(patient?.id, status, category)
    } catch (e2) {
      setErr(e2.response?.data?.detail || e2.message || 'Could not record payment')
    }
  }

  const submitUpiRef = async (inv) => {
    setErr(''); setOk('')
    try {
      const ref = (upiRefs[inv.id] || '').trim()
      if (ref.length < 4) { setErr('Enter the UPI reference / UTR number from your payment app.'); return }
      await api.post(`/api/billing/invoices/${inv.id}/upi-ref?upi_ref=${encodeURIComponent(ref)}`)
      setUpiRefs((m) => ({ ...m, [inv.id]: '' }))
      setOk('UPI reference submitted — the desk will verify and mark it paid.')
      load(patient?.id, status, category)
    } catch (e2) {
      setErr(e2.response?.data?.detail || e2.message || 'Could not submit reference')
    }
  }

  return (
    <div className="billing-page rise" style={s.wrap}>
      <h2 style={{ margin: '0 0 4px' }}>🧾 Billing &amp; Payments</h2>
      <p className="page-sub">Create bills, collect payments, print receipts — no patient IDs needed, just type a name.</p>
      {err && <div className="callout-err" role="alert">{err}</div>}
      {ok && <div className="callout-ok">{ok}</div>}

      {upi?.configured && (
        <div className="callout">
          <b>📱 Pay by UPI:</b> send the exact amount to <b>{upi.vpa}</b> from any UPI app,
          then paste the UTR / reference number on your invoice below. The front desk verifies and marks it paid.
        </div>
      )}

      {summary && (
        <div className="stat-grid">
          <div className="gstat g-teal"><div className="num">{summary.invoices}</div><div className="lbl">Invoices</div><span className="big-icon">🧾</span></div>
          <div className="gstat g-green"><div className="num">{inr(summary.revenue_collected)}</div><div className="lbl">Collected</div><span className="big-icon">💰</span></div>
          <div className="gstat g-amber"><div className="num">{inr(summary.fees_pending)}</div><div className="lbl">Pending</div><span className="big-icon">⏳</span></div>
        </div>
      )}

      {staff && (
        <div className="toolbar-row no-print">
          <PatientPicker value={patient} onPick={setPatient} placeholder="Filter by patient name…" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {['draft', 'issued', 'paid', 'partially_paid', 'cancelled', 'refunded'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by bill type">
            <option value="">All bill types</option>
            {BILL_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => load(patient?.id, status, category)} className="btn-teal">Filter</button>
          {patient && <button onClick={() => { setPatient(null); load(null, status, category) }}>Clear patient</button>}
          <button onClick={() => window.print()} title="Print this bill list (or save as PDF)">🖨 Print page</button>
        </div>
      )}

      {staff && (
        <form onSubmit={create} className="card no-print">
          <h3 className="section-title">＋ New invoice</h3>
          <div style={{ marginBottom: 10 }}>
            <PatientPicker value={formPatient} onPick={(p) => setFormPatient(p)} placeholder="Type patient name… *" />
          </div>
          <div style={s.grid}>
            <label style={s.label}>Bill type
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} title="Bill type" style={s.input}>
                {BILL_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={s.label}>Total amount (Rs.)
              <input
                required={items.length === 0}
                placeholder={items.length ? `Auto: Rs.${itemsTotal.toFixed(2)}` : 'Amount Rs.'}
                type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                disabled={items.length > 0} title={items.length ? 'Total is calculated from the line items below' : 'Amount Rs.'}
                style={s.input} />
            </label>
            <label style={s.label}>Expected mode
              <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })} title="Expected payment mode" style={s.input}>
                {['cash', 'card', 'upi', 'netbanking', 'insurance', 'other'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label style={s.label}>Referred by
              <input placeholder="e.g. Dr. Mehta, City Hospital" value={form.referred_by} onChange={(e) => setForm({ ...form, referred_by: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>Insurance provider
              <input placeholder="Insurance provider" value={form.insurance_provider} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} style={s.input} />
            </label>
            <label style={s.label}>Policy no.
              <input placeholder="Policy no." value={form.insurance_policy_no} onChange={(e) => setForm({ ...form, insurance_policy_no: e.target.value })} style={s.input} />
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <b style={{ fontSize: 13.5 }}>🧾 Line items {items.length ? `(total Rs.${itemsTotal.toFixed(2)})` : '(optional — adds a breakdown to the receipt)'}</b>
            {!!items.length && (
              <div style={{ marginTop: 6 }}>
                {items.map((it, i) => (
                  <div key={i} style={s.itemRow}>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{it.label}</b> <small style={s.muted}>× {it.qty} @ Rs.{Number(it.rate).toFixed(2)} = Rs.{(it.qty * it.rate).toFixed(2)}</small></span>
                    <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} style={s.linkBtn}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div style={s.itemForm}>
              <input placeholder="Item e.g. MRI Brain" value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} style={{ ...s.input, flex: '2 1 160px' }} aria-label="Item name" />
              <input placeholder="Qty" type="number" min="1" value={newItem.qty} onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })} style={{ ...s.input, flex: '1 1 70px' }} aria-label="Quantity" />
              <input placeholder="Rate Rs." type="number" min="0" step="0.01" value={newItem.rate} onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })} style={{ ...s.input, flex: '1 1 100px' }} aria-label="Rate" />
              <button type="button" onClick={() => {
                if (!newItem.label.trim()) return
                setItems((xs) => [...xs, { label: newItem.label.trim(), qty: Number(newItem.qty) || 1, rate: Number(newItem.rate) || 0 }])
                setNewItem({ label: '', qty: 1, rate: '' })
              }}>＋ Add</button>
            </div>
          </div>
          <label style={{ ...s.label, marginTop: 10 }}>Notes
            <input placeholder="Notes (visit, discount, instructions…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={s.input} />
          </label>
          <div style={{ marginTop: 10 }}><button type="submit" className="btn-teal">Create &amp; print</button></div>
        </form>
      )}

      {invoices.map((inv) => (
        <div key={inv.id} className="bill-row">
          <div className="bill-main">
            <div className="bill-title">
              <b>{inv.receipt_no}</b>
              <span className="pill pill-info">{catLabel(inv.category)}</span>
              <span className={`pill ${statusPill(inv.status)}`}>{inv.status.replace('_', ' ')}</span>
            </div>
            <div className="bill-meta">
              {inv.patient_name || 'Patient'}{inv.doctor_name ? ` · Dr. ${inv.doctor_name}` : ''} · {inv.created_at.slice(0, 10)}
              {inv.payment_mode ? ` · ${inv.payment_mode}` : ''}
              {inv.insurance_provider ? ` · 🛡 ${inv.insurance_provider}${inv.insurance_policy_no ? ` (${inv.insurance_policy_no})` : ''}` : ''}
              {inv.upi_ref ? ` · UPI ref ${inv.upi_ref}` : ''}
            </div>
            {inv.referred_by && <div className="bill-meta">↩️ Referred by: <b>{inv.referred_by}</b></div>}
            {!!(inv.items || []).length && (
              <div className="bill-meta">
                {(inv.items || []).map((it, i) => (
                  <span key={i} className="pill" style={{ marginRight: 4 }}>{it.label} × {it.qty} @ Rs.{it.rate}</span>
                ))}
              </div>
            )}
            {inv.notes && <div className="bill-meta">📝 {inv.notes}</div>}
            <div className="bill-amounts">
              <span>Total <b>{inr(inv.amount)}</b></span>
              <span>Paid <b>{inr(inv.paid_amount)}</b></span>
              <span>Balance <b>{inr(inv.balance)}</b></span>
            </div>
          </div>
          <div className="bill-side no-print">
            <button onClick={() => printReceipt(inv).catch((e) => setErr(e.message || 'Could not download receipt'))}>🖨 Print / PDF</button>
            {staff && inv.status !== 'paid' && inv.status !== 'cancelled' && <button onClick={() => pay(inv.id)}>Record payment</button>}
            {!staff && upi?.configured && inv.status !== 'paid' && inv.status !== 'cancelled' && (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <input placeholder="UPI UTR / ref" value={upiRefs[inv.id] || ''} onChange={(e) => setUpiRefs((m) => ({ ...m, [inv.id]: e.target.value }))} style={{ width: 150 }} />
                <button onClick={() => submitUpiRef(inv)}>I paid via UPI</button>
              </span>
            )}
          </div>
        </div>
      ))}
      {!invoices.length && (
        <div className="empty">
          {staff
            ? <>No bills{patient ? ` for ${patient.full_name}` : ''} yet — pick a patient above and create the first one. 🧾</>
            : 'No bills yet.'}
        </div>
      )}
    </div>
  )
}

const s = {
  wrap: { maxWidth: 900, margin: '0 auto', padding: 16 },
  linkBtn: { background: 'none', border: 0, color: '#0d9488', cursor: 'pointer', padding: 0, fontWeight: 700 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 8, minWidth: 0 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700, minWidth: 0 },
  input: { padding: '10px 12px', fontSize: 14, minWidth: 0, maxWidth: '100%', width: '100%', boxSizing: 'border-box' },
  muted: { color: '#5d6b7a' },
  itemRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: '1px solid #e9edf2', borderRadius: 10, padding: '6px 10px', marginBottom: 6, background: '#fbfcfd', fontSize: 13.5 },
  itemForm: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  drop: { position: 'absolute', top: '100%', left: 0, zIndex: 20, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, minWidth: 260, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 14px rgba(0,0,0,.12)' },
  dropItem: { display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 0, borderBottom: '1px solid #eee', padding: '8px 10px', cursor: 'pointer' },
}
