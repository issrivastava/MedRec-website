import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const EMERGENCY_NUMBER =
  (import.meta.env.VITE_EMERGENCY_NUMBER || '102').toString().trim() || '102'

/* Red-flag symptoms: any single one → emergency panel, stop the flow. */
const RED_FLAGS = [
  'Chest pain, pressure or tightness',
  'Trouble breathing or shortness of breath',
  'Face drooping, slurred speech or sudden weakness',
  'Fainting or unresponsiveness',
  'Heavy bleeding that will not stop',
  'Signs of severe allergy (swelling, wheezing, rash spreading fast)',
  'Thoughts of harming yourself',
  'Severe head injury or worst-ever headache',
]

/* area -> symptom chips, recommended specialty + directory search stem. */
const AREAS = [
  { key: 'general', label: 'Fever, cold, general feeling unwell', icon: '🌡️',
    symptoms: ['Fever', 'Cold / cough', 'Fatigue / weakness', 'Body ache', 'Loss of appetite'],
    specialty: 'General Physician', stem: 'general medicine',
    note: 'Your first stop for most new, undiagnosed problems.' },
  { key: 'heart', label: 'Heart, chest, blood pressure', icon: '❤️',
    symptoms: ['Chest discomfort (mild)', 'Palpitations', 'High / low BP', 'Swelling in feet'],
    specialty: 'Cardiologist', stem: 'cardio',
    note: 'Any severe chest pain or breathlessness is an emergency — call now, do not continue here.' },
  { key: 'lungs', label: 'Cough, breathing, allergies', icon: '🫁',
    symptoms: ['Long cough', 'Wheezing', 'Asthma', 'Dust allergy', 'Snoring'],
    specialty: 'Pulmonologist', stem: 'pulmo',
    note: 'Sudden severe breathlessness is an emergency.' },
  { key: 'brain', label: 'Head, nerves, dizziness', icon: '🧠',
    symptoms: ['Headache / migraine', 'Dizziness', 'Numbness / tingling', 'Seizures', 'Memory issues'],
    specialty: 'Neurologist', stem: 'neuro',
    note: 'Sudden weakness, slurred speech or fainting is an emergency.' },
  { key: 'stomach', label: 'Stomach, digestion, liver', icon: '🤢',
    symptoms: ['Acidity / gas', 'Stomach pain', 'Constipation / piles', 'Jaundice', 'Nausea'],
    specialty: 'Gastroenterologist', stem: 'gastro',
    note: 'Severe abdominal pain with vomiting or blood needs urgent care.' },
  { key: 'bones', label: 'Bones, joints, back, movement', icon: '🦴',
    symptoms: ['Joint pain', 'Back / neck pain', 'Sprain or injury', 'Arthritis', 'Sports injury'],
    specialty: 'Orthopaedic', stem: 'ortho',
    note: 'Deformed or immovable joints after injury need urgent care.' },
  { key: 'skin', label: 'Skin, hair, nails', icon: '🧴',
    symptoms: ['Rash / itching', 'Acne', 'Hair fall', 'Eczema', 'Fungal infection'],
    specialty: 'Dermatologist', stem: 'derma',
    note: 'Rapidly spreading rash with swelling or wheezing is an emergency.' },
  { key: 'eyes', label: 'Eyes and vision', icon: '👁️',
    symptoms: ['Red / itchy eyes', 'Blurry vision', 'Dry eyes', 'Stye', 'Need glasses'],
    specialty: 'Ophthalmologist', stem: 'ophthal',
    note: 'Sudden vision loss or eye injury needs urgent care.' },
  { key: 'ent', label: 'Ear, nose, throat', icon: '👂',
    symptoms: ['Ear pain / discharge', 'Blocked nose / sinus', 'Sore throat', 'Hoarseness', 'Hearing loss'],
    specialty: 'ENT Specialist', stem: 'ent',
    note: '' },
  { key: 'urinary', label: 'Urine, kidney, prostate', icon: '💧',
    symptoms: ['Burning urination', 'Frequent urination', 'Kidney pain', 'Blood in urine'],
    specialty: 'Urologist', stem: 'uro',
    note: 'Fever with back pain and painful urination should be seen today.' },
  { key: 'kidney', label: 'Kidney disease, dialysis, swelling', icon: '🫘',
    symptoms: ['Known kidney disease', 'Swelling / puffiness', 'Low urine output'],
    specialty: 'Nephrologist', stem: 'nephro',
    note: '' },
  { key: 'women', label: "Women's health, pregnancy", icon: '🤰',
    symptoms: ['Missed / painful periods', 'Pregnancy care', 'PCOS', 'White discharge', 'Menopause'],
    specialty: 'Gynaecologist', stem: 'gynaecology',
    note: 'Heavy bleeding in pregnancy is an emergency.' },
  { key: 'child', label: "Child's health (under 14)", icon: '🧒',
    symptoms: ['Fever in child', 'Cold / cough', 'Vaccination due', 'Growth concern', 'Stomach upset'],
    specialty: 'Paediatrician', stem: 'paed',
    note: 'Children are best seen by a child specialist.' },
  { key: 'dental', label: 'Teeth, gums, mouth', icon: '🦷',
    symptoms: ['Tooth pain', 'Bleeding gums', 'Cavity', 'Bad breath', 'Mouth ulcer'],
    specialty: 'Dentist', stem: 'dent',
    note: 'Facial swelling with fever should be seen today.' },
  { key: 'mind', label: 'Sleep, stress, mood, habits', icon: '😟',
    symptoms: ['Anxiety / worry', 'Low mood', 'Sleeplessness', 'Overthinking', 'Addiction concern'],
    specialty: 'Psychiatrist', stem: 'psychi',
    note: 'If you may act on thoughts of self-harm, call emergency now or a trusted person.' },
  { key: 'hormone', label: 'Sugar, thyroid, weight, hormones', icon: '🍬',
    symptoms: ['Diabetes / sugar', 'Thyroid', 'Weight gain / loss', 'Excess thirst / urination'],
    specialty: 'Endocrinologist', stem: 'endo',
    note: 'Very high sugar with vomiting, confusion or fruity breath is an emergency.' },
  { key: 'blood', label: 'Weakness, paleness, low haemoglobin', icon: '🩸',
    symptoms: ['Tiredness', 'Pale skin', 'Dizziness on standing', 'Known anaemia'],
    specialty: 'General Physician', stem: 'general medicine',
    note: 'Your doctor may refer you to a blood specialist after basic tests.' },
  { key: 'surgery', label: 'Lumps, hernia, piles surgery, operations', icon: '🔪',
    symptoms: ['New lump / swelling', 'Hernia', 'Piles / fissure', 'Need surgery opinion'],
    specialty: 'General Surgery', stem: 'general surgery',
    note: '' },
]

