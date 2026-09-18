import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/* Slim sticky bottom nav: Home · Medicines · Help · Profile. */
export default function BottomNav() {
  const { user } = useAuth()

  const items = [
    { to: '/', label: 'Home', icon: '🏠', end: true },
    { to: '/medicines', label: 'Medicines', icon: '💊' },
    { to: '/contact', label: 'Help', icon: '💬' },
    user
      ? { to: '/profile', label: 'Profile', icon: '👤' }
      : { to: '/login', label: 'Login', icon: '🔑' },
  ]

  return (
    <nav className="bottom-nav" aria-label="Quick navigation">
      {items.map((it) => (
        <NavLink
          key={it.to + it.label}
          to={it.to}
          end={it.end}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="bottom-nav-icon">{it.icon}</span>
          <span className="bottom-nav-label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
