import { Link } from 'react-router-dom'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer style={s.footer}>
      <div style={s.inner}>
        <div>
          <div style={s.brand}>MedRec</div>
          <p style={s.tag}>Your medical records, organized — for patients and doctors.</p>
        </div>
        <div style={s.cols}>
          <div style={s.col}>
            <b>Product</b>
            <Link to="/" style={s.link}>Home</Link>
            <Link to="/login" style={s.link}>Login</Link>
            <Link to="/register" style={s.link}>Register</Link>
          </div>
          <div style={s.col}>
            <b>Support</b>
            <Link to="/contact" style={s.link}>Contact Us</Link>
            <Link to="/policy" style={s.link}>Company Policy</Link>
          </div>
        </div>
      </div>
      <div style={s.bottom}>© {year} MedRec. All rights reserved. · AI summaries are informational only — always consult your doctor.</div>
    </footer>
  )
}

const s = {
  footer: { background: '#1a2e45', color: '#fff', marginTop: 32, borderTop: '4px solid #8a6d3b' },
  inner: { width: '100%', padding: '28px clamp(12px,3vw,30px)', display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' },
  brand: { fontWeight: 700, fontSize: 22, fontFamily: 'Georgia, serif' },
  tag: { margin: '6px 0 0', color: '#c9d4e2', maxWidth: 320 },
  cols: { display: 'flex', gap: 32, flexWrap: 'wrap' },
  col: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120 },
  link: { color: '#e8eef5', textDecoration: 'none' },
  bottom: { borderTop: '1px solid rgba(255,255,255,.2)', padding: '12px clamp(12px,3vw,30px)', textAlign: 'left', fontSize: 13, color: '#9fb3c8' },
}
