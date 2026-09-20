import { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth'
import api from '../api'
import { auth, googleProvider, isFirebaseConfigured } from '../firebase'

const AuthContext = createContext(null)

function saveSession(data) {
  localStorage.setItem('medrec_token', data.access_token)
  localStorage.setItem('medrec_user', JSON.stringify(data.user))
  try {
    if (data.user?.role) localStorage.setItem('medrec_last_role', data.user.role)
  } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('medrec_user')) } catch { return null }
  })
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [needsRole, setNeedsRole] = useState(false)
  const [loading, setLoading] = useState(true)

  // ---- shared: exchange a Firebase ID token for a MedRec session ----
  const isClockSkewError = (e) => {
    const d = e?.response?.data?.detail
    const s = (typeof d === 'object' ? (d.message || '') : String(d || e?.message || '')).toLowerCase()
    return s.includes('too early') || s.includes('clock') || s.includes('future') || s.includes('before it became valid')
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const exchange = async (fbUser, role = null, extra = {}) => {
    const idToken = await fbUser.getIdToken()
    // Reuse the SAME idToken on retry: a "too early" token becomes valid
    // once the backend clock catches up. Minting a fresh token would push
    // iat further into the future and make it worse.
    const attempt = () => api.post('/api/auth/firebase', { id_token: idToken, role, ...extra })
    try {
      try {
        const { data } = await attempt()
        saveSession(data)
        setUser(data.user)
        setNeedsRole(false)
        return data.user
      } catch (e) {
        if (!isClockSkewError(e)) throw e
        // Backend clock is 1-2s behind Google's: wait for it to catch up, retry same token.
        await sleep(2500)
        try {
          const { data } = await attempt()
          saveSession(data)
          setUser(data.user)
          setNeedsRole(false)
          return data.user
        } catch (e2) {
          if (!isClockSkewError(e2)) throw e2
          await sleep(4000)
          const { data } = await attempt()
          saveSession(data)
          setUser(data.user)
          setNeedsRole(false)
          return data.user
        }
      }
    } catch (e) {
      if (e.response?.status === 428) {
        // First Firebase sign-in: user must pick patient/doctor
        setNeedsRole(true)
      }
      throw e
    }
  }

  // ---- Firebase login options ----
  // role is passed through so FIRST-TIME doctors are created as doctors
  // immediately (no 428 bounce that defaults to patient).
  const firebaseLogin = async (email, password, role = null) => {
    const { user: fb } = await signInWithEmailAndPassword(auth, email, password)
    setFirebaseUser(fb)
    return exchange(fb, role)
  }

  const firebaseRegister = async ({ email, password, fullName, role, phone, specialization, hospital }) => {
    const { user: fb } = await createUserWithEmailAndPassword(auth, email, password)
    if (fullName) await updateProfile(fb, { displayName: fullName }).catch(() => {})
    setFirebaseUser(fb)
    return exchange(fb, role, { full_name: fullName, phone, specialization, hospital })
  }

  const googleLogin = async (role = null) => {
    try {
      const { user: fb } = await signInWithPopup(auth, googleProvider)
      setFirebaseUser(fb)
      return exchange(fb, role)
    } catch (e) {
      // Popup blocked / unsupported (e.g. some mobile browsers): fall back to
      // full-page redirect — Firebase returns to this app afterwards.
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported') {
        await signInWithRedirect(auth, googleProvider)
        return new Promise(() => {}) // never resolves; page navigates away
      }
      throw e
    }
  }

  // ---- Firebase passwordless email link (the link IS mailed by Firebase) ----
  const sendEmailLink = async (email) => {
    if (!isFirebaseConfigured) throw new Error('Firebase is not configured')
    await sendSignInLinkToEmail(auth, email, {
      url: `${window.location.origin}/login`,
      handleCodeInApp: true,
    })
    localStorage.setItem('medrec_email_for_link', email)
  }

  const isEmailLink = (href) => {
    if (!isFirebaseConfigured) return false
    try { return isSignInWithEmailLink(auth, href || window.location.href) } catch { return false }
  }

  const completeEmailLink = async (email) => {
    const { user: fb } = await signInWithEmailLink(auth, email, window.location.href)
    localStorage.removeItem('medrec_email_for_link')
    // Clean the one-time code out of the address bar
    try { window.history.replaceState({}, '', '/login') } catch { /* ignore */ }
    setFirebaseUser(fb)
    return exchange(fb)
  }

  // Called from the role picker shown on first Firebase sign-in
  const completeRole = async (role) => {
    const fb = firebaseUser || auth?.currentUser
    if (!fb) throw new Error('Firebase session expired — please sign in again')
    return exchange(fb, role)
  }

  // ---- local login: STEP 1 password -> STEP 2 OTP (same code, email+sms) ----
  // identifier = email OR phone. Returns the raw response: either
  // {otp_required: true, sent_via, ...} or (legacy) a session.
  const login = async (identifier, password) => {
    const form = new URLSearchParams()
    form.append('username', (identifier || '').trim())
    form.append('password', password)
    const { data } = await api.post('/api/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (data.access_token) {
      saveSession(data)
      setUser(data.user)
    }
    return data
  }

  const register = async (payload) => {
    const { data } = await api.post('/api/auth/register', payload)
    return data
  }

  const logout = async () => {
    try { if (auth) await signOut(auth) } catch { /* ignore */ }
    localStorage.removeItem('medrec_token')
    localStorage.removeItem('medrec_user')
    localStorage.removeItem('medrec_email_for_link')
    localStorage.removeItem('medrec_active_profile') // stale family filter must not leak into the next session
    setUser(null)
    setFirebaseUser(null)
    setNeedsRole(false)
  }

  const refreshUser = async () => {
    const { data } = await api.get('/api/auth/me')
    setUser(data)
    localStorage.setItem('medrec_user', JSON.stringify(data))
    return data
  }

  // ---- Email + SMS OTP (ONE code on BOTH channels) + forgot password ----
  // identifier = email or phone; server fans the same code out to both.
  const toContact = (identifier) => {
    const v = (identifier || '').trim()
    return v.includes('@') ? { email: v } : { phone: v }
  }

  const otpChannels = async () => {
    const { data } = await api.get('/api/auth/otp/channels').catch(() => ({ data: null }))
    return data
  }

  const requestOtp = async (identifier, purpose = 'login') => {
    const { data } = await api.post('/api/auth/otp/request', { ...toContact(identifier), purpose })
    return data // {sent_via: email+sms|email|sms|dev-log, channels, expires_in_minutes, dev_code?}
  }

  const verifyOtpLogin = async (identifier, code) => {
    const { data } = await api.post('/api/auth/otp/verify', { ...toContact(identifier), code, purpose: 'login' })
    saveSession(data)
    setUser(data.user)
    return data.user
  }

  const resetPasswordWithOtp = async (identifier, code, new_password) => {
    const { data } = await api.post('/api/auth/reset-password', { ...toContact(identifier), code, new_password })
    return data
  }

  // Human-readable "where did the code go" line for the UI.
  // SECURITY: NEVER render out.dev_code — the OTP must only travel via
  // email/SMS. If the server couldn't deliver (sent_via === 'dev-log'),
  // tell the user to configure mail instead of showing the code.
  const otpSentMessage = (out, identifier) => {
    if (!out) return ''
    if (out.sent_via === 'dev-log' || out.dev_code) {
      return `Email/SMS delivery is not configured on the server, so no code could be sent to ${identifier}. Ask the admin to set MAIL_* (and SMS_WEBHOOK_URL) in backend/.env and restart the backend — then request a fresh code.`
    }
    const via = (out.sent_via || '').split('+').filter(Boolean).join(' + ')
    return `Same code sent via ${via || 'email'} to ${identifier} — enter it below (valid ${out.expires_in_minutes} min).`
  }

  // Firebase-hosted password reset email (only when Firebase is configured).
  const firebasePasswordReset = async (email) => {
    if (!isFirebaseConfigured) throw new Error('Firebase is not configured')
    await sendPasswordResetEmail(auth, email)
  }

  // ---- Delete my account ----
  const deleteAccount = async (confirmPayload) => {
    await api.delete('/api/auth/me', { data: confirmPayload })
    await logout()
  }

  // Restore session: valid local token wins; else resume Firebase session silently
  useEffect(() => {
    if (!isFirebaseConfigured) {
      const token = localStorage.getItem('medrec_token')
      if (token && !user) {
        api.get('/api/auth/me').then(({ data }) => {
          setUser(data)
          localStorage.setItem('medrec_user', JSON.stringify(data))
        }).catch(() => logout()).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
      return
    }
    const unsub = onAuthStateChanged(auth, async (fb) => {
      setFirebaseUser(fb)
      try {
        // Returning from a Google redirect sign-in? Finish the MedRec exchange.
        try {
          const redir = await getRedirectResult(auth)
          if (redir?.user) {
            await exchange(redir.user).catch(() => {}) // needsRole may be set inside
            setLoading(false)
            return
          }
        } catch { /* no redirect result — continue normally */ }
        const token = localStorage.getItem('medrec_token')
        if (token) {
          const { data } = await api.get('/api/auth/me')
          setUser(data)
          localStorage.setItem('medrec_user', JSON.stringify(data))
        } else if (fb) {
          await exchange(fb).catch(() => {}) // needsRole may be set inside
        } else {
          setUser(null)
        }
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  return (
    <AuthContext.Provider value={{
      user, firebaseUser, loading, needsRole, setNeedsRole,
      firebaseConfigured: isFirebaseConfigured,
      firebaseLogin, firebaseRegister, googleLogin, completeRole,
      sendEmailLink, isEmailLink, completeEmailLink,
      login, register, logout, refreshUser,
      requestOtp, verifyOtpLogin, resetPasswordWithOtp, firebasePasswordReset,
      otpChannels, otpSentMessage,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
