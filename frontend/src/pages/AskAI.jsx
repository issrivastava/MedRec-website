import AIAssistant from '../components/AIAssistant'

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
    </div>
  )
}

const s = {
  wrap: { width: '100%', padding: '26px 30px 40px' },
  card: { border: '1px solid #f5f5f4', borderLeft: '4px solid #4a5a7a', borderRadius: 12, padding: 18, background: '#fff', boxShadow: '0 1px 3px rgba(15,118,110,.08),0 4px 14px rgba(15,118,110,.07)' },
}
