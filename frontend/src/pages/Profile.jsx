import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { avatarSrc } from '../api'
import { useAuth } from '../context/AuthContext'
import AvatarEditor from '../components/AvatarEditor'
import MyIdCard from '../components/MyIdCard'
import { calcAge, formatDate } from '../utils'

export default function Profile() {
  const { user, refreshUser, logout, deleteAccount, firebaseConfigured } = useAuth()
  const [name, setName] = useState(user?.full_name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [delConfirm, setDelConfirm] = useState('')
  const [delPassword, setDelPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [avatarVer, setAvatarVer] = useState(0) // cache-buster so edits show instantly
  const [details, setDetails] = useState(null) // patient/doctor profile record
  const [copied, setCopied] = useState(false)
  const nav = useNavigate()
  const pic = avatarSrc(user)
  const displayPic = pic ? `${pic}${pic.includes('?') ? '&' : '?'}v=${avatarVer}` : null
  const dashboard = user?.role === 'doctor' ? '/doctor' : '/patient'

  useEffect(() => {
    if (user?.role === 'patient') {
      api.get('/api/patients/me').then(({ data }) => setDetails(data)).catch(() => {})
    } else if (user?.role === 'doctor') {
      api.get('/api/doctors/me').then(({ data }) => setDetails(data)).catch(() => {})
    }
  }, [user?.role])

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user?.health_id || user?.id || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const age = user?.role === 'patient' ? calcAge(details?.dob) : null

  const saveName = async () => {
    setMsg(''); setErr('')
    try {
      await api.put('/api/auth/me', { full_name: name, phone: phone.trim() || null })
      await refreshUser()
      setMsg('Profile updated — OTP codes will go to this phone by SMS too')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not update profile')
    }
  }

  const uploadPic = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setMsg(''); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post('/api/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      await refreshUser()
      setAvatarVer((v) => v + 1)
      setMsg('Profile picture updated')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Upload failed (PNG/JPG/WEBP, max 5 MB)')
    }
  }

  const saveEditedPic = async (blob) => {
    setMsg(''); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', new File([blob], 'avatar-edited.jpg', { type: 'image/jpeg' }))
      await api.post('/api/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      await refreshUser()
      setAvatarVer((v) => v + 1)
      setEditorOpen(false)
      setMsg('Profile picture updated')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not save edited picture')
    }
  }

  const removePic = async () => {
    setMsg(''); setErr('')
    await api.delete('/api/auth/avatar')
    await refreshUser()
    setAvatarVer((v) => v + 1)
    setMsg('Profile picture removed')
  }

  const doDelete = async () => {
    setMsg(''); setErr('')
    if (delConfirm.trim().toUpperCase() !== 'DELETE') {
      setErr('Type DELETE to confirm account deletion')
      return
    }
    if (!window.confirm('Permanently delete your account and ALL MedRec data? This cannot be undone.')) return
    setDeleting(true)
    try {
      const payload = { confirm: 'DELETE' }
      if (delPassword) payload.password = delPassword
      await deleteAccount(payload)
      nav('/')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not delete account')
      setDeleting(false)
    }
  }

  return (
    <div style={s.wrap}>
      <h2 style={{ margin: '0 0 4px' }}>👤 My Profile</h2>
      <p style={{ color: '#5d6b7a', margin: '0 0 16px' }}>Your public identity across MedRec.</p>
      <MyIdCard user={user} />
      <div className="cols-2" style={{ alignItems: 'start' }}>
        <section style={s.card}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {displayPic
              ? <img src={displayPic} alt="profile" style={s.bigAvatar} />
              : <span style={s.bigFallback}>{user?.full_name?.charAt(0).toUpperCase()}</span>}
            <div>
              <p style={{ margin: '4px 0' }}><b>{user?.full_name}</b> ({user?.role})</p>
              <p style={{ margin: '4px 0', color: '#555' }}>{user?.email}</p>
              <label style={s.uploadLabel}>
                {pic ? 'Change picture' : 'Upload profile picture'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPic} hidden />
              </label>
              {pic && (
                <>
                  <button onClick={() => setEditorOpen(true)} style={{ ...s.smallBtn, marginLeft: 8, background: '#1e3a5f', color: '#fff', border: 0, fontWeight: 700 }}>
                    ✏️ Edit
                  </button>
                  <button onClick={removePic} style={{ ...s.smallBtn, marginLeft: 8 }}>Remove</button>
                </>
              )}
            </div>
          </div>
        </section>

        <section style={s.card}>
          <h3 style={{ marginTop: 0 }}>Account details</h3>
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={s.input} />
          <label>Phone (for SMS login codes) — e.g. 9876543210</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={s.input} inputMode="tel" placeholder={user?.phone || 'Not set'} />
          <div style={s.detailGrid}>
            <Detail label={user?.role === 'doctor' ? 'Doctor ID' : 'Patient ID'} mono>
              <span title={user?.id}>{user?.health_id || user?.id}</span>{' '}
              <button onClick={copyId} style={s.smallBtn}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </Detail>
            <Detail label="Email">{user?.email}</Detail>
            <Detail label="Login phone (SMS codes)">{user?.phone || '— (add above)'}</Detail>
            <Detail label="Role"><span className="pill pill-info">{user?.role}</span></Detail>
            <Detail label="Member since">{formatDate(user?.created_at)}</Detail>
            {user?.role === 'patient' && (
              <>
                <Detail label="Age">{age != null ? `${age} years` : '— (set date of birth below)'}</Detail>
                <Detail label="Gender">{details?.gender || '—'}</Detail>
                <Detail label="Blood group">{details?.blood_group ? `🩸 ${details.blood_group}` : '—'}</Detail>
                <Detail label="Phone">{details?.phone || '—'}</Detail>
              </>
            )}
            {user?.role === 'doctor' && (
              <>
                <Detail label="Specialization">{details?.specialization || '—'}</Detail>
                <Detail label="License No">{details?.license_no || '—'}</Detail>
                <Detail label="Hospital">{details?.hospital || '—'}</Detail>
                <Detail label="Phone">{details?.phone || '—'}</Detail>
                <Detail label="Education">{details?.education || '—'}</Detail>
                <Detail label="Experience">{details?.experience_years != null ? `${details.experience_years} yrs` : '—'}</Detail>
                <Detail label="Fee">{details?.consultation_fee != null ? `₹${details.consultation_fee}` : '—'}</Detail>
                <Detail label="Languages">{details?.languages || '—'}</Detail>
                <Detail label="Clinic">{details?.clinic_address || '—'}</Detail>
                <Detail label="Timings">{details?.timings || '—'}</Detail>
              </>
            )}
          </div>
          {user?.role !== 'admin' && (
            <p style={{ fontSize: 13, color: '#5d6b7a' }}>
              Edit medical details in your dashboard →{' '}
              <Link to={dashboard} style={{ fontWeight: 700 }}>
                {user?.role === 'doctor' ? 'Doctor profile' : 'Family & Info / Clinical History'}
              </Link>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={saveName} style={s.btn}>Save</button>
            <Link to={dashboard}><button>Go to Dashboard</button></Link>
            <button onClick={() => { logout(); nav('/') }}>Logout</button>
          </div>
          {msg && <p style={{ color: 'green' }}>{msg}</p>}
          {err && <p style={{ color: 'red' }}>{err}</p>}
        </section>
      </div>

      <section style={{ ...s.card, borderLeftColor: '#dc2626', marginTop: 16 }}>
        <h3 style={{ marginTop: 0, color: '#dc2626' }}>⚠ Danger zone — delete my account</h3>
        <p style={{ color: '#5d6b7a', fontSize: 14 }}>
          Permanently removes your profile, documents, appointments, prescriptions,
          family members, alerts and notifications. This cannot be undone.
          {firebaseConfigured ? ' Your Firebase/Google login is unlinked too.' : ''}
        </p>
        {!showDelete
          ? <button onClick={() => setShowDelete(true)} style={s.dangerBtn}>Delete my account…</button>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
              <label>Type <b>DELETE</b> to confirm</label>
              <input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" style={s.input} />
              <label>Current password <small style={{ color: '#888' }}>(local accounts — leave blank for Google sign-in)</small></label>
              <input type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} placeholder="Current password (if any)" style={s.input} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doDelete} disabled={deleting} style={s.dangerBtn}>
                  {deleting ? 'Deleting…' : 'Yes, delete everything'}
                </button>
                <button onClick={() => { setShowDelete(false); setDelConfirm(''); setDelPassword('') }}>Cancel</button>
              </div>
            </div>
          )}
      </section>

      {editorOpen && displayPic && (
        <AvatarEditor
          src={pic}
          onClose={() => setEditorOpen(false)}
          onSave={saveEditedPic}
        />
      )}
    </div>
  )
}

function Detail({ label, children, mono }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#5d6b7a', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, overflowWrap: 'anywhere', fontFamily: mono ? 'monospace' : undefined }}>{children}</div>
    </div>
  )
}

const s = {  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
  bigAvatar: { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' },
  bigFallback: { width: 96, height: 96, borderRadius: '50%', background: '#1e3a5f', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700 },
  input: { padding: 8, fontSize: 15, width: '100%', marginTop: 4 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 12, background: '#f8f9fa', border: '1px solid #dfe3e8', borderRadius: 8, padding: 12 },
  btn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer' },
  dangerBtn: { padding: '8px 14px', background: '#dc2626', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
  smallBtn: { padding: '6px 10px', cursor: 'pointer' },
  uploadLabel: { display: 'inline-block', padding: '6px 12px', background: '#eee', borderRadius: 4, cursor: 'pointer', marginTop: 6 },
}
