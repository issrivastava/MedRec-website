import AIAssistant from '../components/AIAssistant'
import PageRagSearch from '../components/PageRagSearch'

export default function AskAI() {
  return (
    <div style={s.wrap} className="rise">
      <h2 style={{ margin: '0 0 4px' }}>🤖 Ask AI — solve your doubts</h2>
      <p style={{ color: '#5d6b7a', margin: '0 0 16px', maxWidth: 720 }}>
        Ask any health or MedRec doubt in simple words — reports, medicines,
        appointments, anything. Powered by free Gemini AI.
      </p>
      <section style={s.card}>
        <AIAssistant />
      </section>

      <h2 style={{ margin: '22px 0 4px' }}>📄 Search my documents — page-index answers</h2>
      <p style={{ color: '#5d6b7a', margin: '0 0 16px', maxWidth: 720 }}>
        Ask about your own reports — the answer is read straight from the
        matching pages (no embeddings, works offline) and every claim cites
        the exact document page.
      </p>
      <section style={s.card2}>
        <PageRagSearch />
      </section>
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #4a5a7a', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
  card2: { border: '1px solid #f5f5f4', borderLeft: '4px solid #0d9488', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
}
