import MedicineLookup from '../components/MedicineLookup'

export default function Medicines() {
  return (
    <div style={s.wrap} className="rise">
      <h2 style={{ margin: '0 0 4px' }}>💊 Medicine Description</h2>
      <p style={{ color: '#5d6b7a', margin: '0 0 16px', maxWidth: 720 }}>
        Search any medicine for its description, uses, dosage and side effects.
        Data comes from the free openFDA drug-label database (no key needed);
        every result links out to <b>Tata 1mg</b> for India prices, substitutes & delivery.
      </p>
      <section style={s.card}>
        <MedicineLookup />
      </section>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #2f5d3a', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
}
