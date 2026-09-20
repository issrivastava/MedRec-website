import { useState } from 'react'
import api, {
  downloadBlobResponse,
  downloadDocument,
  downloadExportPdf,
  downloadTextFile,
  friendlyDownloadError,
  openDocumentInline,
} from '../api'

/* Shared async-button with busy + inline error. Keeps every PDF
   download consistent: ⬇ idle → ⏳ busy → ✅ done / ⚠️ error. */
export function AsyncDownloadButton({ onDownload, idleLabel, busyLabel = '⏳ Preparing…', style, title, disabled }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const click = async () => {
    if (busy || disabled) return
    setBusy(true); setErr(''); setDone(false)
    try {
      await onDownload()
      setDone(true)
      setTimeout(() => setDone(false), 2500)
    } catch (e) {
      setErr(friendlyDownloadError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="dl-wrap" style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <button onClick={click} disabled={busy || disabled} style={style} title={title || idleLabel}>
        {busy ? busyLabel : done ? '✅ Saved' : idleLabel}
      </button>
      {err && <small className="dl-error" title={err}>⚠️ {err}</small>}
    </span>
  )
}

export function ExportRecordButton({ patientId = null, label = '⬇ Export PDF', style }) {
  return (
    <AsyncDownloadButton
      idleLabel={label}
      style={style}
      title="Download your full health record as a PDF (for hospital visits / insurance)"
      onDownload={() => downloadExportPdf(patientId)}
    />
  )
}

export function DocumentPdfButton({ doc, style }) {
  const isVideo = (doc?.file_mimetype || '').startsWith('video/')
  if (isVideo) {
    return (
      <AsyncDownloadButton
        idleLabel="▶ Play"
        style={style}
        title="Play this video"
        onDownload={() => openDocumentInline(doc.id)}
      />
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <AsyncDownloadButton
        idleLabel="👁 View"
        style={style}
        title="Open the original file in a new tab"
        onDownload={() => openDocumentInline(doc.id)}
      />
      <AsyncDownloadButton
        idleLabel="⬇ PDF"
        style={style}
        title="Download this document as a PDF"
        onDownload={() => downloadDocument(doc.id, doc.title)}
      />
    </span>
  )
}

/* Download any AI summary text as a readable file. */
export function SummaryDownloadButton({ title = 'AI summary', text, style }) {
  if (!text) return null
  const safe = (title || 'summary').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || 'summary'
  return (
    <AsyncDownloadButton
      idleLabel="⬇ Summary (.txt)"
      style={style}
      title="Download this AI summary as a text file"
      onDownload={async () => {
        downloadTextFile(`${safe}.txt`, `${title}\n${'='.repeat(title.length)}\n\n${text}\n\n— Exported from MedRec (informational only, not a diagnosis).\n`)
      }}
    />
  )
}

/* Generic blob-PDF downloader for endpoints returning application/pdf
   (Rx PDFs, certificates). Shows errors inline instead of failing silently. */
export function BlobPdfButton({ idleLabel, filename, fetchPdf, style, title }) {
  return (
    <AsyncDownloadButton
      idleLabel={idleLabel}
      style={style}
      title={title || idleLabel}
      onDownload={async () => {
        const res = await fetchPdf()
        await downloadBlobResponse(res, filename)
      }}
    />
  )
}

export function RxPdfButton({ note, style }) {
  return (
    <BlobPdfButton
      idleLabel="⬇ Rx PDF (signed)"
      filename={`rx-${(note?.id || 'note').slice(0, 8)}.pdf`}
      style={style}
      title="Download this signed prescription as PDF"
      fetchPdf={() => api.get(`/api/visits/${note.id}/rx-pdf`, { responseType: 'blob' })}
    />
  )
}

export function CertificatePdfButton({ id, style }) {
  return (
    <BlobPdfButton
      idleLabel="⬇ PDF"
      filename={`certificate-${String(id || '').slice(0, 8)}.pdf`}
      style={style}
      title="Download this certificate as PDF"
      fetchPdf={() => api.get(`/api/practice/certificates/${id}/pdf`, { responseType: 'blob' })}
    />
  )
}
