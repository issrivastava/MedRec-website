import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    const home = user.role === 'doctor' ? '/doctor' : user.role === 'admin' ? '/admin' : '/patient'
    return <Navigate to={home} replace />
  }
  return children
}
