import { useEffect, useRef, useState } from 'react'

/* Client-side profile-picture editor: rotate / flip / zoom / brightness /
   contrast on a square canvas, then Save uploads the edited JPEG.
   Props: src (image url or object URL), onSave(blob), onClose. */
export default function AvatarEditor({ src, onSave, onClose }) {
  const canvasRef = useRef(null)
  const [img, setImg] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [rotation, setRotation] = useState(0) // 0/90/180/270
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [fileSrc, setFileSrc] = useState(src)
  const [saving, setSaving] = useState(false)

  // Load image (remote URL or object URL)
  useEffect(() => {
    if (!fileSrc) return
    setLoadErr('')
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => setImg(im)
    im.onerror = () => setLoadErr('Could not load that image. Try uploading a PNG/JPG/WEBP file.')
    im.src = fileSrc
  }, [fileSrc])

  // Redraw on any adjustment
  useEffect(() => {
    if (!img) return
    const canvas = canvasRef.current
    if (!canvas) return
    const SIZE = 400
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.translate(SIZE / 2, SIZE / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale((flipH ? -1 : 1) * zoom, (flipV ? -1 : 1) * zoom)
    try {
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`
    } catch { /* older canvas: ignore filter */ }
    // cover-fit the square
    const side = Math.min(img.width, img.height)
    const sx = (img.width - side) / 2
    const sy = (img.height - side) / 2
    ctx.drawImage(img, sx, sy, side, side, -SIZE / 2, -SIZE / 2, SIZE, SIZE)
    ctx.restore()
  }, [img, rotation, flipH, flipV, zoom, brightness, contrast])

  const pickFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFileSrc(URL.createObjectURL(f))
    setRotation(0); setFlipH(false); setFlipV(false)
    setZoom(1); setBrightness(100); setContrast(100)
  }

  const reset = () => {
    setRotation(0); setFlipH(false); setFlipV(false)
    setZoom(1); setBrightness(100); setContrast(100)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    canvas.toBlob(
      (blob) => {
        setSaving(false)
        if (blob) onSave(blob)
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit profile picture">
        <div style={s.head}>
          <b>✏️ Edit profile picture</b>
          <button onClick={onClose} style={s.x} aria-label="Close editor">✕</button>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <canvas ref={canvasRef} style={s.canvas} />
            {!img && !loadErr && <p style={{ color: '#5d6b7a' }}>Loading…</p>}
            {loadErr && <p style={{ color: 'red', maxWidth: 400 }}>{loadErr}</p>}
            <label style={s.uploadLabel}>
              📁 Use a different photo
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile} hidden />
            </label>
          </div>

          <div style={s.controls}>
            <div style={s.row}>
              <button onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate 90°">↻ Rotate</button>
              <button onClick={() => setFlipH((v) => !v)} title="Flip horizontal" style={flipH ? s.on : {}}>⇋ Flip H</button>
              <button onClick={() => setFlipV((v) => !v)} title="Flip vertical" style={flipV ? s.on : {}}>⇅ Flip V</button>
            </div>
            <label>🔍 Zoom: {zoom.toFixed(1)}×
              <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(+e.target.value)} style={s.range} />
            </label>
            <label>☀️ Brightness: {brightness}%
              <input type="range" min="40" max="160" step="5" value={brightness} onChange={(e) => setBrightness(+e.target.value)} style={s.range} />
            </label>
            <label>◐ Contrast: {contrast}%
              <input type="range" min="40" max="160" step="5" value={contrast} onChange={(e) => setContrast(+e.target.value)} style={s.range} />
            </label>
            <div style={s.row}>
              <button onClick={reset}>Reset</button>
              <button onClick={save} disabled={!img || saving} style={s.saveBtn}>
                {saving ? 'Saving…' : '✓ Save picture'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#5d6b7a' }}>Square 400×400 preview — saved as JPG, same as uploads.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(26,46,69,.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: '#fff', borderRadius: 12, padding: 18, width: 'min(760px, 100%)', maxHeight: '90vh', overflow: 'auto', border: '1px solid #c9d4e2' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  x: { border: '1px solid #c9d4e2', background: '#fff', borderRadius: 6, cursor: 'pointer', padding: '2px 8px' },
  canvas: { width: 'min(400px, 100%)', aspectRatio: '1', borderRadius: '50%', border: '2px solid #1e3a5f', background: '#eee', maxWidth: '100%' },
  controls: { flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  range: { width: '100%', display: 'block' },
  on: { background: '#1e3a5f', color: '#fff' },
  saveBtn: { background: '#1e3a5f', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' },
  uploadLabel: { display: 'inline-block', padding: '6px 12px', background: '#eee', borderRadius: 4, cursor: 'pointer', marginTop: 8 },
}
