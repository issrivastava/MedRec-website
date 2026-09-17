import { Link } from 'react-router-dom'
import { Avatar } from './People'

/* Full-screen split layout for auth pages: brand panel stretches the left half,
   the form fills the right — nothing center-aligned on a blank page. */
export default function AuthSplit({ points, children }) {
  return (
    <div className="auth-split">
      <aside className="auth-side">
        <Link to="/" className="auth-brand"><span className="auth-logo">+</span> MedRec</Link>
        <h1>Welcome to MedRec!</h1>
        <p className="auth-tag">Your health history — organized, explained, and always with you.</p>
        <ul className="auth-points">
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 30 }}>
          {['anaya', 'rohan', 'meera', 'arjun', 'sara'].map((n, i) => (
            <span key={n} style={{ marginLeft: i === 0 ? 0 : -12, border: '2px solid #fff', borderRadius: '50%', display: 'inline-flex' }}>
              <Avatar seed={n} name={n} size={40} />
            </span>
          ))}
          <span style={{ marginLeft: 12, fontSize: 14, color: '#c9d4e2' }}>Joined by <b>1,200+ patients</b><br />and <b>120+ doctors</b></span>
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  )
}
