import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)

/* Multiple profiles in one account: self (null) + family members.
   Persisted in localStorage so refresh keeps the active profile. */
export function ProfileProvider({ children }) {
  const { user } = useAuth()
  const [family, setFamily] = useState([])
  const [activeId, setActiveId] = useState(() => {
    try { return localStorage.getItem('medrec_active_profile') || '' } catch { return '' }
  })

  const reloadFamily = useCallback(async () => {
    if (!user || user.role !== 'patient') { setFamily([]); return [] }
    try {
      const { data } = await api.get('/api/family')
      setFamily(data)
      return data
    } catch { return [] }
  }, [user])

  useEffect(() => { reloadFamily() }, [reloadFamily])

  useEffect(() => {
    // If active member was deleted, fall back to self
    if (activeId && family.length && !family.find((m) => m.id === activeId)) {
      setActiveId('')
      try { localStorage.removeItem('medrec_active_profile') } catch { /* ignore */ }
    }
  }, [family, activeId])

  const setActive = useCallback((id) => {
    const v = id || ''
    setActiveId(v)
    try {
      if (v) localStorage.setItem('medrec_active_profile', v)
      else localStorage.removeItem('medrec_active_profile')
    } catch { /* ignore */ }
  }, [])

  const active = useMemo(() => {
    if (!activeId) return null
    return family.find((m) => m.id === activeId) || null
  }, [family, activeId])

  const value = useMemo(() => ({
    family,
    reloadFamily,
    activeId,
    active,
    isSelf: !active,
    activeName: active ? active.name : (user?.full_name || 'Me'),
    setActive,
  }), [family, reloadFamily, activeId, active, user])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider')
  return ctx
}
