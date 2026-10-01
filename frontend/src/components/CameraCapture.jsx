import { useEffect, useRef, useState } from 'react'

/* In-page camera that works on ANY device (desktop webcam, phone front/rear).
 *
 * Unlike `<input capture>` — which mobile-only browsers honor and desktops
 * silently turn into a file picker — this uses getUserMedia + MediaRecorder,
 * so "Take photo" and "Record video" behave the same everywhere.
 * Needs localhost or HTTPS; otherwise a plain-English fallback is shown.
 *
 * Props: initialMode ('photo'|'video'), onCapture(file), onClose().
 */
function pickRecorderMime() {
  if (!window.MediaRecorder?.isTypeSupported) return ''
  for (const c of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) {
    try {
      if (window.MediaRecorder.isTypeSupported(c)) return c
    } catch { /* ignore */ }
  }
  return ''
}

function extFor(mime) {
  if ((mime || '').includes('mp4')) return 'mp4'
  return 'webm'
}

export default function CameraCapture({ initialMode = 'photo', onCapture, onClose }) {
  const [mode, setMode] = useState(initialMode === 'video' ? 'video' : 'photo')
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const stopStream = () => {
    try { clearInterval(timerRef.current) } catch { /* ignore */ }
    timerRef.current = null
    try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop() } catch { /* ignore */ }
    recorderRef.current = null
    try { streamRef.current?.getTracks()?.forEach((t) => t.stop()) } catch { /* ignore */ }
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setRecording(false)
  }

  const start = async (m) => {
    setError('')
    setStarting(true)
    stopStream()
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('⚠️ This browser cannot open the camera here (needs localhost or HTTPS + camera permission). Use “Choose file” instead — on phones it offers the camera too.')
      setStarting(false)
      return
    }
    try {
      // `ideal` (not `exact`) prefers the rear camera on phones but still
      // works on desktop webcams, which would reject an exact constraint.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: m === 'video',
      })
      streamRef.current = stream
      // Wait a tick so the <video> is mounted before attaching the stream.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
    } catch (err) {
      const name = err?.name || ''
      setError(
        name === 'NotAllowedError'
          ? '⚠️ Camera (and mic, for video) permission denied — allow access in the browser address bar, or use “Choose file”.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? '⚠️ No camera found on this device — use “Choose file”.'
            : '⚠️ Could not open the camera here — use “Choose file” (on phones it offers the camera too).'
      )
    } finally {
      setStarting(false)
    }
  }

  // (Re)start when switching photo/video so the mic is only on for video.
  useEffect(() => {
    start(mode)
    return () => stopStream()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const snapPhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      onCapture?.(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  const startRecording = () => {
    const stream = streamRef.current
    if (!stream || !window.MediaRecorder) {
      setError('⚠️ Video recording is not supported in this browser — try “Take photo” or “Choose file”.')
      return
    }
    chunksRef.current = []
    const mime = pickRecorderMime()
    let rec
    try {
      rec = mime ? new window.MediaRecorder(stream, { mimeType: mime }) : new window.MediaRecorder(stream)
    } catch {
      setError('⚠️ Video recording is not supported in this browser — try “Take photo” or “Choose file”.')
      return
    }
    rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      try { clearInterval(timerRef.current) } catch { /* ignore */ }
      timerRef.current = null
      setRecording(false)
      const type = rec.mimeType || mime || 'video/webm'
      const blob = new Blob(chunksRef.current, { type })
      if (!blob.size) {
        setError('⚠️ Nothing was recorded — try again.')
        return
      }
      onCapture?.(new File([blob], `video-${Date.now()}.${extFor(type)}`, { type }))
    }
    rec.start(250)
    recorderRef.current = rec
    setRecording(true)
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }

  const stopRecording = () => {
    try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop() } catch { /* ignore */ }
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div style={s.box}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setMode('photo')} disabled={recording}
          style={mode === 'photo' ? s.tabActive : s.tab}>📷 Photo</button>
        <button type="button" onClick={() => setMode('video')} disabled={recording}
          style={mode === 'video' ? s.tabActive : s.tab}>🎥 Video</button>
      </div>
      <video ref={videoRef} playsInline muted={mode === 'photo'} controls={false}
        style={{ width: '100%', maxHeight: 320, borderRadius: 8, background: '#000' }} />
      {starting && <p style={{ color: '#e6f4f1', fontSize: 13 }}>Opening camera…</p>}
      {error && <p style={{ color: '#fbbf24', fontSize: 13, margin: '6px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {mode === 'photo' ? (
          <button type="button" onClick={snapPhoto} disabled={starting || recording} style={s.primary}>📸 Snap photo</button>
        ) : recording ? (
          <>
            <button type="button" onClick={stopRecording} style={s.stop}>⏹ Stop ({mmss})</button>
            <span style={{ color: '#f87171', fontSize: 13 }}>🔴 Recording…</span>
          </>
        ) : (
          <button type="button" onClick={startRecording} disabled={starting} style={s.primary}>⏺ Start recording</button>
        )}
        <button type="button" onClick={() => { stopStream(); onClose?.() }} disabled={recording}>Close</button>
      </div>
      <p style={{ fontSize: 12, color: '#9fb3c8', margin: '6px 0 0' }}>
        Works on phones and computers. Photos upload as JPG · videos up to 100 MB.
      </p>
    </div>
  )
}

const s = {
  box: { border: '1px dashed #d6dce4', borderRadius: 12, padding: 10, background: '#101828', marginTop: 8 },
  tab: { padding: '6px 14px', borderRadius: 999, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer', fontWeight: 650 },
  tabActive: { padding: '6px 14px', borderRadius: 999, border: '1px solid #fff', background: '#fff', color: '#101828', cursor: 'pointer', fontWeight: 700 },
  primary: { padding: '9px 18px', background: '#fff', color: '#101828', border: '1px solid #fff', cursor: 'pointer', fontWeight: 700, borderRadius: 12 },
  stop: { padding: '9px 18px', background: '#b91c1c', color: '#fff', border: '1px solid #b91c1c', cursor: 'pointer', fontWeight: 700, borderRadius: 12 },
}
