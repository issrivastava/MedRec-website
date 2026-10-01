import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="card">Restoring session…</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    const home = user.role === 'doctor' ? '/doctor' : user.role === 'admin' ? '/admin' : (user.role === 'receptionist' || user.role === 'nurse') ? '/directory' : '/patient'
    return <Navigate to={home} replace />
  }
  return children
}
