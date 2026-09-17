import { useState } from 'react'

/* Deterministic portrait per person (stable services + initial fallback if offline). */
function hash(str) {
  let h = 0
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0
  return h
}

export function portraitFor(seed) {
  const h = hash(seed || 'medrec')
  const set = h % 2 === 0 ? 'men' : 'women'
  return `https://randomuser.me/api/portraits/${set}/${h % 100}.jpg`
}

export function Avatar({ seed, name, size = 36 }) {
  const [failed, setFailed] = useState(false)
  const initial = (name || '?').charAt(0).toUpperCase()
  if (failed) {
    return (
      <span style={{ ...s.fallback, width: size, height: size, fontSize: size * 0.45 }}>{initial}</span>
    )
  }
  return (
    <img src={portraitFor(seed)} alt={name || 'person'} loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  )
}

/* Curated photos (Unsplash). PhotoFrame hides itself if the image can't load. */
export const PHOTOS = {
  heroDoctor: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=80',
  careTeam: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1600&q=80',
  consult: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=800&q=80',
}

export function PhotoFrame({ src, alt, style, imgStyle }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div style={{ overflow: 'hidden', ...style }}>
      <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...imgStyle }} />
    </div>
  )
}

const s = {
  fallback: { borderRadius: '50%', background: '#1e3a5f', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 },
}
