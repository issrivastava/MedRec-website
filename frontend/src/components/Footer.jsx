import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Footer() {
  const { user } = useAuth()
  const year = new Date().getFullYear()
  const dashboard = user ? (user.role === 'doctor' ? '/doctor' : user.role === 'admin' ? '/admin' : '/patient') : '/login'

  return (
    <footer className="footer-min">
      <div className="footer-inner">
        <div>
          <div className="footer-brand"><span className="brand-mark teal" style={{ width: 28, height: 28, fontSize: 17 }}>+</span> MedRec</div>
          <p className="footer-tag">Your medical records, organized — for patients and doctors.</p>
        </div>
        <div className="footer-cols">
          <div className="footer-col">
            <b>Product</b>
            <Link to="/">Home</Link>
            <Link to="/medicines">Medicines</Link>
            <Link to="/illnesses">Illnesses</Link>
            <Link to="/find-doctors">Find Doctors</Link>
            <Link to="/ask-ai">Ask AI</Link>
            {user ? <Link to={dashboard}>My Dashboard</Link> : <Link to="/login">Get started</Link>}
          </div>
          <div className="footer-col">
            <b>Support</b>
            <Link to="/contact">Contact Us</Link>
            <Link to="/policy">Company Policy</Link>
            <Link to="/forgot-password">Forgot Password</Link>
          </div>
          {user && (
            <div className="footer-col">
              <b>My Account</b>
              <Link to="/profile">My Profile</Link>
              <Link to="/notifications">Notifications</Link>
            </div>
          )}
        </div>
      </div>
      <div className="footer-bottom">© {year} MedRec · AI summaries are informational only — always consult your doctor.</div>
    </footer>
  )
}
