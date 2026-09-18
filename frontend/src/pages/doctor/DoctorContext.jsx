import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import api from '../../api'

const DoctorContext = createContext(null)

const SELECT_KEY = 'medrec_doctor_selected_patient'

export function DoctorProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [patients, setPatients] = useState([])
  const [selectedId, setSelectedId] = useState(() => {
    try { return localStorage.getItem(SELECT_KEY) || '' } catch { return '' }
  })
  const [appts, setAppts] = useState([])
  const [emgCount, setEmgCount] = useState(0)
  const [noteCount, setNoteCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const setSelected = useCallback((id) => {
    setSelectedId(id || '')
    try {
      if (id) localStorage.setItem(SELECT_KEY, id)
      else localStorage.removeItem(SELECT_KEY)
    } catch { /* ignore */ }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: p }, { data: list }] = await Promise.all([
        api.get('/api/doctors/me'),
        api.get('/api/doctors/patients'),
      ])
      setProfile(p)
      setPatients(list)
      setSelectedId((prev) => {
        if (prev && list.some((x) => x.patient_id === prev)) return prev
        const first = list.length ? list[0].patient_id : ''
        try {
          if (first) localStorage.setItem(SELECT_KEY, first)
          else localStorage.removeItem(SELECT_KEY)
        } catch { /* ignore */ }
        return first
      })
      const { data: a } = await api.get('/api/scheduling/appointments/my').catch(() => ({ data: [] }))
      setAppts(a)
      const { data: emg } = await api.get('/api/emergency/assigned').catch(() => ({ data: [] }))
      setEmgCount(emg.filter((x) => x.status === 'active').length)
      const counts = await Promise.all(
        list.map((x) => api.get(`/api/visits/patient/${x.patient_id}`).then((r) => r.data.length).catch(() => 0))
      )
      setNoteCount(counts.reduce((t, n) => t + n, 0))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload().catch(console.error) }, [reload])

  const selectedPatient = patients.find((p) => p.patient_id === selectedId) || null

  return (
    <DoctorContext.Provider value={{
      profile, setProfile, patients, selectedId, setSelected,
      selectedPatient, appts, setAppts, emgCount, setEmgCount,
      noteCount, loading, reload,
    }}>
      {children}
    </DoctorContext.Provider>
  )
}

export const useDoctor = () => {
  const ctx = useContext(DoctorContext)
  if (!ctx) throw new Error('useDoctor must be used inside DoctorProvider')
  return ctx
}
