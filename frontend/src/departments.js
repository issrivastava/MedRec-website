/* Department guide: what each department does + how it works.
   Shared by the Need Help widget and the Find Doctors page. */

export const DEPARTMENTS = [
  { name: 'Cardiology', match: ['cardiology', 'cardiac sciences', 'cardio'],
    purpose: 'Diagnosis and treatment of heart and blood-vessel diseases — chest pain, blood pressure, cholesterol, heart attack care and recovery.',
    how: 'Consultation + ECG, 2D echo, stress test or angiography as needed; treatment ranges from medicines and lifestyle plans to angioplasty, stents or bypass referral.' },
  { name: 'Neurology', match: ['neurology', 'neuro', 'neurosciences'],
    purpose: 'Brain, spinal cord and nerve disorders — migraine, epilepsy, stroke, Parkinson’s, numbness, memory problems.',
    how: 'Neurological examination + MRI/CT, EEG or nerve-conduction studies; mostly medicine-based treatment with rehab and follow-ups.' },
  { name: 'Neurosurgery', match: ['neurosurgery', 'neuro and spine', 'neuro surgeon'],
    purpose: 'Surgical treatment of brain, spine and nerve conditions — tumors, slipped disc, head injury, spinal compression.',
    how: 'Scan-based surgical planning (MRI/CT); procedures from keyhole spine surgery to major brain surgery, with ICU and physiotherapy after.' },
  { name: 'Orthopaedics', match: ['orthopaedics', 'orthopedics', 'orthopedician', 'ortho'],
    purpose: 'Bones, joints, muscles and ligaments — fractures, arthritis, knee/back pain, sports injuries, joint replacement.',
    how: 'X-ray/MRI assessment; treatment spans pain relief and physiotherapy to plaster, arthroscopy or hip/knee replacement surgery.' },
  { name: 'Spine Surgery', match: ['spine surgery'],
    purpose: 'Dedicated spine care — slipped disc, sciatica, spinal stenosis, scoliosis, spinal injuries.',
    how: 'MRI-based diagnosis; options from targeted injections and physiotherapy to micro-discectomy or spinal fusion.' },
  { name: 'Gastroenterology', match: ['gastroenterology', 'gastro', 'hepatobiliary'],
    purpose: 'Digestive system, liver and pancreas — acidity, ulcers, jaundice, hepatitis, IBS, gallstones, liver disease.',
    how: 'Consultation + ultrasound, endoscopy/colonoscopy or LFT; medicines, diet plans, or endoscopic/surgical procedures.' },
  { name: 'Nephrology', match: ['nephrology', 'renal sciences'],
    purpose: 'Kidney health — kidney failure, dialysis care, kidney stones (medical side), protein in urine, electrolyte problems.',
    how: 'Blood/urine tests (creatinine, eGFR) + ultrasound; treatment via medicines, diet control, dialysis planning or transplant referral.' },
  { name: 'Urology', match: ['urology'],
    purpose: 'Urinary tract and male reproductive health — kidney stones (surgical side), prostate, urinary infection, incontinence.',
    how: 'Ultrasound/uroflow tests; medicines, lithotripsy (stone breaking) or keyhole/open surgery as needed.' },
  { name: 'Endocrinology', match: ['endocrinology', 'endocrine'],
    purpose: 'Hormone disorders — thyroid, diabetes (hormonal side), PCOS-related hormones, growth and pituitary issues.',
    how: 'Hormone blood panels (TSH, HbA1c, etc.); treatment is usually precise daily medicines with periodic re-testing.' },
  { name: 'Diabetology', match: ['diabetology', 'diabetes care'],
    purpose: 'Focused diabetes care — blood-sugar control, diet planning, complication screening (eyes, feet, kidneys).',
    how: 'Sugar logs + HbA1c; personalised diet, exercise, oral medicines or insulin, with regular complication checks.' },
  { name: 'Pulmonary Medicine', match: ['pulmonary', 'pulmonology', 'respiratory'],
    purpose: 'Lungs and breathing — asthma, COPD, TB, pneumonia, chronic cough, sleep apnoea, post-COVID lung issues.',
    how: 'Chest X-ray/CT + lung-function test (PFT/spirometry); inhalers, medicines, breathing rehab or sleep studies.' },
  { name: 'General Medicine', match: ['general medicine', 'internal medicine', 'general physician', 'general', 'physician'],
    purpose: 'First-stop adult care — fever, infections, diabetes, blood pressure, dengue, typhoid and undiagnosed symptoms.',
    how: 'Clinical check-up + basic blood tests; medicines and lifestyle advice, with referral to a specialist if needed.' },
  { name: 'Infectious Diseases', match: ['infectious'],
    purpose: 'Hard-to-treat and contagious infections — dengue, typhoid, TB, COVID, hepatitis, recurring fevers.',
    how: 'Targeted cultures/serology (NS1, Widal, CBNAAT…); precise antibiotics/antivirals plus isolation guidance.' },
  { name: 'Infectious Diseases', match: ['infectious', 'infection'],
    purpose: 'Hard-to-treat and contagious infections — dengue, typhoid, TB, COVID, hepatitis and recurring unexplained fevers.',
    how: 'Targeted cultures and serology (NS1, Widal, CBNAAT…); precise antibiotics/antivirals plus isolation guidance.' },
  { name: 'Dermatology', match: ['dermatology', 'dermatologist', 'skin', 'cosmetology'],
    purpose: 'Skin, hair and nails — acne, eczema, psoriasis, fungal infections, hair fall, allergies, cosmetic concerns.',
    how: 'Visual/dermoscope examination, sometimes skin biopsy; creams, oral medicines, or laser/light procedures.' },
  { name: 'ENT', match: ['ent', 'ear', 'nose', 'throat', 'laryngology'],
    purpose: 'Ear, nose and throat — hearing loss, sinusitis, tonsils, vertigo, voice and swallowing problems.',
    how: 'Endoscopic ear/nose/throat check + audiometry; medicines, minor procedures, or surgeries like septoplasty.' },
  { name: 'Ophthalmology', match: ['ophthalmology', 'ophthalmologist', 'eye'],
    purpose: 'Eye care — vision correction, cataract, glaucoma, diabetic retina checks, eye infections and injuries.',
    how: 'Vision testing + slit-lamp and retina examination; glasses, medicines, laser treatment or cataract surgery.' },
  { name: 'Gynaecology & Obstetrics', match: ['gynae', 'obstetrics', 'gynecology', 'pregnancy', 'women'],
    purpose: 'Women’s health and pregnancy — periods, PCOS, prenatal check-ups, delivery, menopause care.',
    how: 'Ultrasound + hormone/blood tests; medicines, minor procedures, or delivery/caesarean and gynaec surgeries.' },
  { name: 'Paediatrics', match: ['paediatrics', 'pediatrics', 'pediatrician', 'paediatric', 'child', 'baby'],
    purpose: 'Children’s health — growth, vaccinations, fevers, infections, nutrition and development tracking.',
    how: 'Growth-chart review + child-friendly examination; vaccines, medicines, and parent guidance on diet and milestones.' },
  { name: 'Psychiatry', match: ['psychiatry', 'psychiatrist', 'mental health', 'psychology'],
    purpose: 'Mental health — depression, anxiety, sleep disorders, stress, addiction, behavioural issues.',
    how: 'Confidential counselling-based assessment; therapy, lifestyle restructuring and medicines only when needed.' },
  { name: 'Oncology', match: ['oncology', 'oncologist', 'cancer', 'tumor'],
    purpose: 'Cancer care — detection, staging and treatment of solid tumors and blood cancers.',
    how: 'Biopsy + PET-CT/MRI staging by a tumor board; chemotherapy, radiation, surgery or targeted therapy in combination.' },
  { name: 'General Surgery', match: ['general surgery', 'general surgeon', 'minimal access surgery', 'laparoscopic'],
    purpose: 'Operative care for hernia, appendix, gallbladder, piles, thyroid lumps, minor injuries and biopsies.',
    how: 'Ultrasound/CT workup; mostly keyhole (laparoscopic) day-care procedures with quick recovery.' },
  { name: 'Plastic Surgery', match: ['plastic'],
    purpose: 'Reconstruction and cosmetic correction — burns, scars, cleft lip, hand injuries, cosmetic reshaping.',
    how: 'Assessment and staged surgical plan; skin grafts, flaps or cosmetic procedures with scar-care follow-up.' },
  { name: 'Rheumatology', match: ['rheumatology', 'rheumatologist', 'arthritis'],
    purpose: 'Joint pain and autoimmune disease — rheumatoid arthritis, lupus, gout, ankylosing spondylitis.',
    how: 'Autoimmune blood panels + joint imaging; long-term disease-modifying medicines with physiotherapy.' },
  { name: 'Nephrology & Dialysis', match: ['dialysis'],
    purpose: 'Ongoing kidney-failure support through scheduled dialysis sessions and fluid/diet management.',
    how: 'Regular dialysis sittings (usually 2–3 per week) with blood monitoring and nephrologist review.' },
  { name: 'Dentistry', match: ['dentistry', 'dentist', 'dental', 'teeth'],
    purpose: 'Teeth and gums — cavities, root canals, braces, implants, gum disease and oral surgery.',
    how: 'Dental X-ray examination; fillings, scaling, root canals, extractions, braces or implants.' },
  { name: 'Vascular Surgery', match: ['vascular'],
    purpose: 'Blood-vessel surgery — varicose veins, blocked leg arteries, diabetic foot circulation, aneurysms.',
    how: 'Doppler/angiography mapping; medicines, laser/ablation procedures or bypass surgery.' },
  { name: 'Critical Care', match: ['critical care', 'icu', 'emergency'],
    purpose: 'Round-the-clock intensive care for serious illness, post-surgery recovery and emergencies.',
    how: 'ICU admission with continuous monitoring, ventilator and life-support care by intensivists.' },
  { name: 'Cardiovascular Thoracic Surgery', match: ['cardiovascular thoracic', 'thoracic surgery', 'ctvs'],
    purpose: 'Heart and chest surgery — bypass, valve replacement, lung and chest-wall operations.',
    how: 'Angiography/CT-based surgical planning; open or minimally invasive chest surgery with ICU recovery.' },
]

/* Find the guide entry for a backend specialty name (or its tags). */
export function findDepartment(specialtyName, tags = []) {
  const hay = `${specialtyName || ''} ${(tags || []).join(' ')}`.toLowerCase()
  // Prefer the most specific (longest) keyword match.
  let best = null
  let bestLen = 0
  for (const d of DEPARTMENTS) {
    for (const k of d.match) {
      if (k && hay.includes(k) && k.length > bestLen) {
        best = d
        bestLen = k.length
      }
    }
  }
  return best
}
