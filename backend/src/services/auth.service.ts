import { comparePassword, generateToken } from '../utils/auth'
import { userService } from './user.service'
import { auditService } from './audit.service'
import { SessionUser } from '../types'
import { UserRole } from '@prisma/client'

export type LoginRole = 'hospital_admin' | 'biomedical_engineer' | 'maintenance_technician'

const loginRoleToDatabaseRole: Record<LoginRole, UserRole> = {
  hospital_admin: UserRole.ADMIN,
  biomedical_engineer: UserRole.BIOMEDICAL_ENGINEER,
  maintenance_technician: UserRole.TECHNICIAN,
}

export const authService = {
  async login(credentials: { employeeId: string; password: string; role: LoginRole; ipAddress?: string }) {
    const employeeId = credentials.employeeId.trim().toUpperCase()
    const user = await userService.findUserByEmployeeId(employeeId)

    if (!user) {
      await auditService.log({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: employeeId,
        details: { reason: 'User not found' },
        ipAddress: credentials.ipAddress,
      })
      throw new Error('Invalid employee ID or password')
    }

    if (!user.isActive) {
      await auditService.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        details: { reason: 'Account deactivated' },
        ipAddress: credentials.ipAddress,
      })
      throw new Error('Account is deactivated. Contact hospital administrator.')
    }

    const isMatch = await comparePassword(credentials.password, user.passwordHash)
    if (!isMatch) {
      await auditService.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        details: { reason: 'Invalid password' },
        ipAddress: credentials.ipAddress,
      })
      throw new Error('Invalid employee ID or password')
    }

    if (user.role !== loginRoleToDatabaseRole[credentials.role]) {
      await auditService.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        details: { reason: 'Selected role does not match database role' },
        ipAddress: credentials.ipAddress,
      })
      throw new Error('Invalid employee ID, password, or role')
    }

    const sessionUser: SessionUser = {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase() as SessionUser['role'],
      department: user.department || undefined,
    }

    const token = generateToken(sessionUser)

    await auditService.log({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      ipAddress: credentials.ipAddress,
    })

    return {
      token,
      user: sessionUser,
    }
  },

  async getCurrentUser(userId: string) {
    const user = await userService.findUserById(userId)
    if (!user) throw new Error('User not found')
    if (!user.isActive) throw new Error('Account is deactivated')
    return {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase() as SessionUser['role'],
      department: user.department || undefined,
      isActive: user.isActive,
    }
  },
}
