import { Request } from 'express'

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
  meta?: Record<string, unknown>
}

export interface SessionUser {
  id: string
  employeeId: string
  name: string
  email: string
  role: 'hospital_admin' | 'biomedical_engineer' | 'maintenance_technician'
  department?: string
}

export interface AuthenticatedRequest extends Request {
  user?: SessionUser
}
