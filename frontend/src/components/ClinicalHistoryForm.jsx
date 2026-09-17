import { useEffect, useState } from 'react'

const FIELDS = [
  { key: 'height_cm', label: 'Height (cm)', type: 'number', placeholder: 'e.g. 172' },
  { key: 'weight_kg', label: 'Weight (kg)', type: 'number', placeholder: 'e.g. 68' },
  { key: 'marital_status', label: 'Marital status', placeholder: 'Single / Married…' },
  { key: 'occupation', label: 'Occupation', placeholder: 'e.g. Teacher' },
  { key: 'smoking_status', label: 'Smoking', type: 'select', options: ['', 'Never', 'Former', 'Occasional', 'Daily'] },
  { key: 'alcohol_use', label: 'Alcohol', type: 'select', options: ['', 'Never', 'Occasional', 'Weekly', 'Daily'] },
  { key: 'diet', label: 'Diet', type: 'select', options: ['', 'Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian'] },
  { key: 'activity_level', label: 'Activity', type: 'select', options: ['', 'Sedentary', 'Light', 'Moderate', 'Active', 'Athlete'] },
]

const AREAS = [
  { key: 'past_illnesses', label: 'Past illnesses', placeholder: 'e.g. Typhoid (2019), Asthma since childhood…' },
  { key: 'surgeries', label: 'Surgeries / hospitalizations', placeholder: 'e.g. Appendectomy 2021…' },
  { key: 'current_medications', label: 'Current medications', placeholder: 'e.g. Metformin 500mg daily…' },
  { key: 'immunizations', label: 'Immunizations', placeholder: 'e.g. COVID 2 doses, Tetanus 2022…' },
  { key: 'family_history_text', label: 'Family history summary', placeholder: 'e.g. Father diabetic, mother hypertensive…' },
  { key: 'menstrual_history', label: 'Menstrual / obstetric (if applicable)', placeholder: 'e.g. Regular, 2 pregnancies…' },
  { key: 'mental_health', label: 'Mental health / lifestyle notes', placeholder: 'e.g. Sleep, stress, anxiety…' },
]

/* Reusable detailed clinical history form for self OR a family profile. */
export default function ClinicalHistoryForm({ initial, onSave, saving }) {
  const [form, setForm] = useState({})

  useEffect(() => { setForm(initial || {}) }, [initial])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value === '' ? undefined : e.target.value })

  const bmi = form.height_cm && form.weight_kg
    ? (Number(form.weight_kg) / Math.pow(Number(form.height_cm) / 100, 2)).toFixed(1)
    : null

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(form) }}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
    >
      <div className="form-grid">
        {FIELDS.map((f) => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, minWidth: 0 }}>
            <span style={{ fontWeight: 700 }}>{f.label}{bmi && f.key === 'weight_kg' ? ` (BMI ${bmi})` : ''}</span>
            {f.type === 'select' ? (
              <select value={form[f.key] ?? ''} onChange={set(f.key)} style={s.input}>
                {f.options.map((o) => <option key={o} value={o}>{o === '' ? `${f.label}…` : o}</option>)}
              </select>
            ) : (
              <input type={f.type || 'text'} placeholder={f.placeholder} value={form[f.key] ?? ''} onChange={set(f.key)} style={s.input} />
            )}
          </label>
        ))}
      </div>
      {AREAS.map((a) => (
        <label key={a.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>{a.label}</span>
          <textarea placeholder={a.placeholder} value={form[a.key] ?? ''} onChange={set(a.key)} rows={2} style={s.input} />
        </label>
      ))}
      <div><button type="submit" disabled={saving} style={s.btn}>{saving ? 'Saving…' : 'Save clinical history'}</button></div>
    </form>
  )
}

const s = {
  input: { padding: 8, fontSize: 14, minWidth: 0, maxWidth: '100%' },
  btn: { padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 },
}
