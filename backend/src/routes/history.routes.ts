import { Router, Response } from 'express'
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth'
import { historyService } from '../services/history.service'
import { ApiResponse } from '../types'
import { UserScope } from '../services/equipment.service'

const router = Router()

router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const scope: UserScope = {
      userId: req.user!.id,
      role: req.user!.role,
      department: req.user!.department,
    }
    const history = await historyService.listHistory(scope)
    return res.status(200).json({ success: true, data: history })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to load history',
    })
  }
})

export default router
