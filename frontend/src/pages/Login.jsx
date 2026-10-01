import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthSplit from '../components/AuthSplit'

function friendlyError(e, fallback) {
  if (!e.response && (e.code === 'ERR_NETWORK' || e.message === 'Network Error' || String(e.message || '').toLowerCase().includes('network'))) {
    return 'Could not reach the backend at http://localhost:8000. Keep the backend running: cd backend → .venv\\Scripts\\Activate.ps1 → py -3.11 -m uvicorn app.main:app --reload --port 8000.'
  }
  const status = e.response?.status
  const d = e.response?.data?.detail
  const withStatus = (msg) => (status ? `Backend said (${status}): ${msg}` : msg)
  if (!d) return withStatus(e.message || fallback)
  if (typeof d === 'object') return withStatus(d.message || fallback)
  return withStatus(String(d))
}

export default function Login() {
  // Remember last-used role so doctors don't get defaulted to patient.
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem('medrec_last_role') === 'doctor' ? 'doctor' : 'patient' } catch { return 'patient' }
  })
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const { firebaseConfigured, googleLogin, needsRole, completeRole } = useAuth()
  const nav = useNavigate()
  const go = (u) => nav(u.role === 'doctor' ? '/doctor' : u.role === 'admin' ? '/admin' : (u.role === 'receptionist' || u.role === 'nurse') ? '/directory' : '/patient')

  const pickRole = (r) => {
    setRole(r)
    try { localStorage.setItem('medrec_last_role', r) } catch { /* ignore */ }
  }

  const submitGoogle = async () => {
    setErr(''); setInfo('')
    setBusy(true)
    try {
      go(await googleLogin(role, null))
    } catch (e) {
      const msg = String(e.code || e.message || '')
      if (msg.includes('popup-closed') || msg.includes('cancelled')) setErr('Google sign-in was closed — try again.')
      else if (msg.includes('unauthorized-domain')) setErr('This domain is not authorized in Firebase → Authentication → Settings → Authorized domains.')
      else setErr(friendlyError(e, 'Google sign-in failed'))
    } finally {
      setBusy(false)
    }
  }

  const submitRole = async () => {
    setErr(''); setInfo('Finishing sign-in as ' + role + '…')
    setBusy(true)
    try {
      go(await completeRole(role, null))
    } catch (e) { setErr(friendlyError(e, 'Could not finish sign-in')) }
    finally { setBusy(false) }
  }

  return (
    <AuthSplit points={[
      'Scan & keep every report and prescription in one place',
      'Plain-language AI summaries in 10 languages',
      'Your doctor reviews your history in one click',
    ]}>
      <span className="pill pill-info" style={{ marginBottom: 10 }}>Welcome back</span>
      <h2 style={{ margin: '6px 0 6px', fontSize: 24, letterSpacing: '-0.02em' }}>Login to MedRec</h2>
      <p style={s.sub}>Sign in with Google — new here? Pick <b>Patient</b> or <b>Doctor</b> and we&apos;ll create your account automatically.</p>

      {needsRole ? (
        <div style={s.roleBox}>
          <h3 style={{ margin: '0 0 4px' }}>One last step — who are you?</h3>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>First sign-in with this Google account. <b>Doctors must pick Doctor here</b>, or the account opens as a patient.</p>
          <select value={role} onChange={(e) => pickRole(e.target.value)} style={s.input} aria-label="Account type">
            <option value="patient">Patient — I want care</option>
            <option value="doctor">Doctor — I provide care</option>
          </select>
          <button onClick={submitRole} style={s.btn} disabled={busy}>{busy ? 'Please wait…' : `Continue as ${role}`}</button>
          {err && <p style={{ color: 'red' }}>{err}</p>}
          {info && <p style={{ color: 'green' }}>{info}</p>}
        </div>
      ) : (
        <>
          <label style={s.label}>I am a</label>
          <select value={role} onChange={(e) => pickRole(e.target.value)} style={s.input} aria-label="I am a">
            <option value="patient">Patient — I want care</option>
            <option value="doctor">Doctor — I provide care</option>
          </select>
          {!firebaseConfigured ? (
            <div style={s.note}>
              <b>Google login is hidden because Firebase isn&apos;t connected yet.</b>
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Create a project at <b>console.firebase.google.com</b> → enable <b>Google</b> under Authentication.</li>
                <li>Copy the web-app keys into <code>frontend/.env</code> (<code>VITE_FIREBASE_*</code>).</li>
                <li>Save the service-account JSON as <code>backend/firebase-service-account.json</code>.</li>
                <li><b>Restart</b> both backend and <code>npm run dev</code>.</li>
              </ol>
            </div>
          ) : (
            <>
              <button onClick={submitGoogle} style={s.googleBtn} disabled={busy}>
                <span style={s.gLogo}>G</span> {busy ? 'Please wait…' : `Continue with Google${role === 'doctor' ? ' as Doctor' : ''}`}
              </button>
              <p style={s.hint}>
                {role === 'doctor'
                  ? 'Doctors: pick Doctor above. First sign-in creates your doctor account.'
                  : 'Patients: first sign-in creates your patient account automatically.'}
              </p>
            </>
          )}
          {err && <p style={{ color: 'red' }}>{err}</p>}
          {info && <p style={{ color: 'green' }}>{info}</p>}
        </>
      )}
    </AuthSplit>
  )
}

const s = {
  sub: { fontSize: 14, color: '#667085', margin: '0 0 16px', lineHeight: 1.6 },
  label: { fontSize: 13, fontWeight: 650, marginBottom: 6, display: 'block', color: '#344054' },
  input: { padding: '11px 13px', fontSize: 14.5, width: '100%', maxWidth: '100%', boxSizing: 'border-box', marginBottom: 10, borderRadius: 12 },
  btn: { padding: 12, background: '#101828', color: '#fff', border: '1px solid #101828', cursor: 'pointer', fontSize: 15, fontWeight: 700, width: '100%', borderRadius: 12 },
  googleBtn: { width: '100%', padding: 12, background: '#101828', border: '1px solid #101828', color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 4, borderRadius: 12 },
  gLogo: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#fff', color: '#101828', fontWeight: 800, fontSize: 13 },
  hint: { fontSize: 13, color: '#667085', margin: '10px 0 0' },
  note: { background: '#fffaeb', border: '1px solid #fedf89', padding: 12, borderRadius: 12, marginTop: 8, fontSize: 13.5 },
  roleBox: { display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #e9edf2', background: '#fbfcfd', padding: 16, borderRadius: 14 },
}
