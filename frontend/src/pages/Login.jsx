import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthSplit from '../components/AuthSplit'

function friendlyError(e, fallback) {
  if (!e.response && (e.code === 'ERR_NETWORK' || e.message === 'Network Error' || String(e.message || '').toLowerCase().includes('network'))) {
    return 'Backend is not reachable at http://localhost:8000. Start it: cd backend → venv\\Scripts\\activate → uvicorn app.main:app --reload --port 8000. Then open http://localhost:8000/docs to confirm, wait 10s and retry.'
  }
  if (e.code === 'ECONNABORTED' || String(e.message || '').toLowerCase().includes('timeout')) {
    return 'Server took too long — it may be waking up (Ollama cold start). Wait 30s and retry.'
  }
  if (e.code === 'auth/network-request-failed') return 'Cannot reach Google servers — check your internet and retry.'
  if (e.code === 'auth/invalid-credential') {
    return 'Wrong email or password for this Firebase project — or this account was created with a different sign-in method (Google vs email vs local OTP). Try Google, reset the password, or use “OTP / local login instead”.'
  }
  const status = e.response?.status
  const d = e.response?.data?.detail
  const withStatus = (msg) => (status ? `Backend said (${status}): ${msg}` : msg)
  if (!d) return withStatus(e.message || fallback)
  if (typeof d === 'object') return withStatus(d.message || fallback)
  const low = String(d).toLowerCase()
  if (low.includes('too early') || low.includes('before it became valid') || (low.includes('clock') && low.includes('token'))) {
    return 'Server clock was a moment behind Google — wait 3 seconds and retry. (If it keeps happening, restart the backend to pick up the 30s skew tolerance and sync the backend clock.)'
  }
  if (d === 'role_required' || String(d).includes('role_required')) return 'First sign-in with this account — pick patient or doctor below, then Continue.'
  if (status === 503 && low.includes('firebase')) {
    return withStatus('Firebase is not configured on the backend — set FIREBASE_CREDENTIALS_PATH in backend/.env and restart the backend. Until then use “OTP / local login”.')
  }
  if (status === 403 && low.includes('forbidden')) {
    return withStatus('This account has a different role. Doctors must sign in with a doctor account — a patient account cannot open /doctor (and vice versa).')
  }
  return withStatus(String(d))
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Remember last-used role so doctors don't get defaulted to patient.
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem('medrec_last_role') === 'doctor' ? 'doctor' : 'patient' } catch { return 'patient' }
  })
  const [backendUp, setBackendUp] = useState(null) // null=checking, true/false
  const [showLocal, setShowLocal] = useState(false)
  const [mode, setMode] = useState('password') // password | otp
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [linkStep, setLinkStep] = useState('idle') // idle|sent|complete
  const { firebaseConfigured, firebaseLogin, googleLogin, needsRole, completeRole, login, requestOtp, verifyOtpLogin, sendEmailLink, isEmailLink, completeEmailLink, otpSentMessage } = useAuth()
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

  // Backend health badge: distinguishes "backend down" from "wrong credentials".
  useEffect(() => {
    let cancelled = false
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
    if (!base) { setBackendUp(null); return }
    fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })
      .then((r) => { if (!cancelled) setBackendUp(r.ok) })
      .catch(() => { if (!cancelled) setBackendUp(false) })
    return () => { cancelled = true }
  }, [])

  const pickRole = (r) => {
    setRole(r)
    try { localStorage.setItem('medrec_last_role', r) } catch { /* ignore */ }
  }

  const submitFirebase = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      // Pass the selected role so first-time doctors are created as doctors.
      go(await firebaseLogin(email, password, role))
    } catch (e) { setErr(friendlyError(e, 'Firebase login failed')) }
  }

  const submitGoogle = async () => {
    setErr(''); setInfo('')
    try {
      go(await googleLogin(role))
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
    setErr(''); setInfo('')
    try {
      const out = await login(email, password)
      if (out.otp_required) {
        // Step 1 OK (password) -> step 2: same OTP went to email + SMS.
        setMode('otp')
        setOtpSent(out)
        setOtp('')
        setInfo(otpSentMessage(out, email))
      } else if (out.user) {
        go(out.user)
      }
    } catch (e) { setErr(friendlyError(e, 'Login failed')) }
  }

  const sendOtp = async (e) => {
    e?.preventDefault()
    setErr(''); setInfo('')
    try {
      const out = await requestOtp(email, 'login')
      setOtpSent(out)
      setInfo(otpSentMessage(out, email))
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
      <p style={s.backendBadge}>
        {backendUp === null ? 'Checking backend…' : backendUp
          ? '● Backend online'
          : '○ Backend offline — start it: backend → uvicorn app.main:app --reload --port 8000'}
      </p>

      {needsRole ? (
        <div style={s.roleBox}>
          <h3>One last step — who are you?</h3>
          <p>First sign-in with this account needs an account type. <b>Doctors must pick Doctor here</b>, or the account opens as a patient.</p>
          <select value={role} onChange={(e) => pickRole(e.target.value)} style={s.input}>
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
          </select>
          <button onClick={submitRole} style={s.btn}>Continue as {role}</button>
          {err && <p style={{ color: 'red' }}>{err}</p>}
        </div>
      ) : firebaseConfigured && !showLocal ? (
        <>
          <label style={s.roleLabel}>I am a:
            <select value={role} onChange={(e) => pickRole(e.target.value)} style={s.input}>
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
            </select>
          </label>
          <p style={s.roleHint}>
            {role === 'doctor'
              ? 'Doctor login uses the same form. First-time doctors: pick Doctor above before continuing.'
              : 'After login, doctors land on /doctor and patients on /patient.'}
          </p>
          <button onClick={submitGoogle} style={s.googleBtn}>
            <span style={s.gLogo}>G</span> Continue with Google{role === 'doctor' ? ' as Doctor' : ''}
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
              <button type="submit" style={s.btn}>Login as {role}</button>
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
            <button onClick={() => setMode('otp')} style={mode === 'otp' ? s.tabActive : s.tab}>OTP (Email + SMS)</button>
          </div>
          {mode === 'password' ? (
            <form onSubmit={submitLocal} style={s.form}>
              <p style={s.note}>2-step login: password first, then <b>one code</b> is sent to <b>both</b> your email and phone.</p>
              <input placeholder="Email or phone" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
              <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={s.input} />
              {err && <p style={{ color: 'red' }}>{err}</p>}
              {info && <p style={{ color: 'green' }}>{info}</p>}
              <button type="submit" style={s.btn}>Login</button>
            </form>
          ) : !otpSent ? (
            <form onSubmit={sendOtp} style={s.form}>
              <p style={s.note}>One code is sent to <b>both</b> your email and phone (SMS) — enter either to identify yourself.</p>
              <input placeholder="Email or phone" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
              {err && <p style={{ color: 'red' }}>{err}</p>}
              {info && <p style={{ color: 'green' }}>{info}</p>}
              <button type="submit" style={s.btn}>Send login code</button>
            </form>
          ) : (
            <form onSubmit={submitOtp} style={s.form}>
              <p style={s.note}>Same code was sent to your <b>email and phone</b> for <b>{email}</b>.</p>
              {otpSent?.sent_via === 'dev-log' && <p style={s.hint}>No mail/SMS server is set up, so no code was actually delivered. To send for real: set MAIL_* and SMS_WEBHOOK_URL in backend/.env (see .env.example) and restart the backend — or connect Firebase and use the mailed sign-in link. Then press Resend code.</p>}
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
  btn: { padding: 10, background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  googleBtn: { width: '100%', padding: 10, background: '#fff', border: '1px solid #ccc', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  gLogo: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#4285F4', color: '#fff', fontWeight: 800 },
  divider: { textAlign: 'center', margin: '14px 0', color: '#888', borderBottom: '1px solid #eee', lineHeight: '0.1em' },
  linkBtn: { background: 'none', border: 0, color: '#1e3a5f', cursor: 'pointer', padding: 0 },
  note: { background: '#fff8e6', border: '1px solid #f0d48a', padding: 10, borderRadius: 6 },
  hint: { background: '#eef2f7', border: '1px solid #c9d4e2', padding: 10, borderRadius: 6, fontSize: 13 },
  roleBox: { display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #c9d4e2', background: '#eef2f7', padding: 16, borderRadius: 8 },
  tabs: { display: 'flex', gap: 8, marginBottom: 10 },
  tab: { flex: 1, padding: 8, cursor: 'pointer', background: '#f5f5f4', border: '1px solid #e7e5e4' },
  tabActive: { flex: 1, padding: 8, cursor: 'pointer', background: '#1e3a5f', color: '#fff', border: '1px solid #1e3a5f', fontWeight: 700 },
  rowBetween: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  backendBadge: { fontSize: 13, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', margin: '0 0 12px' },
  roleLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 4 },
  roleHint: { fontSize: 13, color: '#64748b', margin: '0 0 10px' },
}
