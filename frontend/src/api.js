import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('medrec_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function avatarSrc(user) {
  if (!user?.avatar_url) return null
  return `${import.meta.env.VITE_API_URL || ''}${user.avatar_url}`
}

export async function downloadDocument(id, fallbackName = 'document') {
  const res = await api.get(`/api/documents/${id}/download`, { responseType: 'blob' })
  const disposition = res.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^";]+)"?/)
  const name = match ? match[1] : fallbackName
  const url = URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function downloadExportPdf(patientId = null) {
  const res = await api.get('/api/export/pdf', {
    params: patientId ? { patient_id: patientId } : {},
    responseType: 'blob',
  })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'medrec-record.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export default api
