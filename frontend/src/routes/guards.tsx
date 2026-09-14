import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'
import { normalizeUserRole } from '@/config/navigation'

export function RequireAuth() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  const role = normalizeUserRole(user.role)
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />
  return <Outlet />
}

export function RoleDashboardRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  const dashboardByRole: Record<UserRole, string> = {
    hospital_admin: '/dashboard/admin',
    biomedical_engineer: '/dashboard/biomedical',
    maintenance_technician: '/dashboard/technician',
  }
  const role = normalizeUserRole(user.role)
  return <Navigate to={role ? dashboardByRole[role] : '/login'} replace />
}
