import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { avatarSrc } from '../api'

/* Full-width app shell: dark sidebar sections on the left, content fills the screen.
   items: [{ key, label, icon, badge?, to?, section? }] — `to` renders a route link,
   else a tab button. `section` groups items under a small heading (optional,
   backwards-compatible: items without it render flat as before).
   sideTitle/tone let patient vs doctor shells look unmistakably different. */
export default function DashboardLayout({ title, subtitle, meta, items, active, onSelect, children, sideTitle = 'MEDREC MENU', tone = '' }) {
  const { user, logout } = useAuth()
  const pic = avatarSrc(user)
  let lastSection = null

  const renderItem = (it) => {
    const inner = (
      <>
        <span className="dash-ico" aria-hidden>{it.icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
        {it.badge > 0 && <span className="badge">{it.badge}</span>}
      </>
    )
    if (it.to) {
      return <Link key={it.key} to={it.to} className="dash-nav-item">{inner}</Link>
    }
    return (
      <button key={it.key} onClick={() => onSelect(it.key)}
        className={`dash-nav-item${active === it.key ? ' active' : ''}`}>
        {inner}
      </button>
    )
  }

  return (
    <div className={`dash${tone ? ` ${tone}` : ''}`}>
      <aside className="dash-side">
        <div className="dash-side-title">{sideTitle}</div>
        {items.map((it) => {
          const showSection = it.section && it.section !== lastSection
          lastSection = it.section || lastSection
          return (
            <div key={it.key}>
              {showSection && <div className="dash-side-section">{it.section}</div>}
              {renderItem(it)}
            </div>
          )
        })}
        <div className="dash-side-foot">
          <Link to="/profile" className="dash-nav-item dash-user">
            {pic
              ? <img src={pic} alt="profile" />
              : <span className="dash-avatar-fallback">👤</span>}
            <span className="dash-user-meta">
              <div className="dash-user-name">{user?.full_name}</div>
              <div className="dash-user-role">{user?.role || 'patient'}</div>
            </span>
          </Link>
          <button onClick={logout} className="dash-nav-item"><span className="dash-ico" aria-hidden>🚪</span> Logout</button>
        </div>
      </aside>
      <div className="dash-main">
        <div className="dash-top">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {meta && <div className="dash-top-meta">{meta}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}
