import RiskDashboard from '../../components/RiskDashboard'

export default function Risk() {
  return (
    <section style={s.card} className="rise">
      <h3 className="sec-head"><span className="tile t-rose">🔥</span> Patient Risk Board</h3>
      <RiskDashboard />
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
}
