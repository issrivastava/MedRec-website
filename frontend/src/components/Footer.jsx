import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Footer() {
  const { user } = useAuth()
  const year = new Date().getFullYear()
  const dashboard = user ? (user.role === 'doctor' ? '/doctor' : user.role === 'admin' ? '/admin' : '/patient') : '/login'

  return (
    <footer style={s.footer}>
      <div style={s.inner}>
        <div>
          <div style={s.brand}>MedRec</div>
          <p style={s.tag}>Your medical records, organized — for patients and doctors.</p>
        </div>
        <div style={s.cols}>
          <div style={s.col}>
            <b>Product</b>
            <Link to="/" style={s.link}>Home</Link>
            <Link to="/medicines" style={s.link}>Medicine Description</Link>
            <Link to="/diseases" style={s.link}>Disease Description</Link>
            <Link to="/find-doctors" style={s.link}>Find Doctors</Link>
            <Link to="/ask-ai" style={s.link}>Ask AI</Link>
            {user ? (
              <>
                <Link to={dashboard} style={s.link}>My Dashboard</Link>
                {user.role !== 'admin' && <Link to="/timeline" style={s.link}>Health Timeline</Link>}
              </>
            ) : (
              <>
                <Link to="/login" style={s.link}>Login</Link>
                <Link to="/register" style={s.link}>Register</Link>
              </>
            )}
          </div>
          <div style={s.col}>
            <b>Support</b>
            <Link to="/contact" style={s.link}>Contact Us</Link>
            <Link to="/policy" style={s.link}>Company Policy</Link>
            <Link to="/forgot-password" style={s.link}>Forgot Password</Link>
          </div>
          {user && (
            <div style={s.col}>
              <b>My Account</b>
              <Link to="/profile" style={s.link}>My Profile</Link>
              <Link to="/notifications" style={s.link}>Notifications</Link>
              {user.role !== 'admin' && <Link to="/timeline" style={s.link}>Health Timeline</Link>}
            </div>
          )}
        </div>
      </div>
      <div style={s.bottom}>© {year} MedRec. All rights reserved. · AI summaries are informational only — always consult your doctor.</div>
    </footer>
  )
}

const s = {
  footer: { background: '#1a2e45', color: '#fff', marginTop: 32, borderTop: '4px solid #8a6d3b' },
  inner: { width: '100%', padding: '28px clamp(12px,3vw,30px)', display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' },
  brand: { fontWeight: 700, fontSize: 22, fontFamily: 'Georgia, serif' },
  tag: { margin: '6px 0 0', color: '#c9d4e2', maxWidth: 320 },
  cols: { display: 'flex', gap: 32, flexWrap: 'wrap' },
  col: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 },
  link: { color: '#e8eef5', textDecoration: 'none' },
  bottom: { borderTop: '1px solid rgba(255,255,255,.2)', padding: '12px clamp(12px,3vw,30px)', textAlign: 'left', fontSize: 13, color: '#9fb3c8' },
}
