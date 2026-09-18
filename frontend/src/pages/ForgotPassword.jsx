import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthSplit from '../components/AuthSplit'

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [step, setStep] = useState(1)
  const [sent, setSent] = useState(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const { firebaseConfigured, firebasePasswordReset, requestOtp, resetPasswordWithOtp, otpSentMessage } = useAuth()
  const nav = useNavigate()

  const friendly = (e, fb) => e.response?.data?.detail || e.message || fb
  const isEmail = identifier.includes('@')

  const sendFirebase = async () => {
    setErr(''); setInfo('')
    try {
      await firebasePasswordReset(identifier)
      setInfo(`Password reset email sent to ${identifier} via Google/Firebase — check your inbox.`)
    } catch (e) { setErr(friendly(e, 'Could not send Firebase reset email')) }
  }

  const sendOtp = async (e) => {
    e?.preventDefault()
    setErr(''); setInfo('')
    try {
      const out = await requestOtp(identifier, 'reset')
      setSent(out)
      setStep(2)
      setInfo(otpSentMessage(out, identifier))
    } catch (e) { setErr(friendly(e, 'Could not send reset code')) }
  }

  const doReset = async (e) => {
    e.preventDefault()
    setErr('')
    if (pw1 !== pw2) return setErr('Passwords do not match')
    if (pw1.length < 6) return setErr('Password must be at least 6 characters')
    try {
      await resetPasswordWithOtp(identifier, code, pw1)
      setInfo('Password updated — redirecting to login…')
      setTimeout(() => nav('/login'), 1200)
    } catch (e) { setErr(friendly(e, 'Reset failed — check the code')) }
  }

  return (
    <AuthSplit points={[
      'Reset with one 6-digit code sent to both email and SMS',
      'Google/Firebase accounts can also use the Firebase reset email',
      'Your records stay untouched — only the password changes',
    ]}>
      <h2 style={{ marginTop: 0 }}>Forgot password</h2>

      {step === 1 && (
        <form onSubmit={sendOtp} style={s.form}>
          <input placeholder="Account email or phone" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required style={s.input} />
          {err && <p style={{ color: 'red' }}>{err}</p>}
          {info && <p style={{ color: 'green' }}>{info}</p>}
          <button type="submit" style={s.btn}>Send reset code</button>
          {firebaseConfigured && isEmail && (
            <button type="button" onClick={sendFirebase} style={s.ghostBtn}>Or send Firebase reset email</button>
          )}
        </form>
      )}

      {step === 2 && (
        <form onSubmit={doReset} style={s.form}>
          <p style={s.note}>Same code sent to your <b>email and phone</b> for <b>{identifier}</b>. {sent?.dev_code ? `Dev code: ${sent.dev_code}` : ''}</p>
          {sent?.dev_code && <p style={s.hint}>No mail/SMS server is set up, so the code shows here. To send for real: set MAIL_* and SMS_WEBHOOK_URL in backend/.env (see .env.example) and restart the backend — or connect Firebase and use the Firebase reset email option.</p>}
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
  btn: { padding: 10, background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  ghostBtn: { padding: 10, background: '#fff', border: '1px solid #1e3a5f', color: '#1e3a5f', cursor: 'pointer' },
  linkBtn: { background: 'none', border: 0, color: '#1e3a5f', cursor: 'pointer', padding: 0 },
  note: { background: '#fff8e6', border: '1px solid #f0d48a', padding: 10, borderRadius: 6 },
  hint: { background: '#eef2f7', border: '1px solid #c9d4e2', padding: 10, borderRadius: 6, fontSize: 13 },
}
