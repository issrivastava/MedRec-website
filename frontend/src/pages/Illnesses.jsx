import IllnessLookup from '../components/IllnessLookup'

export default function Illnesses() {
  return (
    <div style={s.wrap} className="rise">
      <h2 style={{ margin: '0 0 4px' }}>🩺 Illness Description</h2>
      <p style={{ color: '#5d6b7a', margin: '0 0 16px', maxWidth: 720 }}>
        Search any illness for its overview, symptoms, causes, diagnosis,
        treatment and prevention. Data comes from the free Wikipedia
        encyclopedia (no key needed), with a built-in offline guide as backup.
      </p>
      <section style={s.card}>
        <IllnessLookup />
      </section>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #8b2e3c', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
}
