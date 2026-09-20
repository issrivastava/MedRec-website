import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthSplit from '../components/AuthSplit'
import { SPECIALIZATIONS } from '../specializations'

export default function Register() {
  const [form, setForm] = useState({ email: '', phone: '', password: '', full_name: '', role: 'patient', specialization: '', hospital: '', admin_key: '' })
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const { firebaseConfigured, firebaseRegister, firebaseLogin, googleLogin, register } = useAuth()
  const nav = useNavigate()
  const go = (u) => nav(u.role === 'doctor' ? '/doctor' : u.role === 'admin' ? '/admin' : '/patient')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const friendlyRegisterError = (e) => {
    const d = e.response?.data?.detail
    const raw = typeof d === 'object' ? (d.message || 'Registration failed') : (d || e.message || 'Registration failed')
    const low = String(raw).toLowerCase()
    if (low.includes('too early') || low.includes('before it became valid') || (low.includes('clock') && low.includes('token'))) {
      return 'Server clock was a moment behind Google — please wait 3 seconds and click Register again. (Permanent fix: backend now tolerates 30s skew — restart the backend to pick it up; also sync clocks via Windows Settings > Time > Sync now.)'
    }
    if (e.code === 'auth/email-already-in-use') return 'Email already in use'
    return raw
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setInfo('')
    try {
      if (firebaseConfigured) {
        if (form.role === 'admin') {
          setErr('Admin accounts use local registration only — ask an existing admin to create it via the API.')
          return
        }
        try {
          try { localStorage.setItem('medrec_last_role', form.role) } catch { /* ignore */ }
          go(await firebaseRegister({
            email: form.email.trim(),
            password: form.password,
            fullName: form.full_name.trim(),
            role: form.role,
            phone: form.phone.trim(),
            specialization: form.specialization,
            hospital: form.hospital,
          }))
        } catch (fe) {
          // Email already in Firebase (e.g. registered locally first)? Sign in and link instead.
          if (fe.code === 'auth/email-already-in-use') {
            setInfo('Email already exists — signing you in and linking…')
            try {
              go(await firebaseLogin(form.email.trim(), form.password, form.role))
            } catch (se) {
              if (se.response?.status === 428) nav('/login') // pick patient/doctor there
              else throw se
            }
          } else throw fe
        }
      } else {
        const data = await register({ ...form, email: form.email.trim(), full_name: form.full_name.trim(), phone: form.phone.trim(), license_no: '' })
        try { localStorage.setItem('medrec_last_role', form.role) } catch { /* ignore */ }
        setInfo(`Account created${data?.health_id ? ` — your ID is ${data.health_id} (you can log in with email, phone or this ID)` : ''}. Redirecting to login…`)
        setTimeout(() => nav('/login'), 2500)
      }
    } catch (e) {
      if (!e.response && (e.code === 'ERR_NETWORK' || e.message === 'Network Error')) {
        setErr('Cannot reach the server — is the backend running? (If it just restarted, wait 10s and retry.)')
        return
      }
      if (e.code === 'auth/network-request-failed') {
        setErr('Cannot reach Google servers — check your internet and retry.')
        return
      }
      const d = e.response?.data?.detail
      setErr(typeof d === 'object' ? (d.message || 'Registration failed') : friendlyRegisterError(e))
    }
  }

  const submitGoogle = async () => {
    setErr('')
    try {
      go(await googleLogin())
    } catch (e) {
      // Brand-new Google users finish by picking patient/doctor on the Login page
      if (e.response?.status === 428) nav('/login')
      else setErr(friendlyRegisterError(e) || 'Google sign-up failed')
    }
  }

  return (
    <AuthSplit points={[
      'Free forever for patients and doctors',
      'Book appointments and get lab alerts',
      'Export your full record anytime as PDF',
    ]}>
      <h2 style={{ marginTop: 0 }}>Create MedRec account</h2>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 4px' }}>You’ll get a unique ID (AH-XXXX) — log in later with email, phone or that ID.</p>
      {firebaseConfigured && <button onClick={submitGoogle} style={s.googleBtn}>Continue with Google</button>}
      <form onSubmit={submit} style={s.form}>
        <input placeholder="Full name" value={form.full_name} onChange={set('full_name')} required style={s.input} />
        <input placeholder="Email" value={form.email} onChange={set('email')} required style={s.input} type="email" />
        <input placeholder="Phone (for SMS codes) — e.g. 9876543210" value={form.phone} onChange={set('phone')} style={s.input} inputMode="tel" />
        <input placeholder="Password (min 6)" type="password" value={form.password} onChange={set('password')} required style={s.input} />
        <select value={form.role} onChange={set('role')} style={s.input}>
          <option value="patient">Patient</option>
          <option value="doctor">Doctor</option>
          {!firebaseConfigured && <option value="admin">Admin (needs key)</option>}
        </select>
        {form.role === 'admin' && !firebaseConfigured && (
          <input placeholder="Admin signup key" type="password" value={form.admin_key} onChange={set('admin_key')} style={s.input} />
        )}
        {form.role === 'doctor' && (
          <>
            <select value={form.specialization} onChange={set('specialization')} style={{ ...s.input, width: '100%', maxWidth: '100%' }} required>
              <option value="">Select specialization…</option>
              {SPECIALIZATIONS.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
            </select>
            <input placeholder="Hospital" value={form.hospital} onChange={set('hospital')} style={s.input} />
          </>
        )}
        {err && <p style={{ color: 'red' }}>{err}</p>}
        {info && <p style={{ color: 'green' }}>{info}</p>}
        <button type="submit" style={s.btn}>Register{firebaseConfigured ? ' with Firebase' : ''}</button>
      </form>
      <p>Have an account? <Link to="/login">Login</Link></p>
      <p style={{ fontSize: 13, color: '#666' }}>By registering you agree to our <Link to="/policy">Company Policy</Link>.</p>
    </AuthSplit>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, width: '100%', maxWidth: '100%' },
  input: { padding: 10, fontSize: 15, width: '100%', maxWidth: '100%', boxSizing: 'border-box' },
  btn: { padding: 10, background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  googleBtn: { width: '100%', padding: 10, background: '#fff', border: '1px solid #ccc', cursor: 'pointer', fontSize: 15, fontWeight: 600 },
}
