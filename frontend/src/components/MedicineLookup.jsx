import { useEffect, useState } from 'react'
import api from '../api'

/* Reusable medicine-description lookup.
   Data: backend /api/medicines (free openFDA + Tata 1mg deep links). */
export default function MedicineLookup({ compact = false }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [provider, setProvider] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [popular, setPopular] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    api.get('/api/medicines/popular').then(({ data }) => setPopular(data.results || [])).catch(() => {})
  }, [])

  const search = async (term) => {
    const query = (term ?? q).trim()
    if (query.length < 2) { setErr('Type at least 2 letters (e.g. Paracetamol)'); return }
    setLoading(true); setErr(''); setDetail(null); setOpenId(null)
    try {
      const { data } = await api.get('/api/medicines/search', { params: { q: query, limit: 8 } })
      setResults(data.results || [])
      setProvider(data.provider || '')
      setDisclaimer(data.disclaimer || '')
      if (!data.results?.length) setErr('No matches found — try the generic name (e.g. Paracetamol instead of Crocin).')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Could not reach the medicine database. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (r) => {
    if (openId === r.id) { setOpenId(null); setDetail(null); return }
    setOpenId(r.id)
    // Search payload already has the key fields; fetch full label only for openFDA rows.
    if (!r.set_id) { setDetail(r); return }
    setDetailLoading(true)
    try {
      const { data } = await api.get('/api/medicines/detail', { params: { set_id: r.set_id } })
      setDetail(data.result || r)
    } catch {
      setDetail(r)
    } finally {
      setDetailLoading(false)
    }
  }

  const shown = detail && detail.id === openId ? detail : results.find((r) => r.id === openId)

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); search() }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search medicine — e.g. Paracetamol, Azithromycin, Cetirizine…"
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
          Source: {provider === 'openfda' ? 'openFDA drug labels (free, no key) + Tata 1mg links'
            : provider === 'tata1mg-proxy' ? 'Tata 1mg via your API key'
            : 'openFDA + MedRec offline guide + Tata 1mg links'}
        </p>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {results.map((r) => (
          <div key={r.id} style={s.card}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span className="tile t-green" style={{ fontSize: 20 }}>💊</span>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <b style={{ fontSize: 16 }}>{r.name}</b>
                {r.generic && r.generic !== r.name && (
                  <div style={{ fontSize: 13, color: '#5d6b7a' }}>{r.generic}</div>
                )}
                {r.manufacturer && (
                  <div style={{ fontSize: 13, color: '#5d6b7a' }}>🏭 {r.manufacturer}</div>
                )}
                {r.purpose && <div style={{ marginTop: 4 }}><span className="pill pill-ok">{r.purpose.slice(0, 90)}</span></div>}
                {r.description && <p style={{ margin: '8px 0 0', color: '#334155' }}>{r.description.slice(0, 280)}{r.description.length > 280 ? '…' : ''}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => openDetail(r)} style={s.smallBtn}>
                    {openId === r.id ? 'Hide details ▲' : 'Description & dosage ▼'}
                  </button>
                  <a href={r.tata1mg_url} target="_blank" rel="noreferrer" style={s.mgBtn}>
                    View on Tata 1mg ↗
                  </a>
                </div>
              </div>
            </div>

            {openId === r.id && (
              <div style={s.detail}>
                {detailLoading && <p>Loading full label…</p>}
                {shown && !detailLoading && (
                  <>
                    <Field label="📝 Description" text={shown.description} />
                    <Field label="✅ Uses" text={shown.uses} />
                    <Field label="💉 Dosage" text={shown.dosage} />
                    <Field label="⚠️ Side effects" text={shown.side_effects} />
                    <Field label="🚫 Warnings" text={shown.warnings} />
                    <Field label="🔗 Interactions" text={shown.interactions} />
                    <p style={{ fontSize: 12, color: '#8a6d3b', marginBottom: 0 }}>
                      Prices, substitutes & delivery: <a href={shown.tata1mg_url} target="_blank" rel="noreferrer">open on Tata 1mg ↗</a>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {!results.length && !loading && !err && (
        <div className="empty">💊 Search any medicine above to see its description, uses, dosage, side effects and Tata 1mg link.</div>
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
  card: { border: '1px solid #dfe3e8', borderLeft: '4px solid #2f5d3a', borderRadius: 8, padding: 14, background: '#fff' },
  detail: { marginTop: 10, background: '#f6faf7', border: '1px solid #dfe3e8', borderRadius: 8, padding: 12 },
  primaryBtn: { padding: '10px 18px', background: '#1e3a5f', color: '#fff', border: 0, fontWeight: 700, cursor: 'pointer' },
  smallBtn: { padding: '6px 12px', cursor: 'pointer' },
  mgBtn: { padding: '6px 12px', background: '#2f5d3a', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 14, display: 'inline-block' },
  chip: { padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13 },
}
