import { Link } from 'react-router-dom'

/* Minimal split layout for auth pages */
export default function AuthSplit({ points, children }) {
  return (
    <div className="auth-split">
      <aside className="auth-side">
        <Link to="/" className="auth-brand"><span className="auth-logo">+</span> MedRec</Link>
        <h1>Your health, organized.</h1>
        <p className="auth-tag">Every report, prescription and visit — explained in plain words, always with you.</p>
        <ul className="auth-points">
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </aside>
      <div className="auth-main">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  )
}
