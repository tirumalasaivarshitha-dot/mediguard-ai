import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { authService } from '../services/auth.service'
import { authenticateToken } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { ApiResponse, AuthenticatedRequest } from '../types'

const router = Router()

const loginSchema = z.object({
  body: z.object({
    employeeId: z.string().trim().min(2, 'Employee ID is required').max(32, 'Employee ID is too long'),
    password: z.string().min(1, 'Password is required'),
    role: z.enum(['hospital_admin', 'biomedical_engineer', 'maintenance_technician']),
  }),
})

router.post('/login', validate(loginSchema), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { employeeId, password, role } = req.body
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || undefined

    const result = await authService.login({ employeeId, password, role, ipAddress })
    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('Invalid employee ID') ||
      error.message.includes('Invalid employee ID, password, or role') ||
      error.message.includes('deactivated')
    )) {
      res.status(401).json({
        success: false,
        message: error.message,
      })
      return
    }
    next(error)
  }
})

router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' })
      return
    }
    const currentUser = await authService.getCurrentUser(req.user.id)
    res.status(200).json({
      success: true,
      data: currentUser,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('deactivated')) {
      res.status(401).json({ success: false, message: error.message })
      return
    }
    next(error)
  }
})

router.post('/logout', (_req: Request, res: Response<ApiResponse>) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Remove token on client side.',
  })
})

export default router