const DURATIONS = [
  { key: 'hours', label: 'Started hours ago', urgency: 'Try to be seen within 24 hours.' },
  { key: 'days', label: 'A few days', urgency: 'Book in the next few days.' },
  { key: 'weeks', label: 'Weeks or longer', urgency: 'Book this week — please do not wait longer.' },
]

export default function Triage() {
  const [flags, setFlags] = useState([])
  const [areaKey, setAreaKey] = useState('')
  const [picked, setPicked] = useState([])
  const [duration, setDuration] = useState('days')
  const [forChild, setForChild] = useState(false)

  const toggleFlag = (f) => setFlags((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]))
  const toggleSymptom = (s) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  const area = useMemo(() => AREAS.find((a) => a.key === areaKey) || null, [areaKey])
  const hasEmergency = flags.length > 0
  const dur = DURATIONS.find((d) => d.key === duration)
  const specialty = forChild && areaKey !== 'child' ? 'Paediatrician' : area?.specialty
  const stem = forChild && areaKey !== 'child' ? 'paed' : area?.stem

  return (
    <div className="page-narrow">
      <p className="kicker">Symptom guide</p>
      <h1 className="h2-min">Which doctor should I see?</h1>
      <p className="sub-min">Answer 3 quick questions. This points you to the right specialty — <b>it is not a diagnosis</b>.</p>

      {/* STEP 1 — red flags */}
      <section className="card-min">
        <h3 className="sec-head"><span className="tile t-rose">🚨</span> 1 · Any of these right now?</h3>
        <div className="chip-grid">
          {RED_FLAGS.map((f) => (
            <button key={f} type="button" onClick={() => toggleFlag(f)}
              className={`chip-pick${flags.includes(f) ? ' picked-red' : ''}`}
              aria-pressed={flags.includes(f)}>
              {f}
            </button>
          ))}
        </div>
        {hasEmergency && (
          <div className="emg-panel" role="alert">
            <b>🚨 This needs emergency care — do not wait.</b>
            <p>Call <a href={`tel:${EMERGENCY_NUMBER}`}>{EMERGENCY_NUMBER}</a> (ambulance) now,
              or go to the nearest emergency room. You can inform your doctor after.</p>
            <Link to="/contact" className="btn-min">Tell us after →</Link>
          </div>
        )}
      </section>

      {!hasEmergency && (
        <>
          {/* STEP 2 — area */}
          <section className="card-min">
            <h3 className="sec-head"><span className="tile t-teal">🗂️</span> 2 · Where is the problem?</h3>
            <div className="chip-grid">
              {AREAS.map((a) => (
                <button key={a.key} type="button" onClick={() => { setAreaKey(a.key); setPicked([]) }}
                  className={`chip-pick${areaKey === a.key ? ' picked' : ''}`}
                  aria-pressed={areaKey === a.key}>
                  <span aria-hidden>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </section>

          {area && (
            <section className="card-min">
              <h3 className="sec-head"><span className="tile t-blue">🩺</span> 3 · What do you feel? + since when?</h3>
              <div className="chip-grid">
                {area.symptoms.map((s) => (
                  <button key={s} type="button" onClick={() => toggleSymptom(s)}
                    className={`chip-pick${picked.includes(s) ? ' picked' : ''}`}
                    aria-pressed={picked.includes(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="tri-row">
                <label>Duration
                  <select value={duration} onChange={(e) => setDuration(e.target.value)} style={s.input}>
                    {DURATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </label>
                <label className="check-line">
                  <input type="checkbox" checked={forChild} onChange={(e) => setForChild(e.target.checked)} />
                  This is for a child (under 14)
                </label>
              </div>

              {/* RESULT */}
              <div className="tri-result">
                <p className="kicker">Suggested specialty</p>
                <h2 className="h2-min" style={{ margin: '0 0 6px' }}>{specialty}</h2>
                {picked.length > 0 && <p style={{ margin: '0 0 6px' }}>Based on: <b>{picked.join(', ')}</b> · {dur.label.toLowerCase()}.</p>}
                <p style={{ margin: '0 0 6px' }}>⏱️ {dur.urgency}</p>
                {area.note && <p style={{ margin: '0 0 10px', color: '#5d6b7a', fontSize: 14 }}>ℹ️ {area.note}</p>}
                {forChild && areaKey !== 'child' && (
                  <p style={{ margin: '0 0 10px', color: '#5d6b7a', fontSize: 14 }}>
                    ℹ️ For children we suggest a Paediatrician first — you can also see a {area.specialty} after.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/find-doctors?specialty=${encodeURIComponent(stem)}`} className="btn-min-primary">
                    Find {specialty} →
                  </Link>
                  <Link to="/ask-ai" className="btn-min">Ask AI about it</Link>
                </div>
                <p className="fine-print">This guide is informational only and is not a diagnosis. If anything worsens, seek care immediately.</p>
              </div>
            </section>
          )}
        </>
      )}

      <p className="fine-print" style={{ marginTop: 12 }}>
        Emergency? Call <a href={`tel:${EMERGENCY_NUMBER}`}>{EMERGENCY_NUMBER}</a>. MedRec guidance never replaces a doctor's judgement.
      </p>
    </div>
  )
}

const s = {
  input: { padding: 8, fontSize: 14, minWidth: 0 },
}
