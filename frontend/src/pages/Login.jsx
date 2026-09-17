import { useEffect, useState } from 'react'
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
  const [mode, setMode] = useState('password') // password | otp
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [linkStep, setLinkStep] = useState('idle') // idle|sent|complete
  const { firebaseConfigured, firebaseLogin, googleLogin, needsRole, completeRole, login, requestOtp, verifyOtpLogin, sendEmailLink, isEmailLink, completeEmailLink } = useAuth()
  const nav = useNavigate()
  const go = (u) => nav(u.role === 'doctor' ? '/doctor' : u.role === 'admin' ? '/admin' : '/patient')

  // Returning from a Firebase email-link? Show the one-tap finish form.
  useEffect(() => {
    try {
      if (firebaseConfigured && isEmailLink()) {
        setEmail(localStorage.getItem('medrec_email_for_link') || '')
        setLinkStep('complete')
        setInfo('You clicked the sign-in link — confirm your email to finish.')
      }
    } catch { /* ignore */ }
  }, [])

  const submitFirebase = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      go(await firebaseLogin(email, password))
    } catch (e) { setErr(friendlyError(e, 'Firebase login failed')) }
  }

  const submitGoogle = async () => {
    setErr(''); setInfo('')
    try {
      go(await googleLogin())
    } catch (e) {
      const msg = String(e.code || e.message || '')
      if (msg.includes('popup-blocked') || msg.includes('popup')) setErr('Google popup was blocked — allow popups and retry.')
      else if (msg.includes('cancelled-request') || msg.includes('popup-closed')) setErr('Google sign-in was closed — try again.')
      else if (msg.includes('unauthorized-domain')) setErr('This domain is not authorized in Firebase → Authentication → Settings → Authorized domains.')
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

  const sendOtp = async (e) => {
    e?.preventDefault()
    setErr(''); setInfo('')
    try {
      const out = await requestOtp(email, 'login')
      setOtpSent(out)
      setInfo(out.dev_code
        ? `Dev mode (no SMTP server): your code is ${out.dev_code}`
        : `Code sent to ${email} — check your inbox (valid ${out.expires_in_minutes} min).`)
    } catch (e) { setErr(friendlyError(e, 'Could not send code')) }
  }

  const submitOtp = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      go(await verifyOtpLogin(email, otp))
    } catch (e) { setErr(friendlyError(e, 'Invalid or expired code')) }
  }

  const sendLink = async (e) => {
    e?.preventDefault()
    setErr(''); setInfo('')
    try {
      await sendEmailLink(email)
      setLinkStep('sent')
      setInfo(`Sign-in link mailed to ${email} by Firebase — open it on this device to finish logging in.`)
    } catch (e) { setErr(friendlyError(e, 'Could not send sign-in link')) }
  }

  const finishLink = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      go(await completeEmailLink(email))
    } catch (e) { setErr(friendlyError(e, 'This link is invalid or expired — request a fresh one')) }
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
          <button onClick={submitGoogle} style={s.googleBtn}>
            <span style={s.gLogo}>G</span> Continue with Google
          </button>
          <div style={s.divider}><span>or with email</span></div>
          {linkStep === 'complete' ? (
            <form onSubmit={finishLink} style={s.form}>
              <p style={s.note}>Confirm the email you requested the link for:</p>
              <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
              {err && <p style={{ color: 'red' }}>{err}</p>}
              {info && <p style={{ color: 'green' }}>{info}</p>}
              <button type="submit" style={s.btn}>Finish sign-in</button>
            </form>
          ) : linkStep === 'sent' ? (
            <div style={s.form}>
              <p style={s.note}>Sign-in link sent to <b>{email}</b> — check your inbox (and spam). It expires in 1 hour and works on this device.</p>
              {err && <p style={{ color: 'red' }}>{err}</p>}
              {info && <p style={{ color: 'green' }}>{info}</p>}
              <button onClick={sendLink} style={s.btn}>Resend link</button>
              <button onClick={() => setLinkStep('idle')} style={s.linkBtn}>Back to password login</button>
            </div>
          ) : (
            <form onSubmit={submitFirebase} style={s.form}>
              <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
              <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={s.input} />
              {err && <p style={{ color: 'red' }}>{err}</p>}
              {info && <p style={{ color: 'green' }}>{info}</p>}
              <button type="submit" style={s.btn}>Login</button>
              <button type="button" onClick={sendLink} style={s.linkBtn}>Email me a password-free sign-in link instead</button>
            </form>
          )}
          <p style={s.rowBetween}>
            <Link to="/forgot-password">Forgot password?</Link>
            <button onClick={() => setShowLocal(true)} style={s.linkBtn}>Use OTP / local login instead</button>
          </p>
        </>
      ) : (
        <>
          {!firebaseConfigured && (
            <div style={s.note}>
              <b>Google login is hidden because Firebase isn't connected yet.</b>
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Create a project at <b>console.firebase.google.com</b> → enable <b>Email/Password</b> + <b>Google</b> under Authentication.</li>
                <li>Copy the web-app keys into <code>frontend/.env</code> (<code>VITE_FIREBASE_*</code>).</li>
                <li>Save the service-account JSON as <code>backend/firebase-service-account.json</code>.</li>
                <li><b>Restart</b> both backend and <code>npm run dev</code> (Vite reads <code>.env</code> at startup).</li>
              </ol>
            </div>
          )}
          <div style={s.tabs}>
            <button onClick={() => setMode('password')} style={mode === 'password' ? s.tabActive : s.tab}>Password</button>
            <button onClick={() => setMode('otp')} style={mode === 'otp' ? s.tabActive : s.tab}>Email OTP</button>
          </div>
          {mode === 'password' ? (
            <form onSubmit={submitLocal} style={s.form}>
              <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
              <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={s.input} />
              {err && <p style={{ color: 'red' }}>{err}</p>}
              <button type="submit" style={s.btn}>Login</button>
            </form>
          ) : !otpSent ? (
            <form onSubmit={sendOtp} style={s.form}>
              <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
              {err && <p style={{ color: 'red' }}>{err}</p>}
              {info && <p style={{ color: 'green' }}>{info}</p>}
              <button type="submit" style={s.btn}>Send login code</button>
            </form>
          ) : (
            <form onSubmit={submitOtp} style={s.form}>
              <p style={s.note}>Code sent to <b>{email}</b>. {otpSent.dev_code ? `Dev code: ${otpSent.dev_code}` : ''}</p>
              {otpSent.dev_code && <p style={s.hint}>No mail server is set up, so the code shows here. To mail codes instead: set MAIL_* in backend/.env (Gmail app password, see .env.example) and restart the backend — or connect Firebase and use the mailed sign-in link.</p>}
              <input placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} required style={s.input} inputMode="numeric" maxLength={6} />
              {err && <p style={{ color: 'red' }}>{err}</p>}
              {info && <p style={{ color: 'green' }}>{info}</p>}
              <button type="submit" style={s.btn}>Verify & login</button>
              <button type="button" onClick={sendOtp} style={s.linkBtn}>Resend code</button>
            </form>
          )}
          <p style={s.rowBetween}>
            <Link to="/forgot-password">Forgot password?</Link>
            {firebaseConfigured && <button onClick={() => setShowLocal(false)} style={s.linkBtn}>Back to Google login</button>}
          </p>
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
  googleBtn: { width: '100%', padding: 10, background: '#fff', border: '1px solid #ccc', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  gLogo: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#4285F4', color: '#fff', fontWeight: 800 },
  divider: { textAlign: 'center', margin: '14px 0', color: '#888', borderBottom: '1px solid #eee', lineHeight: '0.1em' },
  linkBtn: { background: 'none', border: 0, color: '#0f766e', cursor: 'pointer', padding: 0 },
  note: { background: '#fff8e6', border: '1px solid #f0d48a', padding: 10, borderRadius: 6 },
  hint: { background: '#f0fdfa', border: '1px solid #99f6e4', padding: 10, borderRadius: 6, fontSize: 13 },
  roleBox: { display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #99f6e4', background: '#f0fdfa', padding: 16, borderRadius: 8 },
  tabs: { display: 'flex', gap: 8, marginBottom: 10 },
  tab: { flex: 1, padding: 8, cursor: 'pointer', background: '#f5f5f4', border: '1px solid #e7e5e4' },
  tabActive: { flex: 1, padding: 8, cursor: 'pointer', background: '#0f766e', color: '#fff', border: '1px solid #0f766e', fontWeight: 700 },
  rowBetween: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
}
