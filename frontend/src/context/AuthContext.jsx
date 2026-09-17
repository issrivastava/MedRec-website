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
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('medrec_user')) } catch { return null }
  })
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [needsRole, setNeedsRole] = useState(false)
  const [loading, setLoading] = useState(true)

  // ---- shared: exchange a Firebase ID token for a MedRec session ----
  const exchange = async (fbUser, role = null, extra = {}) => {
    const idToken = await fbUser.getIdToken()
    try {
      const { data } = await api.post('/api/auth/firebase', { id_token: idToken, role, ...extra })
      saveSession(data)
      setUser(data.user)
      setNeedsRole(false)
      return data.user
    } catch (e) {
      if (e.response?.status === 428) {
        // First Firebase sign-in: user must pick patient/doctor
        setNeedsRole(true)
      }
      throw e
    }
  }

  // ---- Firebase login options ----
  const firebaseLogin = async (email, password) => {
    const { user: fb } = await signInWithEmailAndPassword(auth, email, password)
    setFirebaseUser(fb)
    return exchange(fb)
  }

  const firebaseRegister = async ({ email, password, fullName, role, specialization, hospital }) => {
    const { user: fb } = await createUserWithEmailAndPassword(auth, email, password)
    if (fullName) await updateProfile(fb, { displayName: fullName }).catch(() => {})
    setFirebaseUser(fb)
    return exchange(fb, role, { full_name: fullName, specialization, hospital })
  }

  const googleLogin = async () => {
    try {
      const { user: fb } = await signInWithPopup(auth, googleProvider)
      setFirebaseUser(fb)
      return exchange(fb)
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

  // ---- local dev fallback (works without any Firebase setup) ----
  const login = async (email, password) => {
    const form = new URLSearchParams()
    form.append('username', email)
    form.append('password', password)
    const { data } = await api.post('/api/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    saveSession(data)
    setUser(data.user)
    return data.user
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

  // ---- Email OTP (passwordless) + forgot password via backend ----
  const requestOtp = async (email, purpose = 'login') => {
    const { data } = await api.post('/api/auth/otp/request', { email, purpose })
    return data // {sent_via, expires_in_minutes, dev_code?}
  }

  const verifyOtpLogin = async (email, code) => {
    const { data } = await api.post('/api/auth/otp/verify', { email, code, purpose: 'login' })
    saveSession(data)
    setUser(data.user)
    return data.user
  }

  const resetPasswordWithOtp = async (email, code, new_password) => {
    const { data } = await api.post('/api/auth/reset-password', { email, code, new_password })
    return data
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
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
