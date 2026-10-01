import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/* Real 404: unknown URLs land here (instead of a silent redirect) with a
   role-aware way back. */
export default function NotFound() {
  const { user } = useAuth()
  const home = !user ? '/' : user.role === 'doctor' ? '/doctor' : user.role === 'admin' ? '/admin' : '/patient'
  const homeLabel = !user ? 'Back to home' : 'Back to my dashboard'
  return (
    <div className="rise" style={{ width: '100%', padding: '60px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 56 }}>🧭</div>
      <h2 style={{ margin: '12px 0 4px' }}>Page not found</h2>
      <p style={{ color: '#667085', margin: '0 0 20px' }}>
        That link doesn&apos;t exist or moved. Your records are safe.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to={home} className="nav-cta" style={{ textDecoration: 'none' }}>{homeLabel} →</Link>
        <Link to="/find-doctors" className="nav-ghost-btn" style={{ textDecoration: 'none', padding: '9px 18px' }}>Find doctors</Link>
      </div>
    </div>
  )
}
