/* Small shared helpers for identity details. */

export function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob)
  if (Number.isNaN(b.getTime())) return null
  const t = new Date()
  let a = t.getFullYear() - b.getFullYear()
  const m = t.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a -= 1
  return a >= 0 ? a : null
}

export function shortId(id) {
  if (!id) return '—'
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

export function displayId(user) {
  if (!user) return '—'
  if (user.health_id) return user.health_id
  return shortId(user.id)
}

export function formatDate(dt) {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return String(dt).slice(0, 10)
  }
}
