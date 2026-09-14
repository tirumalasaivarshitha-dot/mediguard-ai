import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticateToken, requireRole } from '../middleware/auth'
import { telemetryService } from '../services/telemetry.service'
import { telemetrySimulatorService } from '../services/telemetrySimulator.service'
import { ApiResponse, AuthenticatedRequest, SessionUser } from '../types'
import { UserScope } from '../services/equipment.service'

const router = Router()

// Single reading validation schema
const singleTelemetrySchema = z.object({
  equipmentId: z.string().min(1, 'Equipment ID required'),
  timestamp: z.string().optional(),
  temperature: z.number().finite().optional(),
  vibration: z.number().finite().optional(),
  powerConsumption: z.number().finite().optional(),
  pressure: z.number().finite().optional(),
  voltage: z.number().finite().optional(),
  operatingHours: z.number().finite().optional(),
  errorCount: z.number().int().min(0).optional(),
  additionalMeasurements: z.record(z.any()).optional(),
  dataSource: z.string().optional(),
})

// Batch ingestion validation schema
const batchTelemetrySchema = z.object({
  readings: z.array(singleTelemetrySchema).min(1, 'At least one reading required').max(500, 'Batch size limit is 500 readings'),
})

function getUserScope(user: SessionUser): UserScope {
  return {
    userId: user.id,
    role: user.role,
    department: user.department,
  }
}

/**
 * POST /api/telemetry
 * Ingest single telemetry reading
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const parse = singleTelemetrySchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telemetry reading payload',
        meta: { details: parse.error.format() },
      })
    }

    const scope = getUserScope(req.user!)
    const result = await telemetryService.createTelemetryReading(parse.data, scope)

    return res.status(201).json({
      success: true,
      message: 'Telemetry reading ingested successfully',
      data: result,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to ingest telemetry for this equipment.',
      })
    }
    if (error?.message === 'EQUIPMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found',
      })
    }
    if (error?.message === 'TELEMETRY_PERSISTENCE_FAILED') {
      return res.status(503).json({
        success: false,
        message: 'Telemetry could not be persisted to PostgreSQL.',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to ingest telemetry reading',
    })
  }
})

/**
 * POST /api/telemetry/batch
 * Batch telemetry ingestion
 */
router.post('/batch', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const parse = batchTelemetrySchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid batch telemetry payload',
        meta: { details: parse.error.format() },
      })
    }

    const scope = getUserScope(req.user!)
    const result = await telemetryService.createTelemetryBatch(parse.data.readings, scope)

    return res.status(201).json({
      success: true,
      message: `Batch telemetry ingested successfully (${result.count} records)`,
      data: result,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to ingest telemetry for one or more target equipment items.',
      })
    }
    if (error?.message === 'BATCH_SIZE_EXCEEDED') {
      return res.status(400).json({
        success: false,
        message: 'Batch size exceeds maximum limit of 500 readings per request',
      })
    }
    if (error?.message === 'TELEMETRY_PERSISTENCE_FAILED') {
      return res.status(503).json({
        success: false,
        message: 'Telemetry could not be persisted to PostgreSQL.',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to ingest batch telemetry',
    })
  }
})

/**
 * GET /api/telemetry/equipment/:equipmentId/latest
 * Get latest telemetry reading for equipment
 */
router.get('/equipment/:equipmentId/latest', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const eqId = Array.isArray(req.params.equipmentId) ? req.params.equipmentId[0] : req.params.equipmentId
    const scope = getUserScope(req.user!)
    const reading = await telemetryService.getLatestTelemetry(eqId, scope)

    return res.status(200).json({
      success: true,
      message: 'Latest telemetry retrieved successfully',
      data: reading,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view telemetry for this equipment.',
      })
    }
    if (error?.message === 'EQUIPMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found',
      })
    }
    if (error?.message === 'TELEMETRY_DATABASE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        message: 'Telemetry database is unavailable.',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to retrieve latest telemetry',
    })
  }
})

/**
 * GET /api/telemetry/equipment/:equipmentId/history
 * Get telemetry history for equipment
 */
router.get('/equipment/:equipmentId/history', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const eqId = Array.isArray(req.params.equipmentId) ? req.params.equipmentId[0] : req.params.equipmentId
    const scope = getUserScope(req.user!)

    const start = req.query.start as string | undefined
    const end = req.query.end as string | undefined
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 100

    const history = await telemetryService.getTelemetryHistory(eqId, scope, { start, end, page, limit })

    return res.status(200).json({
      success: true,
      message: 'Telemetry history retrieved successfully',
      data: history,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to access telemetry history for this equipment.',
      })
    }
    if (error?.message === 'EQUIPMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found',
      })
    }
    if (error?.message === 'TELEMETRY_DATABASE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        message: 'Telemetry database is unavailable.',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to retrieve telemetry history',
    })
  }
})

/**
 * GET /api/telemetry/equipment/:equipmentId/stats
 * Get telemetry statistics for equipment
 */
router.get('/equipment/:equipmentId/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const eqId = Array.isArray(req.params.equipmentId) ? req.params.equipmentId[0] : req.params.equipmentId
    const scope = getUserScope(req.user!)
    const start = req.query.start as string | undefined
    const end = req.query.end as string | undefined

    const stats = await telemetryService.getTelemetryStats(eqId, scope, { start, end })

    return res.status(200).json({
      success: true,
      message: 'Telemetry statistics calculated successfully',
      data: stats,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view telemetry statistics for this equipment.',
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
      message: error?.message || 'Failed to calculate telemetry statistics',
    })
  }
})

/**
 * POST /api/telemetry/simulator/start
 * Start progressive telemetry simulator for equipment
 */
router.post(
  '/simulator/start',
  authenticateToken,
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      const equipmentId = req.body.equipmentId
      if (typeof equipmentId !== 'string' || equipmentId.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'equipmentId is required to start the telemetry simulator.',
        })
      }
      const intervalMs = req.body.intervalMs || 2000

      const result = await telemetrySimulatorService.startSimulation(equipmentId, intervalMs, req.user!.id)

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to start telemetry simulator',
      })
    }
  }
)

/**
 * POST /api/telemetry/simulator/stop
 * Stop progressive telemetry simulator for equipment
 */
router.post(
  '/simulator/stop',
  authenticateToken,
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      const equipmentId = req.body.equipmentId
      if (typeof equipmentId !== 'string' || equipmentId.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'equipmentId is required to stop the telemetry simulator.',
        })
      }
      const result = await telemetrySimulatorService.stopSimulation(equipmentId, req.user!.id)

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to stop telemetry simulator',
      })
    }
  }
)

/**
 * GET /api/telemetry/simulator/status
 * Get simulator status
 */
router.get(
  '/simulator/status',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      const equipmentId = req.query.equipmentId as string | undefined
      const status = telemetrySimulatorService.getSimulationStatus(equipmentId)

      return res.status(200).json({
        success: true,
        message: 'Telemetry simulator status retrieved successfully',
        data: status,
      })
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to get telemetry simulator status',
      })
    }
  }
)

export default router
