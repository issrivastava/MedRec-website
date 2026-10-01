import { createContext, useContext, useEffect, useMemo } from 'react'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)

/* Family profiles were removed from the UI: every account now has exactly
   one profile (self). This stays as a same-shaped stub so the per-profile
   readers (clinical history, analytics, structured records) keep working
   untouched, always scoped to self. Backend family APIs are unchanged. */
export function ProfileProvider({ children }) {
  const { user } = useAuth()
  useEffect(() => {
    try { localStorage.removeItem('medrec_active_profile') } catch { /* ignore */ }
  }, [])
  const value = useMemo(() => ({
    family: [],
    reloadFamily: async () => [],
    activeId: '',
    active: null,
    isSelf: true,
    activeName: user?.full_name || 'Me',
    setActive: () => {},
  }), [user])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider')
  return ctx
}
