import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../i18n.jsx'
import api, { avatarSrc } from '../api'
import { ThemeToggle } from './HealthUX'

const DISCOVER_PATHS = ['/medicines', '/illnesses', '/diseases', '/find-doctors', '/ask-ai']
const RECORDS_PATHS = ['/upload', '/billing', '/directory', '/pharmacy']

export default function Navbar() {
  const { user, logout } = useAuth()
  const { t } = useLang()
  const [unread, setUnread] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)
  const [open, setOpen] = useState(false)
  // Single open menu (records | discover | user) — only one dropdown at a time.
  const [menu, setMenu] = useState(null)
  const staff = user && ['doctor', 'receptionist', 'nurse', 'admin'].includes(user.role)
  const canChat = user && (user.role === 'patient' || user.role === 'doctor')
  const nav = useNavigate()
  const loc = useLocation()
  const discoverActive = DISCOVER_PATHS.some(
    (p) => loc.pathname === p || loc.pathname.startsWith(p + '/'))
  const recordsActive = RECORDS_PATHS.some(
    (p) => loc.pathname === p || loc.pathname.startsWith(p + '/'))
  const dashboard = user ? (user.role === 'doctor' ? '/doctor' : user.role === 'admin' ? '/admin' : (user.role === 'receptionist' || user.role === 'nurse') ? '/directory' : '/patient') : '/login'
  const chatTo = user ? (user.role === 'doctor' ? '/doctor/chat' : '/patient#chat') : '/login'
  const pic = avatarSrc(user)

  useEffect(() => {
    if (!user) return
    let ws = null
    let pollT = null
    let pollChatT = null
    let closed = false
    const fetchCount = () => api.get('/api/notifications/unread-count').then(({ data }) => setUnread(data.unread)).catch(() => {})
    const fetchChat = () => {
      if (user.role === 'patient' || user.role === 'doctor') {
        api.get('/api/messages/unread-count').then(({ data }) => setChatUnread(data.unread || 0)).catch(() => {})
      }
    }
    const startPolling = () => {
      if (pollT || closed) return
      pollT = setInterval(fetchCount, 30000)
      pollChatT = setInterval(fetchChat, 30000)
    }
    const stopPolling = () => {
      if (pollT) clearInterval(pollT)
      if (pollChatT) clearInterval(pollChatT)
      pollT = null
      pollChatT = null
    }
    fetchCount()
    fetchChat()
    // Notifications page nudges the bell to refresh instantly after
    // mark-all-read / clear-all (otherwise the stale badge makes it look
    // like the action didn't work until the next 30s poll).
    const onNotifChanged = () => fetchCount()
    window.addEventListener('medrec:notifications-changed', onNotifChanged)
    // Live badges via WS (instant on notify), HTTP polling as fallback.
    try {
      const token = localStorage.getItem('medrec_token')
      if (!token) {
        startPolling()
      } else {
        const base = import.meta.env.VITE_API_URL || ''
        let wsUrl = ''
        if (base.startsWith('http')) {
          wsUrl = base.replace(/^http/, 'ws') + '/api/ws/badges?token=' + encodeURIComponent(token)
        } else {
          const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
          wsUrl = proto + window.location.host + '/api/ws/badges?token=' + encodeURIComponent(token)
        }
        ws = new WebSocket(wsUrl)
        let opened = false
        ws.onopen = () => { opened = true }
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data)
            if (typeof msg.notifications_unread === 'number') setUnread(msg.notifications_unread)
            if (typeof msg.messages_unread === 'number') setChatUnread(msg.messages_unread)
          } catch { /* heartbeat — ignore */ }
        }
        ws.onerror = () => {
          try { ws.close() } catch { /* ignore */ }
        }
        ws.onclose = () => {
          ws = null
          if (!closed) {
            // WS unavailable (dev proxy without ws:true, prod wss, etc.) → poll.
            fetchCount(); fetchChat(); startPolling()
          }
        }
        // If WS doesn't open in 3s (no route/proxy), fall back to polling
        // but keep the socket — whichever connects first wins.
        setTimeout(() => { if (!opened && !closed && !pollT) { fetchCount(); fetchChat(); startPolling() } }, 3000)
      }
    } catch {
      startPolling()
    }
    return () => {
      closed = true
      stopPolling()
      window.removeEventListener('medrec:notifications-changed', onNotifChanged)
      try { if (ws) ws.close() } catch { /* ignore */ }
    }
  }, [user])

  const linkCls = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`

  // Dropdowns: close on navigation, Escape, or outside click.
  useEffect(() => { setMenu(null) }, [loc.pathname])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(null); setOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  return (
    <header className="topbar">
      <nav className="topbar-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark teal">+</span> MedRec
        </Link>
        <span style={{ display: 'inline-flex', marginRight: 4 }}><ThemeToggle /></span>
        <button className="nav-toggle" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
          {open ? '✕' : '☰'}
        </button>
        <div className={`nav-links${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
          <NavLink to="/" end className={linkCls}>{t('nav.home')}</NavLink>
          {user ? (
            <>
              <NavLink to={dashboard} className={linkCls}>{t('nav.dashboard')}</NavLink>
              <div className="nav-drop">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={menu === 'records'}
                  onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === 'records' ? null : 'records')) }}
                  className={`nav-link nav-drop-btn${recordsActive ? ' active' : ''}`}
                >
                  {t('nav.records')} {menu === 'records' ? '▴' : '▾'}
                </button>
                {menu === 'records' && (
                  <div className="nav-drop-menu" role="menu" aria-label="Records">
                    {user.role === 'patient' && <NavLink to="/upload" className={linkCls} role="menuitem">⬆️ {t('nav.upload')}</NavLink>}
                    <NavLink to="/billing" className={linkCls} role="menuitem">🧾 {t('nav.billing')}</NavLink>
                    {staff && <NavLink to="/directory" className={linkCls} role="menuitem">📁 {t('nav.directory')}</NavLink>}
                    {staff && <NavLink to="/pharmacy" className={linkCls} role="menuitem">💊 {t('nav.pharmacy')}</NavLink>}
                  </div>
                )}
              </div>
              <div className="nav-drop">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={menu === 'discover'}
                  onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === 'discover' ? null : 'discover')) }}
                  className={`nav-link nav-drop-btn${discoverActive ? ' active' : ''}`}
                >
                  {t('nav.discover')} {menu === 'discover' ? '▴' : '▾'}
                </button>
                {menu === 'discover' && (
                  <div className="nav-drop-menu" role="menu" aria-label="Discover">
                    <NavLink to="/medicines" className={linkCls} role="menuitem">💊 {t('nav.medicines')}</NavLink>
                    <NavLink to="/illnesses" className={linkCls} role="menuitem">🩺 {t('nav.illnesses')}</NavLink>
                    <NavLink to="/find-doctors" className={linkCls} role="menuitem">🏥 {t('nav.findDoctors')}</NavLink>
                    <NavLink to="/ask-ai" className={linkCls} role="menuitem">🤖 {t('nav.askAi')}</NavLink>
                  </div>
                )}
              </div>
              <NavLink to="/notifications" className={linkCls} aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}>
                🔔{unread > 0 && <span style={s.badge}>{unread > 9 ? '9+' : unread}</span>}
              </NavLink>
              <div className="nav-drop">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={menu === 'user'}
                  aria-label="Account menu"
                  onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === 'user' ? null : 'user')) }}
                  className="nav-user"
                  style={{ cursor: 'pointer', border: menu === 'user' ? '1px solid #d3dbe4' : undefined }}
                >
                  {pic
                    ? <img src={pic} alt="profile" className="nav-avatar" />
                    : <span className="nav-avatar-fallback">{user.full_name.charAt(0).toUpperCase()}</span>}
                  <span aria-hidden="true" style={{ fontSize: 11 }}>{menu === 'user' ? '▴' : '▾'}</span>
                </button>
                {menu === 'user' && (
                  <div className="nav-drop-menu" role="menu" aria-label="Account" style={{ right: 0, left: 'auto' }}>
                    <div style={s.menuHead}>{user.full_name}</div>
                    <NavLink to="/profile" className={linkCls} role="menuitem">👤 {t('nav.profile')}</NavLink>
                    {canChat && (
                      <NavLink to={chatTo} className={linkCls} role="menuitem">💬 {t('nav.chat')}{chatUnread > 0 ? ` (${chatUnread})` : ''}</NavLink>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { logout(); nav('/') }}
                      className="nav-link"
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}
                    >
                      ⎋ {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <NavLink to="/contact" className={linkCls}>{t('nav.contact')}</NavLink>
              <Link to="/login" className="nav-cta">{t('nav.getStarted')}</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

const s = {
  badge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
    background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700,
    marginLeft: 4, verticalAlign: '1px',
  },
  menuHead: {
    padding: '8px 13px 6px', fontSize: 13, fontWeight: 700,
    borderBottom: '1px solid var(--line)', marginBottom: 4,
    maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
}
