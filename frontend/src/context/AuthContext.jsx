import { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
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
    const { user: fb } = await signInWithPopup(auth, googleProvider)
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
    setUser(null)
    setFirebaseUser(null)
    setNeedsRole(false)
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
      login, register, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
