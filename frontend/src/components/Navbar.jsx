import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { avatarSrc } from '../api'

export default function Navbar() {
  const { user, logout } = useAuth()
  const [unread, setUnread] = useState(0)
  const nav = useNavigate()
  const dashboard = user ? (user.role === 'doctor' ? '/doctor' : '/patient') : '/login'
  const pic = avatarSrc(user)

  useEffect(() => {
    if (!user) return
    const fetchCount = () => api.get('/api/notifications/unread-count').then(({ data }) => setUnread(data.unread)).catch(() => {})
    fetchCount()
    const t = setInterval(fetchCount, 30000)
    return () => clearInterval(t)
  }, [user])

  return (
    <header style={styles.header}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.brand}>
          <span style={styles.logo}>+</span> MedRec
        </Link>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/" style={styles.link}>Home</Link>
          <Link to="/contact" style={styles.link}>Contact Us</Link>
          <Link to="/policy" style={styles.link}>Company Policy</Link>
          {user ? (
            <>
              {user.role !== 'admin' && <Link to={dashboard} style={styles.link}>Dashboard</Link>}
              {user.role !== 'admin' && <Link to="/timeline" style={styles.link}>Timeline</Link>}
              {user.role === 'admin' && <Link to="/admin" style={styles.link}>Admin</Link>}
              <Link to="/notifications" style={styles.link}>🔔{unread > 0 ? ` (${unread})` : ''}</Link>
              <Link to="/profile" style={{ ...styles.link, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                {pic
                  ? <img src={pic} alt="profile" style={styles.avatar} />
                  : <span style={styles.avatarFallback}>{user.full_name.charAt(0).toUpperCase()}</span>}
                <span>{user.full_name}</span>
              </Link>
              <button onClick={() => { logout(); nav('/') }} style={styles.logoutBtn}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" style={styles.link}>Login</Link>
              <Link to="/register" style={styles.registerBtn}>Register</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

const styles = {
  header: { background: 'linear-gradient(90deg,#0f766e,#134e4a)', boxShadow: '0 2px 8px rgba(15,118,110,.35)' },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 30px', width: '100%' },
  brand: { fontWeight: 800, fontSize: 24, textDecoration: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 },
  logo: { background: '#fff', color: '#0f766e', borderRadius: 6, width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900 },
  link: { color: '#fff', textDecoration: 'none', fontWeight: 600 },
  logoutBtn: { padding: '6px 14px', cursor: 'pointer', background: '#fff', color: '#134e4a', border: 0, fontWeight: 700 },
  registerBtn: { padding: '6px 14px', background: '#fff', color: '#134e4a', borderRadius: 4, textDecoration: 'none', fontWeight: 700 },
  avatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' },
  avatarFallback: { width: 32, height: 32, borderRadius: '50%', background: '#fff', color: '#0f766e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
}
