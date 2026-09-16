import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { avatarSrc } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user, refreshUser, logout } = useAuth()
  const [name, setName] = useState(user?.full_name || '')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const nav = useNavigate()
  const pic = avatarSrc(user)
  const dashboard = user?.role === 'doctor' ? '/doctor' : '/patient'

  const saveName = async () => {
    setMsg(''); setErr('')
    try {
      await api.put('/api/auth/me', { full_name: name })
      await refreshUser()
      setMsg('Profile updated')
    } catch (e) {
      setErr('Could not update profile')
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
      setMsg('Profile picture updated')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Upload failed (PNG/JPG/WEBP, max 5 MB)')
    }
  }

  const removePic = async () => {
    setMsg(''); setErr('')
    await api.delete('/api/auth/avatar')
    await refreshUser()
    setMsg('Profile picture removed')
  }

  return (
    <div style={s.wrap}>
      <h2 style={{ margin: '0 0 4px' }}>👤 My Profile</h2>
      <p style={{ color: '#5f6f6a', margin: '0 0 16px' }}>Your public identity across MedRec.</p>
      <div className="cols-2" style={{ alignItems: 'start' }}>
        <section style={s.card}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {pic
              ? <img src={pic} alt="profile" style={s.bigAvatar} />
              : <span style={s.bigFallback}>{user?.full_name?.charAt(0).toUpperCase()}</span>}
            <div>
              <p style={{ margin: '4px 0' }}><b>{user?.full_name}</b> ({user?.role})</p>
              <p style={{ margin: '4px 0', color: '#555' }}>{user?.email}</p>
              <label style={s.uploadLabel}>
                {pic ? 'Change picture' : 'Upload profile picture'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPic} hidden />
              </label>
              {pic && <button onClick={removePic} style={{ ...s.smallBtn, marginLeft: 8 }}>Remove</button>}
            </div>
          </div>
        </section>

        <section style={s.card}>
          <h3 style={{ marginTop: 0 }}>Account details</h3>
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={s.input} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={saveName} style={s.btn}>Save</button>
            <Link to={dashboard}><button>Go to Dashboard</button></Link>
            <button onClick={() => { logout(); nav('/') }}>Logout</button>
          </div>
          {msg && <p style={{ color: 'green' }}>{msg}</p>}
          {err && <p style={{ color: 'red' }}>{err}</p>}
        </section>
      </div>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #0f766e', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
  bigAvatar: { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' },
  bigFallback: { width: 96, height: 96, borderRadius: '50%', background: '#0f766e', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700 },
  input: { padding: 8, fontSize: 15, width: '100%', marginTop: 4 },
  btn: { padding: '8px 14px', background: '#0f766e', color: '#fff', border: 0, cursor: 'pointer' },
  smallBtn: { padding: '6px 10px', cursor: 'pointer' },
  uploadLabel: { display: 'inline-block', padding: '6px 12px', background: '#eee', borderRadius: 4, cursor: 'pointer', marginTop: 6 },
}
