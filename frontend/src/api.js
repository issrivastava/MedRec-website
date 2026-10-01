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

// Silent session renewal: backend returns {code: 'token_expired'} on expiry.
// Try POST /api/auth/refresh once with the old token, then retry the request.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig = err.config
    const detail = err.response?.data?.detail
    const code = typeof detail === 'object' ? detail?.code : null
    if (err.response?.status === 401 && code === 'token_expired' && orig && !orig._retriedRefresh) {
      orig._retriedRefresh = true
      try {
        const { data } = await api.post('/api/auth/refresh')
        if (data?.access_token) {
          localStorage.setItem('medrec_token', data.access_token)
          if (data.user) localStorage.setItem('medrec_user', JSON.stringify(data.user))
          orig.headers = orig.headers || {}
          orig.headers.Authorization = `Bearer ${data.access_token}`
          return api(orig)
        }
      } catch { /* fall through to original error */ }
    }
    throw err
  }
)

export function avatarSrc(user) {
  if (!user?.avatar_url) return null
  return `${import.meta.env.VITE_API_URL || ''}${user.avatar_url}`
}

function filenameFromDisposition(disposition, fallback) {
  // Handles: attachment; filename="x.pdf" and RFC 5987 filename*=UTF-8''x.pdf
  const d = disposition || ''
  const star = d.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)
  if (star) {
    try {
      const n = decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
      if (n) return n
    } catch { /* fall through */ }
  }
  const match = d.match(/filename="?([^";]+)"?/)
  if (match) return match[1]
  return fallback
}

function sanitizePdfName(name, fallback = 'document') {
  let n = (name || fallback || 'document').trim() || 'document'
  n = n.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)
  if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf'
  return n
}

async function throwIfBlobError(res) {
  // Backend errors still arrive as blobs when responseType: 'blob'.
  // Detect JSON-error blobs and rethrow as readable Errors.
  const type = res.headers?.['content-type'] || ''
  const data = res.data
  const isBlob = data instanceof Blob
  if (!isBlob) {
    const detail = data?.detail || data?.message
    if (detail) throw new Error(typeof detail === 'string' ? detail : detail.message || 'Download failed')
    return
  }
  if (type.includes('application/json') || type.includes('text/json')) {
    let text = ''
    try { text = await data.text() } catch { /* ignore */ }
    try {
      const parsed = JSON.parse(text)
      const detail = parsed?.detail || parsed?.message
      throw new Error(typeof detail === 'string' ? detail : detail?.message || text.slice(0, 200) || 'Download failed')
    } catch (e) {
      if (e.message && !e.message.startsWith('{')) throw e
      throw new Error(text.slice(0, 200) || 'Download failed')
    }
  }
  if (data.size === 0) throw new Error('Server returned an empty file — try again.')
}

function triggerBlobDownload(blob, filename, mime = 'application/pdf') {
  const file = blob instanceof Blob ? blob : new Blob([blob], { type: mime })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Firefox requires the link to be in the DOM.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return filename
}

export async function downloadDocument(id, fallbackName = 'document') {
  // Downloads are PDF-only: the backend renders any file type as a PDF.
  const res = await api.get(`/api/documents/${id}/pdf`, { responseType: 'blob' })
  await throwIfBlobError(res)
  const raw = filenameFromDisposition(res.headers['content-disposition'], `${fallbackName}.pdf`)
  const name = sanitizePdfName(raw, fallbackName)
  return triggerBlobDownload(res.data, name, 'application/pdf')
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
  await throwIfBlobError(res)
  const raw = filenameFromDisposition(res.headers['content-disposition'], 'medrec-record.pdf')
  const name = sanitizePdfName(raw, 'medrec-record')
  return triggerBlobDownload(res.data, name, 'application/pdf')
}

export async function downloadBlobResponse(res, fallbackName = 'download.pdf') {
  await throwIfBlobError(res)
  const raw = filenameFromDisposition(res.headers?.['content-disposition'], fallbackName)
  const name = sanitizePdfName(raw, fallbackName.replace(/\.pdf$/i, ''))
  return triggerBlobDownload(res.data, name, 'application/pdf')
}

export function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text || ''], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return filename
}

export function friendlyDownloadError(err, fallback = 'Download failed') {
  if (!err.response && (err.code === 'ERR_NETWORK' || err.message === 'Network Error')) {
    return 'Cannot reach the server — is the backend running on http://localhost:8000?'
  }
  if (err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')) {
    return 'Server took too long — the PDF may be large. Wait and retry.'
  }
  const d = err.response?.data?.detail
  if (d) return typeof d === 'string' ? d : d.message || fallback
  return err.message || fallback
}

export default api
