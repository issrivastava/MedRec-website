import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthSplit from '../components/AuthSplit'

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'patient', specialization: '', hospital: '', admin_key: '' })
  const [err, setErr] = useState('')
  const { firebaseConfigured, firebaseRegister, googleLogin, register } = useAuth()
  const nav = useNavigate()
  const go = (u) => nav(u.role === 'doctor' ? '/doctor' : '/patient')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      if (firebaseConfigured) {
        go(await firebaseRegister({
          email: form.email,
          password: form.password,
          fullName: form.full_name,
          role: form.role,
          specialization: form.specialization,
          hospital: form.hospital,
        }))
      } else {
        await register({ ...form, license_no: '' })
        nav('/login')
      }
    } catch (e) {
      const d = e.response?.data?.detail
      setErr(typeof d === 'object' ? (d.message || 'Registration failed') : (e.code === 'auth/email-already-in-use' ? 'Email already in use' : (e.message || 'Registration failed')))
    }
  }

  const submitGoogle = async () => {
    setErr('')
    try {
      go(await googleLogin())
    } catch (e) {
      // Brand-new Google users finish by picking patient/doctor on the Login page
      if (e.response?.status === 428) nav('/login')
      else setErr(e.message || 'Google sign-up failed')
    }
  }

  return (
    <AuthSplit points={[
      'Free forever for patients and doctors',
      'Book appointments and get lab alerts',
      'Export your full record anytime as PDF',
    ]}>
      <h2 style={{ marginTop: 0 }}>Create MedRec account</h2>
      {firebaseConfigured && <button onClick={submitGoogle} style={s.googleBtn}>Continue with Google</button>}
      <form onSubmit={submit} style={s.form}>
        <input placeholder="Full name" value={form.full_name} onChange={set('full_name')} required style={s.input} />
        <input placeholder="Email" value={form.email} onChange={set('email')} required style={s.input} />
        <input placeholder="Password (min 6)" type="password" value={form.password} onChange={set('password')} required style={s.input} />
        <select value={form.role} onChange={set('role')} style={s.input}>
          <option value="patient">Patient</option>
          <option value="doctor">Doctor</option>
          <option value="admin">Admin (needs key)</option>
        </select>
        {form.role === 'admin' && !firebaseConfigured && (
          <input placeholder="Admin signup key" type="password" value={form.admin_key} onChange={set('admin_key')} style={s.input} />
        )}
        {form.role === 'doctor' && (
          <>
            <input placeholder="Specialization" value={form.specialization} onChange={set('specialization')} style={s.input} />
            <input placeholder="Hospital" value={form.hospital} onChange={set('hospital')} style={s.input} />
          </>
        )}
        {err && <p style={{ color: 'red' }}>{err}</p>}
        <button type="submit" style={s.btn}>Register{firebaseConfigured ? ' with Firebase' : ''}</button>
      </form>
      <p>Have an account? <Link to="/login">Login</Link></p>
      <p style={{ fontSize: 13, color: '#666' }}>By registering you agree to our <Link to="/policy">Company Policy</Link>.</p>
    </AuthSplit>
  )
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  input: { padding: 10, fontSize: 15 },
  btn: { padding: 10, background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  googleBtn: { width: '100%', padding: 10, background: '#fff', border: '1px solid #ccc', cursor: 'pointer', fontSize: 15, fontWeight: 600 },
}
