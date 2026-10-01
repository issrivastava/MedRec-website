import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

// Automatic session timeout: logs out after inactivity.
// Timeout minutes from VITE_SESSION_TIMEOUT_MIN (default 30). Activity =
// mouse, keyboard, touch, scroll. Timer resets on activity.
export default function SessionTimeout() {
  const { user, logout } = useAuth()
  useEffect(() => {
    if (!user) return
    const mins = parseFloat(import.meta.env.VITE_SESSION_TIMEOUT_MIN || '30')
    if (!mins || mins <= 0) return
    let t = null
    const reset = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        alert('Session timed out due to inactivity — please log in again.')
        logout()
        window.location.href = '/login'
      }, mins * 60 * 1000)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      if (t) clearTimeout(t)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [user])
  return null
}
