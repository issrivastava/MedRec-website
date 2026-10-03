import { createContext, useContext, useEffect, useMemo } from 'react'

/* English-only UI strings (navbar, dashboard chrome, tiles, onboarding).
   AI answers cover 8 languages via the summary-language dropdown; this covers
   the buttons around them. */
const STRINGS = {
  'nav.home': 'Home', 'nav.dashboard': 'Dashboard', 'nav.records': 'Records',
  'nav.upload': 'Upload report', 'nav.billing': 'Billing', 'nav.directory': 'Directory',
  'nav.pharmacy': 'Pharmacy', 'nav.discover': 'Discover', 'nav.medicines': 'Medicines',
  'nav.illnesses': 'Illnesses', 'nav.findDoctors': 'Find Doctors', 'nav.askAi': 'Ask AI',
  'nav.profile': 'Profile', 'nav.chat': 'Chat', 'nav.logout': 'Logout',
  'nav.contact': 'Contact', 'nav.getStarted': 'Get started →',
  'nav.account': 'Account',
  'dash.welcome': 'Welcome back', 'dash.subtitle': 'Your health command center — records, visits and doctors in one calm place.',
  'tile.documents': 'Documents', 'tile.documentsSub': 'Reports, scans & labs',
  'tile.visits': 'Upcoming visits', 'tile.visitsSub': 'Booked appointments',
  'tile.alerts': 'Open alerts', 'tile.alertsSub': 'Lab values to review',
  'tile.notes': 'Doctor notes', 'tile.notesSub': 'E-prescriptions',
  'onboard.title': 'Get started in 3 steps', 'onboard.s1': 'Upload your first report',
  'onboard.s2': 'Link your doctor (AH-XXXX ID)', 'onboard.s3': 'Book your first visit',
  'onboard.dismiss': 'Dismiss — I know my way around',
  'sec.sos': 'Emergency SOS', 'sec.alerts': 'Health Alerts', 'sec.comingUp': 'Coming Up',
  'sec.doctors': 'My Doctors',
  'sec.mycare': 'My care', 'sec.doctorsChat': 'Doctors & chat', 'sec.discover': 'Discover',
  'tab.overview': 'Overview', 'tab.upload': 'Upload', 'tab.records': 'My Records',
  'tab.trends': 'Trends', 'tab.rx': 'Prescriptions', 'tab.appts': 'Appointments',
  'tab.vitals': 'Vitals', 'tab.vaccines': 'Vaccines', 'tab.share': 'Share & QR',
  'tab.chat': 'Chat Doctor', 'tab.reviews': 'My Reviews', 'tab.info': 'My Info',
  'tab.history': 'Clinical History', 'tab.medicines': 'Medicine Guide',
  'tab.illnesses': 'Illness Guide', 'tab.finddoctors': 'Find Doctors', 'tab.askai': 'Ask AI',
}

const LangContext = createContext(null)

export function LangProvider({ children }) {
  // One-time cleanup of the retired Hindi-toggle preference.
  useEffect(() => {
    try { localStorage.removeItem('medrec_lang') } catch { /* ignore */ }
  }, [])
  const value = useMemo(() => ({
    lang: 'en',
    setLang: () => {},
    t: (key) => STRINGS[key] || key,
  }), [])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}
