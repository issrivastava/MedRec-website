import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { avatarSrc } from '../api'

export default function Navbar() {
  const { user, logout } = useAuth()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 auto', justifyContent: 'space-between' }}>
          <Link to="/" style={styles.brand} onClick={() => setOpen(false)}>
            <span style={styles.logo}>+</span> MedRec
          </Link>
          <button className="nav-toggle" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            {open ? '✕' : '☰'}
          </button>
        </div>
        <div className={`nav-links${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
          <Link to="/" style={styles.link}>Home</Link>
          <Link to="/medicines" style={styles.link}>Medicines</Link>
          <Link to="/diseases" style={styles.link}>Diseases</Link>
          <Link to="/find-doctors" style={styles.link}>Find Doctors</Link>
          <Link to="/ask-ai" style={styles.link}>Ask AI</Link>
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
                <span className="pill pill-info" style={{ fontSize: 11 }}>{user.role}</span>
              </Link>
              <button onClick={() => { logout(); nav('/') }} style={styles.logoutBtn}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" style={styles.registerBtn}>Login / Sign up</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

const styles = {
  header: { background: '#ffffff', boxShadow: 'none', borderBottom: '2px solid #1a2e45' },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', width: '100%', flexWrap: 'wrap', gap: 8 },
  brand: { fontWeight: 700, fontSize: 24, textDecoration: 'none', color: '#1a2e45', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Georgia, serif' },
  logo: { background: '#1a2e45', color: '#fff', borderRadius: 4, width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900 },
  link: { color: '#1a2e45', textDecoration: 'none', fontWeight: 600 },
  logoutBtn: { padding: '6px 14px', cursor: 'pointer', background: '#fff', color: '#1a2e45', border: '1px solid #1a2e45', fontWeight: 700 },
  registerBtn: { padding: '6px 14px', background: '#1a2e45', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 700, border: '1px solid #1a2e45' },
  avatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #1a2e45' },
  avatarFallback: { width: 32, height: 32, borderRadius: '50%', background: '#1a2e45', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
}
