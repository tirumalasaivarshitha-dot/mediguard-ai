import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessionUser, UserRole } from '@/types'
import { normalizeUserRole, ROLE_LABEL } from '@/config/navigation'
import { API_ORIGIN } from '@/config/app'

type AuthContextValue = {
  user: SessionUser | null
  token: string | null
  login: (employeeId: string, password: string, role: UserRole) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  switchRole: (role: UserRole) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'mediguard.session'
const TOKEN_KEY = 'mediguard.token'
const API_BASE = API_ORIGIN

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      const stored = JSON.parse(raw) as Partial<SessionUser>
      const role = normalizeUserRole(String(stored.role))
      return role && stored.employeeId ? { ...stored, role } as SessionUser : null
    } catch {
      return null
    }
  })

  // Validate active JWT token against backend on mount
  useEffect(() => {
    if (!token) return
    let active = true
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Auth validation failed with status ${res.status}`)
        }
        const resData = await res.json()
        if (active && resData.success && resData.data) {
          const u = resData.data
          const role = normalizeUserRole(String(u.role))
          if (!role) throw new Error('Authenticated user has an unsupported role')
          const sessionUser: SessionUser = {
            id: u.id,
            employeeId: u.employeeId,
            name: u.name,
            email: u.email,
            role,
            department: u.department,
          }
          setUser(sessionUser)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser))
        }
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      })
    return () => {
      active = false
    }
  }, [token])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      login: async (employeeId, password, role) => {
        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId, password, role }),
          })

          const data = await res.json()

          if (res.ok && data.success && data.data) {
            const authToken = data.data.token
            const u = data.data.user
            const role = normalizeUserRole(String(u.role))
            if (!role) throw new Error('Authenticated user has an unsupported role')
            const sessionUser: SessionUser = {
              id: u.id,
              employeeId: u.employeeId,
              name: u.name,
              email: u.email,
              role,
              department: u.department,
            }
            localStorage.setItem(TOKEN_KEY, authToken)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser))
            setToken(authToken)
            setUser(sessionUser)
            return { success: true }
          }

          if (res.status === 401 || res.status === 400) {
            return { success: false, error: data.message || 'Invalid employee ID, password, or role.' }
          }

          if (res.status === 403) {
            return { success: false, error: 'You do not have permission to perform this action.' }
          }

          return {
            success: false,
            error: data.message || 'Unable to connect to the MediGuard AI backend.',
          }
        } catch {
          return {
            success: false,
            error: 'Unable to connect to the MediGuard AI backend. Confirm the backend is running.',
          }
        }
      },
      logout: () => {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      },
      switchRole: (role) => {
        if (!user) return
        const backendRole = user.role
        if (role !== backendRole) {
          console.warn('[Auth] Role switching is disabled for the active backend session. Backend authorization remains authoritative.')
        }
        setUser({ ...user, role: backendRole })
      },
    }),
    [user, token],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { ROLE_LABEL }
