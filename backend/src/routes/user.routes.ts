import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { UserRole } from '@prisma/client'
import { userService } from '../services/user.service'
import { auditService } from '../services/audit.service'
import { authenticateToken, requireRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { ApiResponse, AuthenticatedRequest } from '../types'

const router = Router()

// All user management routes require ADMIN role
router.use(authenticateToken, requireRole('ADMIN'))

const createUserSchema = z.object({
  body: z.object({
    employeeId: z.string().trim().min(2).max(32),
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.nativeEnum(UserRole),
    department: z.string().optional(),
    phone: z.string().optional(),
  }),
})

const updateRoleSchema = z.object({
  body: z.object({
    role: z.nativeEnum(UserRole),
  }),
})

const updateStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean(),
  }),
})

// GET /api/users
router.get('/', async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { role, department, search } = req.query
    const users = await userService.listUsers({
      role: role ? (role as UserRole) : undefined,
      department: department ? String(department) : undefined,
      search: search ? String(search) : undefined,
    })
    res.status(200).json({
      success: true,
      data: users,
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/users/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const user = await userService.findUserById(id)
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }
    res.status(200).json({
      success: true,
      data: user,
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/users
router.post('/', validate(createUserSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const newUser = await userService.createUser(req.body)

    await auditService.log({
      userId: req.user?.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: newUser.id,
      details: { role: newUser.role, employeeId: newUser.employeeId },
      ipAddress: req.ip,
    })

    res.status(201).json({
      success: true,
      data: newUser,
    })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/users/:id/role
router.patch('/:id/role', validate(updateRoleSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const updatedUser = await userService.updateUserRole(id, req.body.role)

    await auditService.log({
      userId: req.user?.id,
      action: 'USER_ROLE_CHANGED',
      entityType: 'User',
      entityId: updatedUser.id,
      details: { newRole: updatedUser.role },
      ipAddress: req.ip,
    })

    res.status(200).json({
      success: true,
      data: updatedUser,
    })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/users/:id/status
router.patch('/:id/status', validate(updateStatusSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const updatedUser = await userService.updateUserStatus(id, req.body.isActive)

    await auditService.log({
      userId: req.user?.id,
      action: updatedUser.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: updatedUser.id,
      ipAddress: req.ip,
    })

    res.status(200).json({
      success: true,
      data: updatedUser,
    })
  } catch (error) {
    next(error)
  }
})

export default router
