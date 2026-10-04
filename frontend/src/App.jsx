import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProfileProvider } from './context/ProfileContext'
import { LangProvider } from './i18n.jsx'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import NeedHelp from './components/NeedHelp'
import { SiteFloaters } from './components/SiteChrome'
import ProtectedRoute from './components/ProtectedRoute'
import SessionTimeout from './components/SessionTimeout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

/* Route splitting: Landing/Login stay in the initial bundle for a fast
   first paint (and Login gates on isFirebaseConfigured WITHOUT loading the
   Firebase SDK — see firebase.js loadFirebase). Everything else loads on
   demand when the route is first visited. */
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const PatientDashboard = lazy(() => import('./pages/PatientDashboard'))
const DoctorLayout = lazy(() => import('./pages/doctor/DoctorLayout'))
const DoctorOverview = lazy(() => import('./pages/doctor/Overview'))
const DoctorPatients = lazy(() => import('./pages/doctor/Patients'))
const DoctorPatientRecords = lazy(() => import('./pages/doctor/PatientRecords'))
const DoctorSchedule = lazy(() => import('./pages/doctor/Schedule'))
const DoctorQueue = lazy(() => import('./pages/doctor/Queue'))
const DoctorPrescriptions = lazy(() => import('./pages/doctor/Prescriptions'))
const DoctorEmergency = lazy(() => import('./pages/doctor/Emergency'))
const DoctorRisk = lazy(() => import('./pages/doctor/Risk'))
const DoctorChat = lazy(() => import('./pages/doctor/Chat'))
const DoctorCare = lazy(() => import('./pages/doctor/Care'))
const DoctorPractice = lazy(() => import('./pages/doctor/Practice'))
const DoctorEngage = lazy(() => import('./pages/doctor/Engage'))
const DoctorInsights = lazy(() => import('./pages/doctor/Insights'))
const DoctorGrowth = lazy(() => import('./pages/doctor/Growth'))
const DoctorSafety = lazy(() => import('./pages/doctor/Safety'))
const DoctorAlerts = lazy(() => import('./pages/doctor/Alerts'))
const DoctorRatings = lazy(() => import('./pages/doctor/Ratings'))
const DoctorProfilePage = lazy(() => import('./pages/doctor/DoctorProfile'))
const Contact = lazy(() => import('./pages/Contact'))
const Triage = lazy(() => import('./pages/Triage'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Profile = lazy(() => import('./pages/Profile'))
const Policy = lazy(() => import('./pages/Policy'))
const Medicines = lazy(() => import('./pages/Medicines'))
const Illnesses = lazy(() => import('./pages/Illnesses'))
const FindDoctors = lazy(() => import('./pages/FindDoctors'))
const AskAI = lazy(() => import('./pages/AskAI'))
const Upload = lazy(() => import('./pages/Upload'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Admin = lazy(() => import('./pages/Admin'))
const PublicShare = lazy(() => import('./pages/PublicShare'))
const Billing = lazy(() => import('./pages/Billing'))
const Pharmacy = lazy(() => import('./pages/Pharmacy'))
const StaffDirectory = lazy(() => import('./pages/StaffDirectory'))

function PageFallback() {
  return <div className="card">Loading…</div>
}

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
      <LangProvider>
      <BrowserRouter>
        <SessionTimeout />
        <div className="app-shell">
          <Navbar />
          <main className="app-main">
            <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public home page: read about features first, then login */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              {/* Register page removed — Google sign-in on /login auto-creates patient/doctor accounts */}
              <Route path="/register" element={<Navigate to="/login" replace />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/policy" element={<Policy />} />
              <Route path="/triage" element={<Triage />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/s/:token" element={<PublicShare />} />
              {/* Features require Google login — guests bounce to /login */}
              <Route path="/medicines" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><Medicines /></ProtectedRoute>} />
              <Route path="/illnesses" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><Illnesses /></ProtectedRoute>} />
              <Route path="/diseases" element={<Navigate to="/illnesses" replace />} />
              <Route path="/find-doctors" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><FindDoctors /></ProtectedRoute>} />
              <Route path="/ask-ai" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><AskAI /></ProtectedRoute>} />
              {/* Upload documents — patients only (backend accepts patient uploads) */}
              <Route path="/upload" element={<ProtectedRoute roles={['patient']}><Upload /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><Profile /></ProtectedRoute>} />
              <Route path="/patient" element={<ProtectedRoute roles={['patient']}><PatientDashboard /></ProtectedRoute>} />
              <Route path="/doctor" element={<ProtectedRoute roles={['doctor']}><DoctorLayout /></ProtectedRoute>}>
                <Route index element={<DoctorOverview />} />
                <Route path="patients" element={<DoctorPatients />} />
                <Route path="patients/:patientId" element={<DoctorPatientRecords />} />
                <Route path="schedule" element={<DoctorSchedule />} />
                <Route path="queue" element={<DoctorQueue />} />
                <Route path="prescriptions" element={<DoctorPrescriptions />} />
                <Route path="practice" element={<DoctorPractice />} />
                <Route path="engage" element={<DoctorEngage />} />
                <Route path="insights" element={<DoctorInsights />} />
                <Route path="growth" element={<DoctorGrowth />} />
                <Route path="safety" element={<DoctorSafety />} />
                <Route path="emergency" element={<DoctorEmergency />} />
                <Route path="risk" element={<DoctorRisk />} />
                <Route path="chat" element={<DoctorChat />} />
                <Route path="care" element={<DoctorCare />} />
                <Route path="alerts" element={<DoctorAlerts />} />
                <Route path="reviews" element={<DoctorRatings />} />
                <Route path="profile" element={<DoctorProfilePage />} />
              </Route>
              <Route path="/notifications" element={<ProtectedRoute roles={['patient', 'doctor', 'admin', 'receptionist', 'nurse']}><Notifications /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute roles={['patient', 'doctor', 'receptionist', 'nurse', 'admin']}><Billing /></ProtectedRoute>} />
              <Route path="/pharmacy" element={<ProtectedRoute roles={['doctor', 'receptionist', 'nurse', 'admin']}><Pharmacy /></ProtectedRoute>} />
              <Route path="/directory" element={<ProtectedRoute roles={['doctor', 'receptionist', 'nurse', 'admin']}><StaffDirectory /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </main>
          <Footer />
          <NeedHelp />
          <SiteFloaters />
        </div>
      </BrowserRouter>
      </LangProvider>
      </ProfileProvider>
    </AuthProvider>
  )
}
