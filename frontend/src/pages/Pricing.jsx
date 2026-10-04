import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

/* Bill heads that can appear on a MedRec invoice (priced at actuals —
   never invented here). Keep in sync with BILL_CATEGORIES (backend). */
const BILL_HEADS = [
  ['Consultation', 'Doctor visit fee — see live bands below.'],
  ['Lab', 'Pathology tests, billed per test at lab rates.'],
  ['X-Ray / MRI / Imaging', 'Charged per scan at the imaging rate card.'],
  ['Pharmacy', 'Medicines at MRP, with stock-batch tracking.'],
  ['Procedure', 'Minor procedures, quoted before treatment.'],
  ['Room', 'Day-care / observation charges, if any.'],
  ['Vaccination', 'Vaccine cost + administration.'],
  ['Other', 'Anything else, always itemised on your receipt.'],
]

export default function Pricing() {
  const [bands, setBands] = useState(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    api.get('/api/doctors/fee-bands').then(({ data }) => {
      setBands(data?.bands || [])
      setNote(data?.note || '')
    }).catch(() => setBands([]))
  }, [])

  return (
    <div className="page-narrow">
      <p className="kicker">Transparent pricing</p>
      <h1 className="h2-min">What will my visit cost?</h1>
      <p className="sub-min">Live consultation bands from doctors on MedRec. No hidden charges — every bill is itemised and every receipt is downloadable.</p>

      <section className="card-min">
        <h3 className="sec-head"><span className="tile t-teal">💳</span> Consultation fees by specialty</h3>
        {bands === null && <p>Loading live bands…</p>}
        {bands && !bands.length && (
          <p>No doctor has published a fee yet — consultation charges are confirmed with the clinic before your visit.</p>
        )}
        {!!bands?.length && (
          <div className="price-grid">
            {bands.map((b) => (
              <div key={b.specialization} className="price-row">
                <div>
                  <b>{b.specialization}</b>
                  <div className="muted-sm">{b.doctors} doctor{b.doctors === 1 ? '' : 's'}</div>
                </div>
                <div className="price-val">
                  ₹{b.min_fee}{b.max_fee !== b.min_fee ? ` – ₹${b.max_fee}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
        {note && <p className="fine-print">{note}</p>}
      </section>

      <section className="card-min">
        <h3 className="sec-head"><span className="tile t-blue">🧾</span> What can appear on your bill</h3>
        <div className="price-grid">
          {BILL_HEADS.map(([head, text]) => (
            <div key={head} className="price-row">
              <div><b>{head}</b><div className="muted-sm">{text}</div></div>
              <div className="price-val muted-sm">at actuals</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card-min">
        <h3 className="sec-head"><span className="tile t-green">✅</span> Pay your way</h3>
        <ul className="plain-list">
          <li>💵 Cash, 💳 cards, 📱 UPI (scan-to-pay QR on every receipt with a balance).</li>
          <li>🛡️ Insurance: add your provider + policy number on any bill; claim details print on the receipt.</li>
          <li>🧾 Every payment gives a downloadable, signed PDF receipt — reprint anytime from Billing.</li>
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <Link to="/find-doctors" className="btn-min-primary">Find doctors →</Link>
          <Link to="/contact" className="btn-min">Ask for an estimate</Link>
        </div>
      </section>
    </div>
  )
}
