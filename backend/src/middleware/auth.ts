import { Response, NextFunction } from 'express'
import { AuthenticatedRequest, ApiResponse, SessionUser } from '../types'
import { verifyToken } from '../utils/auth'
import { userService } from '../services/user.service'

export { AuthenticatedRequest }

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access token missing or malformed',
    })
    return
  }

  const payloadUser = verifyToken(token)
  if (!payloadUser) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
    return
  }

  // Database active check
  try {
    const dbUser = await userService.findUserById(payloadUser.id)
    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({
        success: false,
        message: 'Account is inactive or no longer exists',
      })
      return
    }

    req.user = {
      id: dbUser.id,
      employeeId: dbUser.employeeId,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role.toLowerCase() as SessionUser['role'],
      department: dbUser.department || undefined,
    }

    next()
  } catch (error) {
    next(error)
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
      return
    }

    const normalizedUserRole = req.user.role.toUpperCase()
    const normalizedAllowedRoles = allowedRoles.map((r) => r.toUpperCase())

    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions for this action',
      })
      return
    }

    next()
  }
}
