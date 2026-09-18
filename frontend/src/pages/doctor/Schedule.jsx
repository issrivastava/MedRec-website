import Appointments from '../../components/Appointments'

export default function Schedule() {
  return (
    <section style={s.card} className="rise">
      <h3 className="sec-head"><span className="tile t-teal">📅</span> Availability & Appointments</h3>
      <Appointments role="doctor" />
    </section>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', minWidth: 0 },
}
