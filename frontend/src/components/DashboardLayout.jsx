import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { avatarSrc } from '../api'

/* Full-width app shell: dark sidebar sections on the left, content fills the screen.
   items: [{ key, label, icon, badge?, to? }] — `to` renders a route link, else a tab button. */
export default function DashboardLayout({ title, subtitle, items, active, onSelect, children }) {
  const { user, logout } = useAuth()
  const pic = avatarSrc(user)

  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="dash-side-title">MEDREC MENU</div>
        {items.map((it) =>
          it.to ? (
            <Link key={it.key} to={it.to} className="dash-nav-item">
              <span>{it.icon}</span> {it.label}
            </Link>
          ) : (
            <button key={it.key} onClick={() => onSelect(it.key)}
              className={`dash-nav-item${active === it.key ? ' active' : ''}`}>
              <span>{it.icon}</span> {it.label}
              {it.badge > 0 && <span className="badge">{it.badge}</span>}
            </button>
          )
        )}
        <div className="dash-side-foot">
          <Link to="/profile" className="dash-nav-item">
            {pic
              ? <img src={pic} alt="profile" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              : <span>👤</span>}
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name}
            </span>
          </Link>
          <button onClick={logout} className="dash-nav-item"><span>🚪</span> Logout</button>
        </div>
      </aside>
      <div className="dash-main">
        <div className="dash-top">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}
