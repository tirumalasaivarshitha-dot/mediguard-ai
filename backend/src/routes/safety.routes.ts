import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth'
import { safetyService } from '../services/safety.service'
import { UserScope } from '../services/equipment.service'
import { ApiResponse } from '../types'
import { AlertSeverity, AlertStatus } from '@prisma/client'

const router = Router()

// Zod Validation Schemas
const createAlertSchema = z.object({
  equipmentId: z.string().min(1, 'Equipment ID is required'),
  assessmentId: z.string().optional(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  severity: z.nativeEnum(AlertSeverity).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  source: z.string().optional(),
  assignedToId: z.string().optional(),
})

const assignAlertSchema = z.object({
  technicianId: z.string().min(1, 'Technician ID is required'),
})

const escalateAlertSchema = z.object({
  reason: z.string().optional(),
})

const resolveAlertSchema = z.object({
  resolutionNotes: z.string().optional(),
  workOrderId: z.string().optional(),
})

const dismissAlertSchema = z.object({
  reason: z.string().optional(),
})

/**
 * GET /api/safety
 * List safety alerts with pagination and server-side RBAC scoping
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const scope: UserScope = {
      userId: req.user!.id,
      role: req.user!.role,
      department: req.user!.department,
    }

    const filters = {
      status: req.query.status ? (req.query.status as AlertStatus) : undefined,
      severity: req.query.severity ? (req.query.severity as AlertSeverity) : undefined,
      equipmentId: req.query.equipmentId as string | undefined,
      department: req.query.department as string | undefined,
      assignedToId: req.query.assignedToId as string | undefined,
      unresolved: req.query.unresolved === 'true',
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    }

    const { records, pagination } = await safetyService.listAlerts(filters, scope)

    return res.status(200).json({
      success: true,
      message: 'Safety alerts retrieved successfully',
      data: {
        records,
        pagination,
      },
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to list safety alerts',
    })
  }
})

/**
 * GET /api/safety/equipment/:equipmentId
 * Get safety alerts for specific equipment
 */
router.get('/equipment/:equipmentId', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const scope: UserScope = {
      userId: req.user!.id,
      role: req.user!.role,
      department: req.user!.department,
    }

    const alerts = await safetyService.getAlertsByEquipmentId(String(req.params.equipmentId), scope)

    return res.status(200).json({
      success: true,
      message: 'Equipment safety alerts retrieved',
      data: alerts,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get equipment safety alerts',
    })
  }
})

/**
 * GET /api/safety/:id
 * Get single safety alert details
 */
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const scope: UserScope = {
      userId: req.user!.id,
      role: req.user!.role,
      department: req.user!.department,
    }

    const alert = await safetyService.getAlertById(String(req.params.id), scope)

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Safety alert not found' })
    }

    if (alert === 'FORBIDDEN') {
      return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to view this safety alert.' })
    }

    return res.status(200).json({
      success: true,
      message: 'Safety alert retrieved',
      data: alert,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to get safety alert',
    })
  }
})

/**
 * POST /api/safety
 * Create a new safety alert (Admin, Biomed Engineer, Dept Manager)
 */
router.post(
  '/',
  authenticateToken,
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      const validated = createAlertSchema.parse(req.body)
      const actorId = req.user!.id

      const { alert, isDuplicate } = await safetyService.createAlert(validated, actorId)

      return res.status(201).json({
        success: true,
        message: isDuplicate
          ? 'Active safety alert updated for this equipment'
          : 'Safety alert created successfully',
        data: alert,
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        })
      }
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to create safety alert',
      })
    }
  },
)

/**
 * PATCH /api/safety/:id/acknowledge
 * Acknowledge safety alert
 */
router.patch('/:id/acknowledge', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const actor = { userId: req.user!.id, role: req.user!.role }
    const updated = await safetyService.acknowledgeAlert(String(req.params.id), actor)

    return res.status(200).json({
      success: true,
      message: 'Safety alert acknowledged',
      data: updated,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({ success: false, message: 'You may only acknowledge safety alerts assigned to you.' })
    }
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to acknowledge safety alert',
    })
  }
})

/**
 * PATCH /api/safety/:id/assign
 * Assign technician/responsible personnel
 */
router.patch(
  '/:id/assign',
  authenticateToken,
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      const validated = assignAlertSchema.parse(req.body)
      const actor = { userId: req.user!.id, role: req.user!.role }

      const updated = await safetyService.assignAlert(String(req.params.id), validated.technicianId, actor)

      return res.status(200).json({
        success: true,
        message: 'Technician assigned to safety alert',
        data: updated,
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: error.errors[0].message })
      }
      if (error?.message === 'TECHNICIAN_NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'Active technician not found' })
      }
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to assign technician',
      })
    }
  },
)

/**
 * PATCH /api/safety/:id/escalate
 * Escalate safety alert
 */
router.patch('/:id/escalate', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const validated = escalateAlertSchema.parse(req.body)
    const actor = { userId: req.user!.id, role: req.user!.role }

    const updated = await safetyService.escalateAlert(String(req.params.id), validated.reason, actor)

    return res.status(200).json({
      success: true,
      message: 'Safety alert escalated',
      data: updated,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({ success: false, message: 'You may only escalate safety alerts assigned to you.' })
    }
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to escalate safety alert',
    })
  }
})

/**
 * PATCH /api/safety/:id/resolve
 * Resolve safety alert
 */
router.patch('/:id/resolve', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const validated = resolveAlertSchema.parse(req.body)
    const actor = { userId: req.user!.id, role: req.user!.role }

    const updated = await safetyService.resolveAlert(
      String(req.params.id),
      validated.resolutionNotes,
      validated.workOrderId,
      actor,
    )

    return res.status(200).json({
      success: true,
      message: 'Safety alert resolved successfully',
      data: updated,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({ success: false, message: 'Only Hospital Administrators and Biomedical Engineers can resolve safety alerts.' })
    }
    if (error?.message === 'MAINTENANCE_NOT_COMPLETED') {
      return res.status(400).json({ success: false, message: 'The related maintenance work must be completed before resolving this alert.' })
    }
    if (error?.message === 'WORK_ORDER_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Related work order not found' })
    }
    if (error?.message === 'REASSESSMENT_REQUIRED') {
      return res.status(400).json({ success: false, message: 'Complete a post-maintenance equipment reassessment before resolving this alert.' })
    }
    if (error?.message === 'EQUIPMENT_REMAINS_AT_RISK') {
      return res.status(409).json({ success: false, message: 'The latest reassessment still indicates elevated operational risk; keep the alert active for further inspection.' })
    }
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to resolve safety alert',
    })
  }
})

/**
 * PATCH /api/safety/:id/dismiss
 * Dismiss safety alert (Admin & Biomed Engineer only)
 */
router.patch(
  '/:id/dismiss',
  authenticateToken,
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      const validated = dismissAlertSchema.parse(req.body)
      const actor = { userId: req.user!.id, role: req.user!.role }

      const updated = await safetyService.dismissAlert(String(req.params.id), validated.reason, actor)

      return res.status(200).json({
        success: true,
        message: 'Safety alert dismissed',
        data: updated,
      })
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to dismiss safety alert',
      })
    }
  },
)

export default router
