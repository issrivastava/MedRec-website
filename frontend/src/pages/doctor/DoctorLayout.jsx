import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { avatarSrc } from '../../api'
import { DoctorProvider, useDoctor } from './DoctorContext'

function Shell() {
  const { user, logout } = useAuth()
  const { patients, appts, emgCount } = useDoctor()
  const [chatUnread, setChatUnread] = useState(0)
  const loc = useLocation()
  const pic = avatarSrc(user)

  useEffect(() => {
    const fetchChat = () => api.get('/api/messages/unread-count').then(({ data }) => setChatUnread(data.unread || 0)).catch(() => {})
    fetchChat()
    const t = setInterval(fetchChat, 30000)
    return () => clearInterval(t)
  }, [])

  const booked = (appts || []).filter((a) => a.status === 'booked').length

  const section = (loc.pathname.split('/')[2] || '')
  // patient detail /doctor/patients/:id counts as patients section
  const active = section === '' ? 'overview' : section

  // Minimal menu: core daily work first, everything else under More.
  const core = [
    { key: 'overview', label: 'Dashboard', icon: '🏠', to: '/doctor' },
    { key: 'patients', label: 'Patients', icon: '🧑‍🤝‍🧑', to: '/doctor/patients', badge: patients.length },
    { key: 'schedule', label: 'Appointments', icon: '📅', to: '/doctor/schedule', badge: booked },
    { key: 'queue', label: 'Live Queue', icon: '📺', to: '/doctor/queue' },
    { key: 'prescriptions', label: 'Prescriptions', icon: '✍️', to: '/doctor/prescriptions' },
    { key: 'chat', label: 'Chat', icon: '💬', to: '/doctor/chat', badge: chatUnread },
    { key: 'emergency', label: 'Emergency', icon: '🚨', to: '/doctor/emergency', badge: emgCount },
    { key: 'profile', label: 'My Profile', icon: '👤', to: '/doctor/profile' },
  ]
  const more = [
    { key: 'practice', label: 'Practice (OPD)', icon: '🏥', to: '/doctor/practice' },
    { key: 'care', label: 'Referrals & Care', icon: '🔁', to: '/doctor/care' },
    { key: 'insights', label: 'Insights & AI', icon: '📊', to: '/doctor/insights' },
    { key: 'engage', label: 'Engage', icon: '📣', to: '/doctor/engage' },
    { key: 'risk', label: 'Risk Board', icon: '🔥', to: '/doctor/risk' },
    { key: 'growth', label: 'Growth', icon: '🌟', to: '/doctor/growth' },
    { key: 'safety', label: 'Safety', icon: '🛡️', to: '/doctor/safety' },
    { key: 'reviews', label: 'Ratings & Reviews', icon: '⭐', to: '/doctor/reviews' },
    { key: 'medicines', label: 'Medicine Guide', icon: '💊', to: '/medicines' },
    { key: 'illnesses', label: 'Illness Guide', icon: '🩺', to: '/illnesses' },
    { key: 'askai', label: 'Ask AI', icon: '🤖', to: '/ask-ai' },
  ]

  const firstName = user?.full_name ? user.full_name.split(' ')[0] : ''

  return (
    <div className="dash dash-doctor">
      <aside className="dash-side">
        <div className="dash-side-title">DOCTOR · PRACTICE</div>
        {core.map((it) => (
          <NavLink
            key={it.key}
            to={it.to}
            end={it.to === '/doctor'}
            className={({ isActive }) =>
              `dash-nav-item${(isActive || active === it.key) ? ' active' : ''}`
            }
          >
            <span className="dash-ico" aria-hidden>{it.icon}</span> {it.label}
            {it.badge > 0 && <span className="badge">{it.badge}</span>}
          </NavLink>
        ))}
        <details className="dash-more">
          <summary className="dash-nav-item"><span className="dash-ico" aria-hidden>⋯</span> More tools</summary>
          {more.map((it) => (
            <NavLink
              key={it.key}
              to={it.to}
              className={({ isActive }) =>
                `dash-nav-item${(isActive || active === it.key) ? ' active' : ''}`
              }
            >
              <span className="dash-ico" aria-hidden>{it.icon}</span> {it.label}
            </NavLink>
          ))}
        </details>
        <div className="dash-side-foot">
          <NavLink to="/doctor/profile" className="dash-nav-item">
            {pic
              ? <img src={pic} alt="profile" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              : <span>👤</span>}
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name}
            </span>
          </NavLink>
          <button onClick={logout} className="dash-nav-item"><span className="dash-ico" aria-hidden>🚪</span> Logout</button>
        </div>
      </aside>
      <div className="dash-main">
        <div className="dash-top">
          <h1>Welcome back{firstName ? `, Dr. ${firstName}` : ''}</h1>
          <p>Appointments, patients and reports — everything else lives under More tools.</p>
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
