import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { avatarSrc } from '../../api'
import { DoctorProvider, useDoctor } from './DoctorContext'

function Shell() {
  const { user, logout } = useAuth()
  const { patients, appts, emgCount } = useDoctor()
  const loc = useLocation()
  const pic = avatarSrc(user)

  const booked = (appts || []).filter((a) => a.status === 'booked').length

  const section = (loc.pathname.split('/')[2] || '')
  // patient detail /doctor/patients/:id counts as patients section
  const active = section === '' ? 'overview' : section

  const items = [
    { key: 'overview', label: 'Overview', icon: '🏠', to: '/doctor' },
    { key: 'patients', label: 'Patients', icon: '🧑‍🤝‍🧑', to: '/doctor/patients', badge: patients.length },
    { key: 'schedule', label: 'Schedule', icon: '📅', to: '/doctor/schedule', badge: booked },
    { key: 'prescriptions', label: 'Prescriptions', icon: '✍️', to: '/doctor/prescriptions' },
    { key: 'emergency', label: 'Emergency', icon: '🚨', to: '/doctor/emergency', badge: emgCount },
    { key: 'risk', label: 'Risk Board', icon: '🔥', to: '/doctor/risk' },
    { key: 'chat', label: 'Chat', icon: '💬', to: '/doctor/chat' },
    { key: 'care', label: 'Referrals & Care', icon: '🔁', to: '/doctor/care' },
    { key: 'reviews', label: 'Ratings & Reviews', icon: '⭐', to: '/doctor/reviews' },
    { key: 'profile', label: 'My Profile', icon: '👤', to: '/doctor/profile' },
    { key: 'medicines', label: 'Medicine Guide', icon: '💊', to: '/medicines' },
    { key: 'diseases', label: 'Disease Guide', icon: '🩺', to: '/diseases' },
    { key: 'askai', label: 'Ask AI', icon: '🤖', to: '/ask-ai' },
  ]

  const firstName = user?.full_name ? user.full_name.split(' ')[0] : ''

  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="dash-side-title">DOCTOR MENU</div>
        {items.map((it) => (
          <NavLink
            key={it.key}
            to={it.to}
            end={it.to === '/doctor'}
            className={({ isActive }) =>
              `dash-nav-item${(isActive || active === it.key) ? ' active' : ''}`
            }
          >
            <span>{it.icon}</span> {it.label}
            {it.badge > 0 && <span className="badge">{it.badge}</span>}
          </NavLink>
        ))}
        <div className="dash-side-foot">
          <NavLink to="/doctor/profile" className="dash-nav-item">
            {pic
              ? <img src={pic} alt="profile" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              : <span>👤</span>}
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name}
            </span>
          </NavLink>
          <button onClick={logout} className="dash-nav-item"><span>🚪</span> Logout</button>
        </div>
      </aside>
      <div className="dash-main">
        <div className="dash-top">
          <h1>🩺 Welcome back{firstName ? `, Dr. ${firstName}` : ''}</h1>
          <p>Your practice at a glance — patients, schedule, prescriptions and lab alerts.</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}

export default function DoctorLayout() {
  return (
    <DoctorProvider>
      <Shell />
    </DoctorProvider>
  )
}
