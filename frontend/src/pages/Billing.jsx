import { useEffect, useState } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

export default function Billing() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [summary, setSummary] = useState(null)
  const [patientId, setPatientId] = useState('')
  const [status, setStatus] = useState('')
  const [form, setForm] = useState({ patient_id: '', amount: '', payment_mode: 'upi', notes: '', insurance_provider: '', insurance_policy_no: '' })
  const staff = ['doctor', 'receptionist', 'nurse', 'admin'].includes(user?.role)

  const load = async () => {
    const params = {}
    if (patientId) params.patient_id = patientId
    if (status) params.status = status
    const { data } = await api.get('/api/billing/invoices', { params })
    setInvoices(data)
    if (staff) {
      try {
        const { data: s } = await api.get('/api/billing/revenue/summary')
        setSummary(s)
      } catch { /* ignore */ }
    }
  }
  useEffect(() => { load().catch(console.error) }, [])

  const create = async (e) => {
    e.preventDefault()
    await api.post('/api/billing/invoices', {
      patient_id: form.patient_id,
      amount: parseFloat(form.amount) || 0,
      payment_mode: form.payment_mode || undefined,
      notes: form.notes || undefined,
      insurance_provider: form.insurance_provider || undefined,
      insurance_policy_no: form.insurance_policy_no || undefined,
    })
    setForm({ patient_id: '', amount: '', payment_mode: 'upi', notes: '', insurance_provider: '', insurance_policy_no: '' })
    load()
  }

  const pay = async (id) => {
    const amt = prompt('Amount received (Rs.)?')
    if (!amt) return
    const mode = prompt('Mode: cash/card/upi/netbanking/insurance/other', 'upi') || 'upi'
    await api.post(`/api/billing/invoices/${id}/pay`, { paid_amount: parseFloat(amt), payment_mode: mode })
    load()
  }

  const receipt = async (inv) => {
    const { data } = await api.get(`/api/billing/invoices/${inv.id}/receipt`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${inv.receipt_no || 'receipt'}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={s.wrap}>
      <h2>Billing &amp; Payments</h2>
      {summary && (
        <div style={s.grid}>
          {[['Invoices', summary.invoices], ['Collected (Rs.)', summary.revenue_collected], ['Pending (Rs.)', summary.fees_pending]].map(([k, v]) => (
            <div key={k} style={s.stat}><div style={s.num}>{v}</div><div>{k}</div></div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input placeholder="Patient ID filter" value={patientId} onChange={(e) => setPatientId(e.target.value)} style={s.input} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={s.input}>
          <option value="">All statuses</option>
          {['draft', 'issued', 'paid', 'partially_paid', 'cancelled', 'refunded'].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <button onClick={load} style={s.btn}>Filter</button>
      </div>
      {staff && (
        <form onSubmit={create} style={s.card}>
          <h3>New invoice</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input required placeholder="Patient ID (UUID)" value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} style={s.input} />
            <input required placeholder="Amount Rs." type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={s.input} />
            <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })} style={s.input}>
              {['cash', 'card', 'upi', 'netbanking', 'insurance', 'other'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input placeholder="Insurance provider" value={form.insurance_provider} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} style={s.input} />
            <input placeholder="Policy no." value={form.insurance_policy_no} onChange={(e) => setForm({ ...form, insurance_policy_no: e.target.value })} style={s.input} />
            <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={s.input} />
            <button type="submit" style={s.btn}>Create</button>
          </div>
        </form>
      )}
      {invoices.map((inv) => (
        <div key={inv.id} style={s.row}>
          <span><b>{inv.receipt_no}</b> · {inv.patient_name || inv.patient_id} · Rs.{inv.amount} · paid Rs.{inv.paid_amount} · bal Rs.{inv.balance} · <i>{inv.status}</i>{inv.insurance_provider ? ` · 🛡 ${inv.insurance_provider}` : ''}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => receipt(inv)}>Receipt PDF</button>
            {staff && inv.status !== 'paid' && inv.status !== 'cancelled' && <button onClick={() => pay(inv.id)}>Record payment</button>}
          </span>
        </div>
      ))}
      {!invoices.length && <p>No invoices.</p>}
    </div>
  )
}

const s = {
  wrap: { maxWidth: 900, margin: '0 auto', padding: 16 },
  grid: { display: 'flex', gap: 12, marginBottom: 12 },
  stat: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, minWidth: 140, textAlign: 'center' },
  num: { fontSize: 22, fontWeight: 700 },
  card: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' },
  input: { border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px' },
  btn: { border: '1px solid #0d9488', borderRadius: 6, padding: '6px 12px', background: '#0d9488', color: '#fff', cursor: 'pointer' },
}
