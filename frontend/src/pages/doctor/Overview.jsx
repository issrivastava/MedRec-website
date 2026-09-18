import { Link } from 'react-router-dom'
import { Avatar } from '../../components/People'
import { useDoctor } from './DoctorContext'

export default function Overview() {
  const { patients, appts, noteCount, loading } = useDoctor()
  const booked = (appts || []).filter((a) => a.status === 'booked')
  const today = new Date().toISOString().slice(0, 10)
  const todays = booked.filter((a) => a.date === today)

  if (loading) return <div className="empty">Loading overview…</div>

  return (
    <div className="rise">
      <div className="stat-grid">
        <Link to="/doctor/patients" style={{ textDecoration: 'none' }}>
          <div className="gstat g-blue"><div className="num">{patients.length}</div><div className="lbl">My patients →</div><span className="big-icon">🧑‍🤝‍🧑</span></div>
        </Link>
        <Link to="/doctor/schedule" style={{ textDecoration: 'none' }}>
          <div className="gstat g-teal"><div className="num">{booked.length}</div><div className="lbl">Booked visits →</div><span className="big-icon">📅</span></div>
        </Link>
        <Link to="/doctor/prescriptions" style={{ textDecoration: 'none' }}>
          <div className="gstat g-violet"><div className="num">{noteCount}</div><div className="lbl">Notes written →</div><span className="big-icon">💊</span></div>
        </Link>
        <Link to="/doctor/reviews" style={{ textDecoration: 'none' }}>
          <div className="gstat g-amber"><div className="num">⭐</div><div className="lbl">Ratings & reviews →</div><span className="big-icon">⭐</span></div>
        </Link>
      </div>
      <div className="cols-2">
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-teal">📅</span> Today's Schedule</h3>
          {todays.map((a) => (
            <div key={a.id} style={s.row}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar seed={a.patient_id} name={a.patient_name} size={34} />
                <span><b>{a.start_time}</b> — {a.patient_name}{a.reason ? ` · ${a.reason}` : ''}</span>
              </span>
              <span className="pill pill-info">{a.status}</span>
            </div>
          ))}
          {!todays.length && <div className="empty">No appointments today. Enjoy the breather! ☕</div>}
          <div style={{ marginTop: 10 }}><Link to="/doctor/schedule"><button>Manage schedule →</button></Link></div>
        </section>
        <section style={s.card}>
          <h3 className="sec-head"><span className="tile t-blue">⚡</span> Quick actions</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/doctor/practice"><button>🏥 OPD queue</button></Link>
            <Link to="/doctor/patients"><button>🧑‍🤝‍🧑 Patient list</button></Link>
            <Link to="/doctor/prescriptions"><button>✍️ Write prescription</button></Link>
            <Link to="/doctor/engage"><button>📣 Engage</button></Link>
            <Link to="/doctor/insights"><button>📊 Insights & AI</button></Link>
            <Link to="/doctor/chat"><button>💬 Open chat</button></Link>
            <Link to="/doctor/growth"><button>🌟 Growth</button></Link>
            <Link to="/doctor/safety"><button>🛡️ Safety</button></Link>
            <Link to="/doctor/profile"><button>👤 Edit profile</button></Link>
          </div>
          <p style={{ fontSize: 13, color: '#5d6b7a' }}>
            Tip: pick a patient in <b>Patients</b> once — prescriptions, chat, referrals and records all follow that selection.
          </p>
        </section>
      </div>
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)', minWidth: 0 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap', alignItems: 'center' },
}
