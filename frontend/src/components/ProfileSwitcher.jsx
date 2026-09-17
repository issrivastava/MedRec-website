import { useProfile } from '../context/ProfileContext'

/* Profile switcher: Me + every family member in the same account.
   Used on patient dashboard + timeline so all lists act per-profile. */
export default function ProfileSwitcher({ compact = false }) {
  const { family, activeId, activeName, setActive, reloadFamily } = useProfile()

  return (
    <div style={s.wrap}>
      <label style={s.label}>Viewing profile:</label>
      <select
        value={activeId || ''}
        onChange={(e) => setActive(e.target.value)}
        style={s.select}
        title="Switch between yourself and family members"
      >
        <option value="">🧍 Me</option>
        {family.map((m) => (
          <option key={m.id} value={m.id}>
            👪 {m.name}{m.relation ? ` (${m.relation})` : ''}
          </option>
        ))}
      </select>
      {!compact && (
        <span style={s.hint}>
          Showing records for <b>{activeName}</b> · {family.length} familymember(s) ·{' '}
          <button type="button" onClick={reloadFamily} style={s.linkBtn}>Refresh</button>
        </span>
      )}
    </div>
  )
}

const s = {
  wrap: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  label: { fontWeight: 700, fontSize: 14 },
  select: { padding: '8px 10px', fontSize: 14, minWidth: 'min(260px,100%)', maxWidth: '100%' },
  hint: { fontSize: 13, color: '#5d6b7a' },
  linkBtn: { background: 'none', border: 0, color: '#1e3a5f', cursor: 'pointer', padding: 0, fontWeight: 700 },
}
