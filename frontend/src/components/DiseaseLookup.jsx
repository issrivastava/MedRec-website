import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

/* Common conditions -> short search query matching all hospital directories. */
const SPECIALTY_FOR = [
  ['diabetes', 'diabetes'],
  ['hypertension', 'cardio'],
  ['blood pressure', 'cardio'],
  ['asthma', 'asthma'],
  ['migraine', 'neuro'],
  ['hypothyroid', 'thyroid'],
  ['thyroid', 'thyroid'],
  ['dengue', 'infectious'],
  ['typhoid', 'infectious'],
  ['tuberculosis', 'infectious'],
  ['covid', 'infectious'],
  ['anemia', 'physician'],
]

function specialtyFor(name) {
  const n = (name || '').toLowerCase()
  const hit = SPECIALTY_FOR.find(([k]) => n.includes(k))
  return hit ? hit[1] : null
}

/* Reusable disease-description lookup.
   Data: backend /api/diseases (free Wikipedia, no key + offline guide). */
export default function DiseaseLookup({ compact = false }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [provider, setProvider] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [popular, setPopular] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [openTitle, setOpenTitle] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    api.get('/api/diseases/popular').then(({ data }) => setPopular(data.results || [])).catch(() => {})
  }, [])

  const search = async (term) => {
    const query = (term ?? q).trim()
    if (query.length < 2) { setErr('Type at least 2 letters (e.g. Diabetes)'); return }
    setLoading(true); setErr(''); setDetail(null); setOpenTitle(null)
    try {
      const { data } = await api.get('/api/diseases/search', { params: { q: query, limit: 8 } })
      setResults(data.results || [])
      setProvider(data.provider || '')
      setDisclaimer(data.disclaimer || '')
      if (!data.results?.length) setErr('No matches found — try a simpler name (e.g. Flu instead of Influenza).')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not reach the disease database. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (r) => {
    if (openTitle === r.title) { setOpenTitle(null); setDetail(null); return }
    setOpenTitle(r.title)
    // Curated offline cards already carry full fields — no second fetch needed.
    if (r.id && String(r.id).startsWith('local-')) { setDetail(r); return }
    setDetailLoading(true)
    try {
      const { data } = await api.get('/api/diseases/detail', { params: { title: r.title } })
      setDetail(data.result || { ...r, overview: r.snippet || '' })
    } catch {
      setDetail({ ...r, overview: r.snippet || '' })
    } finally {
      setDetailLoading(false)
    }
  }

  const shown = detail && detail.title === openTitle ? detail : results.find((r) => r.title === openTitle)

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); search() }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search disease — e.g. Diabetes, Dengue, Migraine…"
          style={{ flex: '1 1 240px', padding: 10, fontSize: 15 }}
        />
        <button type="submit" disabled={loading} style={s.primaryBtn}>
          {loading ? 'Searching…' : '🔍 Search'}
        </button>
      </form>

      {!!popular.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#5d6b7a', alignSelf: 'center' }}>Popular:</span>
          {popular.map((p) => (
            <button key={p.name} onClick={() => { setQ(p.name); search(p.name) }} style={s.chip}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {err && <div className="empty">⚠️ {err}</div>}

      {provider && !compact && (
        <p style={{ fontSize: 12, color: '#5d6b7a' }}>
          Source: {provider === 'wikipedia' ? 'Wikipedia (free, no key needed)'
            : provider === 'wikipedia+offline-guide' ? 'Wikipedia + MedRec offline guide'
            : 'MedRec offline guide + Wikipedia links'}
        </p>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {results.map((r) => (
          <div key={r.id || r.title} style={s.card}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span className="tile t-rose" style={{ fontSize: 20 }}>🩺</span>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <b style={{ fontSize: 16 }}>{r.name}</b>
                {r.snippet && <p style={{ margin: '6px 0 0', color: '#334155' }}>{r.snippet.slice(0, 280)}{r.snippet.length > 280 ? '…' : ''}</p>}
                {r.overview && !r.snippet && <p style={{ margin: '6px 0 0', color: '#334155' }}>{r.overview.slice(0, 280)}{r.overview.length > 280 ? '…' : ''}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => openDetail(r)} style={s.smallBtn}>
                    {openTitle === r.title ? 'Hide details ▲' : 'Symptoms, causes & treatment ▼'}
                  </button>
                  <a href={r.wikipedia_url} target="_blank" rel="noreferrer" style={s.wikiBtn}>
                    Wikipedia ↗
                  </a>
                </div>
              </div>
            </div>

            {openTitle === r.title && (
              <div style={s.detail}>
                {detailLoading && <p>Loading full article…</p>}
                {shown && !detailLoading && (
                  <>
                    {shown.thumbnail && (
                      <img src={shown.thumbnail} alt={shown.name} style={{ float: 'right', maxWidth: 120, borderRadius: 8, margin: '0 0 8px 12px' }} />
                    )}
                    <Field label="📝 Overview" text={shown.overview} />
                    <Field label="🤒 Symptoms" text={shown.symptoms} />
                    <Field label="🔍 Causes" text={shown.causes} />
                    <Field label="🧪 Diagnosis" text={shown.diagnosis} />
                    <Field label="💊 Treatment" text={shown.treatment} />
                    <Field label="🛡️ Prevention" text={shown.prevention} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <Link
                        to={specialtyFor(shown.name)
                          ? `/find-doctors?specialty=${encodeURIComponent(specialtyFor(shown.name))}`
                          : '/find-doctors'}
                        style={s.docBtn}
                      >
                        🏥 Find doctors for appointment →
                      </Link>
                    </div>
                    <p style={{ fontSize: 12, color: '#8a6d3b', marginBottom: 0 }}>
                      Full article: <a href={shown.wikipedia_url} target="_blank" rel="noreferrer">read on Wikipedia ↗</a>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {!results.length && !loading && !err && (
        <div className="empty">🩺 Search any disease above to see its overview, symptoms, causes, diagnosis, treatment and prevention.</div>
      )}

      {disclaimer && <p style={{ fontSize: 12, color: '#5d6b7a', marginTop: 12 }}>ℹ️ {disclaimer}</p>}
    </div>
  )
}

function Field({ label, text }) {
  if (!text) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <b style={{ fontSize: 13 }}>{label}</b>
      <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap', fontSize: 14, color: '#334155' }}>{text}</p>
    </div>
  )
}

const s = {
  card: { border: '1px solid #dfe3e8', borderLeft: '4px solid #8b2e3c', borderRadius: 8, padding: 14, background: '#fff' },
  detail: { marginTop: 10, background: '#fdf6f6', border: '1px solid #dfe3e8', borderRadius: 8, padding: 12, overflow: 'auto' },
  primaryBtn: { padding: '10px 18px', background: '#1e3a5f', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' },
  smallBtn: { padding: '6px 12px', cursor: 'pointer' },
  wikiBtn: { padding: '6px 12px', background: '#8b2e3c', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'inline-block' },
  docBtn: { padding: '8px 14px', background: '#1e3a5f', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'inline-block' },
  chip: { padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13 },
}
