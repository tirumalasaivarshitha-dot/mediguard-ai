import { prisma } from '../config/database'
import { UserRole } from '@prisma/client'
import { hashPassword } from '../utils/auth'

export const safeUserSelect = {
  id: true,
  employeeId: true,
  name: true,
  email: true,
  role: true,
  department: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
}

export const userService = {
  async findUserById(id: string) {
    try {
      return await prisma.user.findUnique({
        where: { id },
        select: safeUserSelect,
      })
    } catch (error: any) {
      console.error(`[User] PostgreSQL read failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async findUserByEmployeeId(employeeId: string) {
    try {
      return await prisma.user.findUnique({
        where: { employeeId: employeeId.trim().toUpperCase() },
      })
    } catch (error: any) {
      console.error(`[User] PostgreSQL employee ID lookup failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async listUsers(filters?: { role?: UserRole; department?: string; search?: string }) {
    try {
      return await prisma.user.findMany({
        where: {
          ...(filters?.role ? { role: filters.role } : {}),
          ...(filters?.department ? { department: filters.department } : {}),
          ...(filters?.search
            ? {
                OR: [
                  { name: { contains: filters.search, mode: 'insensitive' } },
                  { email: { contains: filters.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: safeUserSelect,
        orderBy: { createdAt: 'desc' },
      })
    } catch (error: any) {
      console.error(`[User] PostgreSQL list failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async createUser(data: {
    employeeId: string
    name: string
    email: string
    password: string
    role: UserRole
    department?: string
    phone?: string
  }) {
    const passwordHash = await hashPassword(data.password)
    try {
      return await prisma.user.create({
        data: {
          employeeId: data.employeeId.trim().toUpperCase(),
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash,
          role: data.role,
          department: data.department,
          phone: data.phone,
        },
        select: safeUserSelect,
      })
    } catch (error: any) {
      console.error(`[User] PostgreSQL create failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async updateUserRole(id: string, role: UserRole) {
    try {
      return await prisma.user.update({
        where: { id },
        data: { role },
        select: safeUserSelect,
      })
    } catch (error: any) {
      console.error(`[User] PostgreSQL role update failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async updateUserStatus(id: string, isActive: boolean) {
    try {
      return await prisma.user.update({
        where: { id },
        data: { isActive },
        select: safeUserSelect,
      })
    } catch (error: any) {
      console.error(`[User] PostgreSQL status update failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },
}
