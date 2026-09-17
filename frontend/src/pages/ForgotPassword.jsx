import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthSplit from '../components/AuthSplit'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [step, setStep] = useState(1)
  const [sent, setSent] = useState(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const { firebaseConfigured, firebasePasswordReset, requestOtp, resetPasswordWithOtp } = useAuth()
  const nav = useNavigate()

  const friendly = (e, fb) => e.response?.data?.detail || e.message || fb

  const sendFirebase = async () => {
    setErr(''); setInfo('')
    try {
      await firebasePasswordReset(email)
      setInfo(`Password reset email sent to ${email} via Google/Firebase — check your inbox.`)
    } catch (e) { setErr(friendly(e, 'Could not send Firebase reset email')) }
  }

  const sendOtp = async (e) => {
    e?.preventDefault()
    setErr(''); setInfo('')
    try {
      const out = await requestOtp(email, 'reset')
      setSent(out)
      setStep(2)
      setInfo(out.dev_code
        ? `Dev mode (no SMTP server): your reset code is ${out.dev_code}`
        : `Reset code sent to ${email} — valid ${out.expires_in_minutes} min.`)
    } catch (e) { setErr(friendly(e, 'Could not send reset code')) }
  }

  const doReset = async (e) => {
    e.preventDefault()
    setErr('')
    if (pw1 !== pw2) return setErr('Passwords do not match')
    if (pw1.length < 6) return setErr('Password must be at least 6 characters')
    try {
      await resetPasswordWithOtp(email, code, pw1)
      setInfo('Password updated — redirecting to login…')
      setTimeout(() => nav('/login'), 1200)
    } catch (e) { setErr(friendly(e, 'Reset failed — check the code')) }
  }

  return (
    <AuthSplit points={[
      'Reset with a 6-digit email code — no inbox rules needed',
      'Google/Firebase accounts can also use the Firebase reset email',
      'Your records stay untouched — only the password changes',
    ]}>
      <h2 style={{ marginTop: 0 }}>Forgot password</h2>

      {step === 1 && (
        <form onSubmit={sendOtp} style={s.form}>
          <input placeholder="Account email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} />
          {err && <p style={{ color: 'red' }}>{err}</p>}
          {info && <p style={{ color: 'green' }}>{info}</p>}
          <button type="submit" style={s.btn}>Send reset code</button>
          {firebaseConfigured && (
            <button type="button" onClick={sendFirebase} style={s.ghostBtn}>Or send Firebase reset email</button>
          )}
        </form>
      )}

      {step === 2 && (
        <form onSubmit={doReset} style={s.form}>
          <p style={s.note}>Code sent to <b>{email}</b>. {sent?.dev_code ? `Dev code: ${sent.dev_code}` : ''}</p>
          {sent?.dev_code && <p style={s.hint}>No mail server is set up, so the code shows here. To mail codes instead: set MAIL_* in backend/.env (Gmail app password, see .env.example) and restart the backend — or connect Firebase and use the Firebase reset email option.</p>}
          <input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required style={s.input} inputMode="numeric" maxLength={6} />          <input placeholder="New password (min 6)" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required style={s.input} />
          <input placeholder="Confirm new password" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required style={s.input} />
          {err && <p style={{ color: 'red' }}>{err}</p>}
          {info && <p style={{ color: 'green' }}>{info}</p>}
          <button type="submit" style={s.btn}>Set new password</button>
          <button type="button" onClick={sendOtp} style={s.linkBtn}>Resend code</button>
        </form>
      )}

      <p><Link to="/login">Back to login</Link></p>
    </AuthSplit>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { padding: 10, fontSize: 15 },
  btn: { padding: 10, background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer' },
  ghostBtn: { padding: 10, background: '#fff', border: '1px solid #0f766e', color: '#0f766e', cursor: 'pointer' },
  linkBtn: { background: 'none', border: 0, color: '#0f766e', cursor: 'pointer', padding: 0 },
  note: { background: '#fff8e6', border: '1px solid #f0d48a', padding: 10, borderRadius: 6 },
  hint: { background: '#f0fdfa', border: '1px solid #99f6e4', padding: 10, borderRadius: 6, fontSize: 13 },
}
