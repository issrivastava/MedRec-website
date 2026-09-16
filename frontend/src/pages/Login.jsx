import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthSplit from '../components/AuthSplit'

function friendlyError(e, fallback) {
  const d = e.response?.data?.detail
  if (!d) return e.message || fallback
  if (typeof d === 'object') return d.message || fallback
  if (d === 'role_required' || String(d).includes('role_required')) return 'Please pick patient or doctor below.'
  return String(d)
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('patient')
  const [showLocal, setShowLocal] = useState(false)
  const [err, setErr] = useState('')
  const { firebaseConfigured, firebaseLogin, googleLogin, needsRole, completeRole, login } = useAuth()
  const nav = useNavigate()
  const go = (u) => nav(u.role === 'doctor' ? '/doctor' : '/patient')

  const submitFirebase = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      go(await firebaseLogin(email, password))
    } catch (e) { setErr(friendlyError(e, 'Firebase login failed')) }
  }

  const submitGoogle = async () => {
    setErr('')
    try {
      go(await googleLogin())
    } catch (e) {
      if (String(e.message || '').includes('popup')) setErr('Google popup was blocked — allow popups and retry.')
      else setErr(friendlyError(e, 'Google login failed'))
    }
  }

  const submitRole = async () => {
    setErr('')
    try {
      go(await completeRole(role))
    } catch (e) { setErr(friendlyError(e, 'Could not finish sign-in')) }
  }

  const submitLocal = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      go(await login(email, password))
    } catch (e) { setErr(friendlyError(e, 'Login failed')) }
  }

  return (
    <AuthSplit points={[
      'Scan & keep every report and prescription in one place',
      'Plain-language AI summaries in 10 languages',
      'Your doctor reviews your history in one click',
    ]}>
      <h2 style={{ marginTop: 0 }}>Login to MedRec</h2>

      {needsRole ? (
        <div style={s.roleBox}>
          <h3>One last step — who are you?</h3>
          <p>First Firebase sign-in needs an account type.</p>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={s.input}>
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
          </select>
          <button onClick={submitRole} style={s.btn}>Continue</button>
          {err && <p style={{ color: 'red' }}>{err}</p>}
        </div>
      ) : firebaseConfigured && !showLocal ? (
        <>
          <button onClick={submitGoogle} style={s.googleBtn}>Continue with Google</button>
          <div style={s.divider}><span>or with email</span></div>
          <form onSubmit={submitFirebase} style={s.form}>
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
            <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={s.input} />
            {err && <p style={{ color: 'red' }}>{err}</p>}
            <button type="submit" style={s.btn}>Login</button>
          </form>
          <p><button onClick={() => setShowLocal(true)} style={s.linkBtn}>Use local dev login instead</button></p>
        </>
      ) : (
        <>
          {!firebaseConfigured && (
            <p style={s.note}>Firebase keys not set — using local login. Add them to <code>.env</code> to enable Google login (see README).</p>
          )}
          <form onSubmit={submitLocal} style={s.form}>
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
            <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={s.input} />
            {err && <p style={{ color: 'red' }}>{err}</p>}
            <button type="submit" style={s.btn}>Login</button>
          </form>
          {firebaseConfigured && <p><button onClick={() => setShowLocal(false)} style={s.linkBtn}>Back to Firebase login</button></p>}
        </>
      )}
      <p>No account? <Link to="/register">Register</Link></p>
    </AuthSplit>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { padding: 10, fontSize: 15 },
  btn: { padding: 10, background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer' },
  googleBtn: { width: '100%', padding: 10, background: '#fff', border: '1px solid #ccc', cursor: 'pointer', fontSize: 15, fontWeight: 600 },
  divider: { textAlign: 'center', margin: '14px 0', color: '#888', borderBottom: '1px solid #eee', lineHeight: '0.1em' },
  linkBtn: { background: 'none', border: 0, color: '#0f766e', cursor: 'pointer', padding: 0 },
  note: { background: '#fff8e6', border: '1px solid #f0d48a', padding: 10, borderRadius: 6 },
  roleBox: { display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #99f6e4', background: '#f0fdfa', padding: 16, borderRadius: 8 },
}
