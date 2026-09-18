import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProfileProvider } from './context/ProfileContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import BottomNav from './components/BottomNav'
import NeedHelp from './components/NeedHelp'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import PatientDashboard from './pages/PatientDashboard'
import DoctorLayout from './pages/doctor/DoctorLayout'
import DoctorOverview from './pages/doctor/Overview'
import DoctorPatients from './pages/doctor/Patients'
import DoctorPatientRecords from './pages/doctor/PatientRecords'
import DoctorSchedule from './pages/doctor/Schedule'
import DoctorPrescriptions from './pages/doctor/Prescriptions'
import DoctorEmergency from './pages/doctor/Emergency'
import DoctorRisk from './pages/doctor/Risk'
import DoctorChat from './pages/doctor/Chat'
import DoctorCare from './pages/doctor/Care'
import DoctorAlerts from './pages/doctor/Alerts'
import DoctorRatings from './pages/doctor/Ratings'
import DoctorProfilePage from './pages/doctor/DoctorProfile'
import Contact from './pages/Contact'
import Profile from './pages/Profile'
import Policy from './pages/Policy'
import Timeline from './pages/Timeline'
import Medicines from './pages/Medicines'
import Diseases from './pages/Diseases'
import FindDoctors from './pages/FindDoctors'
import AskAI from './pages/AskAI'
import Notifications from './pages/Notifications'
import Admin from './pages/Admin'
import PublicShare from './pages/PublicShare'

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Navbar />
          <main className="app-main">
            <Routes>
              {/* Public home page: read about features first, then login */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/policy" element={<Policy />} />
              <Route path="/s/:token" element={<PublicShare />} />
              <Route path="/medicines" element={<Medicines />} />
              <Route path="/diseases" element={<Diseases />} />
              <Route path="/find-doctors" element={<FindDoctors />} />
              <Route path="/ask-ai" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><AskAI /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><Profile /></ProtectedRoute>} />
              <Route path="/patient" element={<ProtectedRoute roles={['patient']}><PatientDashboard /></ProtectedRoute>} />
              <Route path="/doctor" element={<ProtectedRoute roles={['doctor']}><DoctorLayout /></ProtectedRoute>}>
                <Route index element={<DoctorOverview />} />
                <Route path="patients" element={<DoctorPatients />} />
                <Route path="patients/:patientId" element={<DoctorPatientRecords />} />
                <Route path="schedule" element={<DoctorSchedule />} />
                <Route path="prescriptions" element={<DoctorPrescriptions />} />
                <Route path="emergency" element={<DoctorEmergency />} />
                <Route path="risk" element={<DoctorRisk />} />
                <Route path="chat" element={<DoctorChat />} />
                <Route path="care" element={<DoctorCare />} />
                <Route path="alerts" element={<DoctorAlerts />} />
                <Route path="reviews" element={<DoctorRatings />} />
                <Route path="profile" element={<DoctorProfilePage />} />
              </Route>
              <Route path="/timeline" element={<ProtectedRoute roles={['patient', 'doctor']}><Timeline /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute roles={['patient', 'doctor', 'admin']}><Notifications /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute>} />
            </Routes>
          </main>
          <Footer />
          <BottomNav />
          <NeedHelp />
        </div>
      </BrowserRouter>
      </ProfileProvider>
    </AuthProvider>
  )
}
