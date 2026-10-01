import { createContext, useContext, useMemo, useState } from 'react'

/* Minimal EN/HI UI strings (navbar, dashboard chrome, tiles, onboarding).
   AI answers already cover 10 languages; this covers the buttons around them.
   Persisted in localStorage; defaults to English. */
const STRINGS = {
  en: {
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
  },
  hi: {
    'nav.home': 'होम', 'nav.dashboard': 'डैशबोर्ड', 'nav.records': 'रिकॉर्ड',
    'nav.upload': 'रिपोर्ट अपलोड करें', 'nav.billing': 'बिलिंग', 'nav.directory': 'डायरेक्टरी',
    'nav.pharmacy': 'फार्मेसी', 'nav.discover': 'जानें', 'nav.medicines': 'दवाइयां',
    'nav.illnesses': 'बीमारियां', 'nav.findDoctors': 'डॉक्टर खोजें', 'nav.askAi': 'AI से पूछें',
    'nav.profile': 'प्रोफ़ाइल', 'nav.chat': 'चैट', 'nav.logout': 'लॉगआउट',
    'nav.contact': 'संपर्क', 'nav.getStarted': 'शुरू करें →',
    'nav.account': 'खाता',
    'dash.welcome': 'वापस स्वागत है', 'dash.subtitle': 'आपका स्वास्थ्य केंद्र — रिकॉर्ड, मुलाकातें और डॉक्टर एक ही जगह।',
    'tile.documents': 'दस्तावेज़', 'tile.documentsSub': 'रिपोर्ट, स्कैन व लैब',
    'tile.visits': 'आगामी मुलाकातें', 'tile.visitsSub': 'बुक की गई मुलाकातें',
    'tile.alerts': 'खुले अलर्ट', 'tile.alertsSub': 'जांचने योग्य लैब मान',
    'tile.notes': 'डॉक्टर के नोट्स', 'tile.notesSub': 'ई-प्रिस्क्रिप्शन',
    'onboard.title': '3 चरणों में शुरुआत करें', 'onboard.s1': 'अपनी पहली रिपोर्ट अपलोड करें',
    'onboard.s2': 'अपने डॉक्टर को जोड़ें (AH-XXXX ID)', 'onboard.s3': 'अपनी पहली मुलाकात बुक करें',
    'onboard.dismiss': 'हटाएं — मुझे सब पता है',
    'sec.sos': 'आपातकालीन SOS', 'sec.alerts': 'स्वास्थ्य अलर्ट', 'sec.comingUp': 'आगामी',
    'sec.doctors': 'मेरे डॉक्टर',
    'sec.mycare': 'मेरी देखभाल', 'sec.doctorsChat': 'डॉक्टर व चैट', 'sec.discover': 'जानें',
    'tab.overview': 'अवलोकन', 'tab.upload': 'अपलोड', 'tab.records': 'मेरे रिकॉर्ड',
    'tab.trends': 'रुझान', 'tab.rx': 'नुस्खे', 'tab.appts': 'मुलाकातें',
    'tab.vitals': 'वाइटल्स', 'tab.vaccines': 'टीके', 'tab.share': 'शेयर व QR',
    'tab.chat': 'डॉक्टर से चैट', 'tab.reviews': 'मेरी समीक्षाएं', 'tab.info': 'मेरी जानकारी',
    'tab.history': 'चिकित्सा इतिहास', 'tab.medicines': 'दवा मार्गदर्शिका',
    'tab.illnesses': 'रोग मार्गदर्शिका', 'tab.finddoctors': 'डॉक्टर खोजें', 'tab.askai': 'AI से पूछें',
  },
}

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('medrec_lang') === 'hi' ? 'hi' : 'en' } catch { return 'en' }
  })
  const value = useMemo(() => ({
    lang,
    setLang: (l) => {
      const v = l === 'hi' ? 'hi' : 'en'
      setLang(v)
      try { localStorage.setItem('medrec_lang', v) } catch { /* ignore */ }
    },
    t: (key) => (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key,
  }), [lang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}
