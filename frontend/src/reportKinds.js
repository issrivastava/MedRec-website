// Shared report taxonomy — mirrors backend/app/services/report_kinds.py
// category -> kinds. Keep both files in sync when adding X-Ray/CBC/MRI/TSH/LFT etc.

export const REPORT_CATEGORIES = {
  lab: {
    label: 'Pathology Lab',
    kinds: [
      { key: 'cbc', label: 'CBC (Complete Blood Count)', icon: '🩸', tile: 't-rose' },
      { key: 'tsh', label: 'TSH / Thyroid', icon: '🦋', tile: 't-violet' },
      { key: 'lft', label: 'LFT (Liver Function)', icon: '🧪', tile: 't-teal' },
      { key: 'kft', label: 'KFT (Kidney Function)', icon: '🧪', tile: 't-teal' },
      { key: 'lipid', label: 'Lipid Profile', icon: '🧬', tile: 't-amber' },
      { key: 'hba1c', label: 'HbA1c / Diabetes', icon: '🍬', tile: 't-amber' },
      { key: 'blood_sugar', label: 'Blood Sugar (Fasting/PP)', icon: '🍬', tile: 't-amber' },
      { key: 'urine', label: 'Urine Routine', icon: '🧪', tile: 't-teal' },
      { key: 'vitamin_d', label: 'Vitamin D / B12', icon: '☀️', tile: 't-amber' },
      { key: 'esr_crp', label: 'ESR / CRP (Inflammation)', icon: '🔥', tile: 't-rose' },
      { key: 'other_lab', label: 'Other Lab Test', icon: '🧪', tile: 't-teal' },
    ],
  },
  imaging: {
    label: 'Radiology / Imaging',
    kinds: [
      { key: 'xray', label: 'X-Ray', icon: '🩻', tile: 't-amber' },
      { key: 'mri', label: 'MRI', icon: '🧲', tile: 't-blue' },
      { key: 'ct', label: 'CT Scan', icon: '🖥️', tile: 't-blue' },
      { key: 'ultrasound', label: 'Ultrasound / Sonography', icon: '📡', tile: 't-teal' },
      { key: 'mammography', label: 'Mammography', icon: '🎗️', tile: 't-rose' },
      { key: 'pet', label: 'PET Scan', icon: '☢️', tile: 't-violet' },
      { key: 'dexa', label: 'DEXA / Bone Density', icon: '🦴', tile: 't-orange' },
      { key: 'other_imaging', label: 'Other Imaging', icon: '🖼️', tile: 't-blue' },
    ],
  },
  cardiology: {
    label: 'Cardiac',
    kinds: [
      { key: 'ecg', label: 'ECG', icon: '❤️', tile: 't-rose' },
      { key: 'echo', label: 'Echo / 2D-Echo', icon: '💓', tile: 't-rose' },
      { key: 'stress_test', label: 'Stress Test / TMT', icon: '🏃', tile: 't-orange' },
      { key: 'holter', label: 'Holter Monitor', icon: '⌚', tile: 't-blue' },
    ],
  },
  prescription: {
    label: 'Prescriptions & Clinical',
    kinds: [
      { key: 'prescription', label: 'Prescription', icon: '🧾', tile: 't-violet' },
      { key: 'discharge_summary', label: 'Discharge Summary', icon: '🏥', tile: 't-blue' },
      { key: 'consultation', label: 'Consultation Note', icon: '🩺', tile: 't-teal' },
      { key: 'vaccination', label: 'Vaccination Record', icon: '💉', tile: 't-green' },
      { key: 'operative_note', label: 'Operative / Procedure Note', icon: '🔪', tile: 't-orange' },
      { key: 'biopsy', label: 'Biopsy / Histopathology', icon: '🔬', tile: 't-violet' },
    ],
  },
  other: {
    label: 'Other',
    kinds: [
      { key: 'general_report', label: 'General Report', icon: '📄', tile: 't-blue' },
      { key: 'scan_copy', label: 'Scanned Copy', icon: '📑', tile: 't-orange' },
      { key: 'other', label: 'Other', icon: '📁', tile: 't-orange' },
    ],
  },
}

export const KIND_META = {}
Object.values(REPORT_CATEGORIES).forEach((cat) => {
  cat.kinds.forEach((k) => { KIND_META[k.key] = k })
})

// Mirrors backend/app/services/report_kinds.py — kind is authoritative,
// Type is DERIVED. Keep in sync (or fetch GET /api/documents/taxonomy).
export const KIND_TO_CATEGORY = {}
export const KIND_TO_DOC_TYPE = {
  cbc: 'lab', tsh: 'lab', lft: 'lab', kft: 'lab', lipid: 'lab',
  hba1c: 'lab', blood_sugar: 'lab', urine: 'lab', vitamin_d: 'lab',
  esr_crp: 'lab', other_lab: 'lab',
  xray: 'scan', mri: 'scan', ct: 'scan', ultrasound: 'scan',
  mammography: 'scan', pet: 'scan', dexa: 'scan', other_imaging: 'scan',
  ecg: 'report', echo: 'report', stress_test: 'report', holter: 'report',
  prescription: 'prescription', discharge_summary: 'prescription',
  consultation: 'report', vaccination: 'report', operative_note: 'report',
  biopsy: 'lab',
  general_report: 'report', scan_copy: 'scan', other: 'other',
}
Object.entries(REPORT_CATEGORIES).forEach(([cat, spec]) => {
  spec.kinds.forEach((k) => { KIND_TO_CATEGORY[k.key] = cat })
})

export const DOC_TYPES = {
  lab: 'Lab',
  scan: 'Scan / Imaging',
  report: 'Report (ECG, Echo, clinical…)',
  prescription: 'Prescription',
  other: 'Other',
}

// Only these carry numeric lab values for "What changed" trends.
export const COMPARABLE_KINDS = new Set([
  'cbc', 'tsh', 'lft', 'kft', 'lipid', 'hba1c',
  'blood_sugar', 'urine', 'vitamin_d', 'esr_crp', 'other_lab', 'biopsy',
])
export const PRESCRIPTION_KINDS = new Set(['prescription', 'discharge_summary'])

export function docTypeForKind(kind) {
  return KIND_TO_DOC_TYPE[kind] || null
}

export function categoryForKind(kind) {
  return KIND_TO_CATEGORY[kind] || null
}

export function isComparableDoc(d) {
  if (!d) return false
  if (d.report_kind) return COMPARABLE_KINDS.has(d.report_kind)
  // Legacy unlabelled docs: lab/scan types with extracted text may still trend
  return d.doc_type === 'lab'
}

export function isPrescriptionDoc(d) {
  if (!d) return false
  if (d.report_kind) return PRESCRIPTION_KINDS.has(d.report_kind)
  return d.doc_type === 'prescription'
}

export function kindsForCategory(category) {
  if (!category) return Object.values(KIND_META)
  return REPORT_CATEGORIES[category]?.kinds || []
}

export function kindLabel(kind) {
  return KIND_META[kind]?.label || kind || ''
}

export function kindIcon(kind, fallback = ['📄', 't-blue']) {
  const m = KIND_META[kind]
  return m ? [m.icon, m.tile] : fallback
}
