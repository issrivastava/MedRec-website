import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const EMERGENCY_NUMBER =
  (import.meta.env.VITE_EMERGENCY_NUMBER || '102').toString().trim() || '102'
const WHATSAPP_NUMBER =
  (import.meta.env.VITE_WHATSAPP_NUMBER || '').toString().replace(/\D/g, '')

/* Visible on every page: emergency number + banner (spec: never more than
   one tap away from help). */
export function EmergencyBanner() {
  return (
    <div className="emg-strip" role="alert" aria-label="Emergency help">
      <span>
        🚨 <b>Emergency?</b> Call <a href={`tel:${EMERGENCY_NUMBER}`}>{EMERGENCY_NUMBER}</a>
        <span className="emg-sub"> (ambulance) — for anything life-threatening, call now, then inform your doctor.</span>
      </span>
      <Link to="/contact" className="emg-link">Other help →</Link>
    </div>
  )
}

/* Sticky mobile Book button + optional WhatsApp float (both link out;
   WhatsApp hidden unless VITE_WHATSAPP_NUMBER is set). */
export function SiteFloaters() {
  const { user } = useAuth()
  const bookTo = !user ? '/login' : user.role === 'doctor' ? '/doctor' : '/patient'
  return (
    <>
      <Link to={bookTo} className="sticky-book" aria-label="Book appointment">
        📅 Book Appointment
      </Link>
      {WHATSAPP_NUMBER && (
        <a
          className="wa-float"
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi! I have a question about MedRec.')}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with us on WhatsApp"
          title="Chat with us on WhatsApp"
        >
          <span aria-hidden>💬</span>
        </a>
      )}
    </>
  )
}
