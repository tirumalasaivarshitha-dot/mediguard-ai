import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticateToken } from '../middleware/auth'
import { assessmentService } from '../services/assessment.service'
import { ApiResponse, AuthenticatedRequest, SessionUser } from '../types'
import { UserScope } from '../services/equipment.service'

const router = Router()

// Require authentication for all assessment routes
router.use(authenticateToken)

// Schema for manual / telemetry assessment input
const assessmentInputSchema = z.object({
  equipmentId: z.string().optional(),
  equipmentType: z.string().optional(),
  source: z.string().optional(),
  manualReadings: z.object({
    temperature: z.number().optional(),
    vibration: z.number().optional(),
    powerKw: z.number().optional(),
    pressure: z.number().optional(),
    voltage: z.number().optional(),
    operatingHours: z.number().optional(),
    errorCount: z.number().optional(),
    lastMaintenanceDaysAgo: z.number().optional(),
    department: z.string().optional(),
  }).optional(),
})

function getUserScope(user: SessionUser): UserScope {
  return {
    userId: user.id,
    role: user.role,
    department: user.department,
  }
}

/**
 * POST /api/assessment
 * Run real AI assessment on equipment or manual readings
 */
router.post('/', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const parse = assessmentInputSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request data for assessment',
        meta: { details: parse.error.format() },
      })
    }

    const scope = getUserScope(req.user!)
    const result = await assessmentService.runAssessment({
      ...parse.data,
      userId: req.user!.id,
      userScope: scope,
    })

    return res.status(200).json({
      success: true,
      message: 'AI Assessment completed successfully',
      data: result,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to assess equipment outside your scope.',
      })
    }
    if (error?.message === 'EQUIPMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found',
      })
    }
    if (error?.message === 'ML_SERVICE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        message: 'AI Assessment service is temporarily unavailable. Please try again later.',
      })
    }

    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to process AI Assessment',
    })
  }
})

/**
 * GET /api/assessment/latest/:equipmentId
 * Get latest assessment for equipment
 */
router.get('/latest/:equipmentId', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const eqId = Array.isArray(req.params.equipmentId) ? req.params.equipmentId[0] : req.params.equipmentId
    const scope = getUserScope(req.user!)
    const result = await assessmentService.getLatestAssessment(eqId, scope)

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'No assessment found for this equipment',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Latest assessment retrieved successfully',
      data: result,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to retrieve latest assessment',
    })
  }
})

/**
 * GET /api/assessment/equipment/:equipmentId
 * Get assessment history for equipment
 */
router.get('/equipment/:equipmentId', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const eqId = Array.isArray(req.params.equipmentId) ? req.params.equipmentId[0] : req.params.equipmentId
    const scope = getUserScope(req.user!)

    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10

    const history = await assessmentService.getAssessmentHistory(eqId, scope, page, limit)

    return res.status(200).json({
      success: true,
      message: 'Assessment history retrieved successfully',
      data: history,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to access assessment history for this equipment.',
      })
    }
    if (error?.message === 'EQUIPMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found',
      })
    }

    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to retrieve assessment history',
    })
  }
})

export default router
