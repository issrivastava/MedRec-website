import { useState } from 'react'
import api from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useDoctor } from './DoctorContext'
import { SPECIALIZATIONS } from '../../specializations'

export default function DoctorProfile() {
  const { user, refreshUser } = useAuth()
  const { profile, setProfile } = useDoctor()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const save = async () => {
    setMsg(''); setErr('')
    try {
      const payload = {
        ...profile,
        // Backend expects numbers for these — coerce empty strings to null.
        experience_years: profile.experience_years === '' || profile.experience_years == null
          ? null : Number(profile.experience_years),
        consultation_fee: profile.consultation_fee === '' || profile.consultation_fee == null
          ? null : Number(profile.consultation_fee),
      }
      if (payload.experience_years != null && Number.isNaN(payload.experience_years)) {
        setErr('Experience (years) must be a number')
        return
      }
      if (payload.consultation_fee != null && Number.isNaN(payload.consultation_fee)) {
        setErr('Consultation fee must be a number')
        return
      }
      const { data } = await api.put('/api/doctors/me', payload)
      setProfile(data)
      await refreshUser().catch(() => {})
      setMsg('Profile saved ✓')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not save profile')
    }
  }

  if (!profile) return <div className="empty">Loading profile…</div>

  return (
    <div className="rise">
      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-orange">👤</span> My Doctor Profile</h3>
        <p style={{ color: '#5d6b7a', fontSize: 14 }}>
          Signed in as <b>{user?.full_name}</b> · {user?.email} · ID <code>{String(user?.id || '').slice(0, 8)}</code>.
          Patients see your name, specialization and hospital when they link you or find you.
        </p>
        <div style={s.grid}>
          <label>Specialization<select value={profile.specialization || ''} onChange={(e) => setProfile({ ...profile, specialization: e.target.value })} style={s.input}>
            <option value="">Select specialization…</option>
            {SPECIALIZATIONS.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
            {!SPECIALIZATIONS.includes(profile.specialization) && profile.specialization ? <option value={profile.specialization}>{profile.specialization} (current)</option> : null}
          </select></label>
          <label>License No<input placeholder="License No" value={profile.license_no || ''} onChange={(e) => setProfile({ ...profile, license_no: e.target.value })} style={s.input} /></label>
          <label>Hospital<input placeholder="Hospital" value={profile.hospital || ''} onChange={(e) => setProfile({ ...profile, hospital: e.target.value })} style={s.input} /></label>
          <label>Phone<input placeholder="Phone" value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} style={s.input} /></label>
          <label>Education (degrees)<input placeholder="e.g. MBBS, MD (Cardiology)" value={profile.education || ''} onChange={(e) => setProfile({ ...profile, education: e.target.value })} style={s.input} /></label>
          <label>Experience (years)<input placeholder="e.g. 10" type="number" min="0" value={profile.experience_years ?? ''} onChange={(e) => setProfile({ ...profile, experience_years: e.target.value })} style={s.input} /></label>
          <label>Consultation fee (₹)<input placeholder="e.g. 500" type="number" min="0" value={profile.consultation_fee ?? ''} onChange={(e) => setProfile({ ...profile, consultation_fee: e.target.value })} style={s.input} /></label>
          <label>Languages<input placeholder="e.g. English, Hindi" value={profile.languages || ''} onChange={(e) => setProfile({ ...profile, languages: e.target.value })} style={s.input} /></label>
          <label>Clinic address<input placeholder="Clinic address" value={profile.clinic_address || ''} onChange={(e) => setProfile({ ...profile, clinic_address: e.target.value })} style={s.input} /></label>
          <label>Timings<input placeholder="e.g. Mon–Sat 10am–2pm" value={profile.timings || ''} onChange={(e) => setProfile({ ...profile, timings: e.target.value })} style={s.input} /></label>
        </div>
        <label style={{ display: 'block', marginBottom: 8 }}>Bio / about<textarea placeholder="Short intro patients see on Find Doctors" value={profile.bio || ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} style={{ ...s.input, width: '100%' }} /></label>
        {msg && <p style={{ color: 'green' }}>{msg}</p>}
        {err && <p style={{ color: 'red' }}>{err}</p>}
        <button onClick={save} style={s.primaryBtn}>Save profile</button>
      </section>

      <section style={s.card}>
        <h3 className="sec-head"><span className="tile t-blue">💡</span> How patients find you</h3>
        <p style={{ fontSize: 14, color: '#334155' }}>
          Ask patients to link you via <b>Patient Dashboard → My Doctors → your email ({user?.email})</b>,
          or list yourself under <b>Find Doctors</b> so new patients can discover and review you.
        </p>
      </section>
    </div>
  )
}

const s = {
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #1e3a5f', borderRadius: 12, padding: 'clamp(12px,3vw,18px)', marginBottom: 16, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)', minWidth: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 10, marginBottom: 8 },
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%', width: '100%', marginTop: 4 },
  primaryBtn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
}
