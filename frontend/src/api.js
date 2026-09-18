import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000, // 30s: fail loudly instead of hanging forever
})

// Local Ollama needs much longer: cold model load + generation on CPU can
// take 1–3 min. Use { timeout: AI_TIMEOUT } on AI calls (summaries,
// understanding, assistant chat) so the 30s default doesn't abort them.
export const AI_TIMEOUT = 180000

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
  // Downloads are PDF-only: the backend renders any file type as a PDF.
  const res = await api.get(`/api/documents/${id}/pdf`, { responseType: 'blob' })
  const disposition = res.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^";]+)"?/)
  let name = match ? match[1] : `${fallbackName}.pdf`
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf'
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function openDocumentInline(id) {
  // Fetch with auth, then open in a new tab — videos play, PDFs/images preview.
  const res = await api.get(`/api/documents/${id}/download`, { responseType: 'blob' })
  const mime = res.headers['content-type'] || 'application/octet-stream'
  const url = URL.createObjectURL(new Blob([res.data], { type: mime }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 120000)
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
