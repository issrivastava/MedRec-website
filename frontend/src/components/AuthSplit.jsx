import { Link } from 'react-router-dom'

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
      </aside>
      <div className="auth-main">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  )
}
