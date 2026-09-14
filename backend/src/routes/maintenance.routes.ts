import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticateToken, requireRole } from '../middleware/auth'
import { maintenanceService } from '../services/maintenance.service'
import { ApiResponse, AuthenticatedRequest, SessionUser } from '../types'
import { UserScope } from '../services/equipment.service'
import { assessmentService } from '../services/assessment.service'

const router = Router()

// All maintenance routes require authentication
router.use(authenticateToken)

const createWorkOrderSchema = z.object({
  equipmentId: z.string().min(1, 'Equipment ID required'),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'EMERGENCY']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assignedTechnicianId: z.string().optional(),
  scheduledAt: z.string().optional(),
  dueAt: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  assessmentId: z.string().optional(),
  partsUsed: z.array(z.string()).optional(),
  estimatedCost: z.number().finite().optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  notes: z.string().optional(),
})

const assignTechnicianSchema = z.object({
  technicianId: z.string().min(1, 'Technician ID required'),
})

const scheduleWorkOrderSchema = z.object({
  scheduledAt: z.string().min(1, 'Scheduled date required'),
  dueAt: z.string().optional(),
})

const completeWorkOrderSchema = z.object({
  completionNotes: z.string().optional(),
  technicianNotes: z.string().optional(),
  partsUsed: z.array(z.string()).optional(),
  maintenanceCost: z.number().finite().optional(),
  downtimeMinutes: z.number().int().min(0).optional(),
})

function getUserScope(user: SessionUser): UserScope {
  return {
    userId: user.id,
    role: user.role,
    department: user.department,
  }
}

/**
 * GET /api/maintenance
 * List work orders with filters, search, pagination, and RBAC scoping
 */
router.get('/', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const scope = getUserScope(req.user!)
    const search = req.query.search as string | undefined
    const status = req.query.status as any
    const priority = req.query.priority as any
    const type = req.query.type as any
    const technicianId = req.query.technicianId as string | undefined
    const equipmentId = req.query.equipmentId as string | undefined
    const department = req.query.department as string | undefined
    const overdue = req.query.overdue === 'true'
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20

    const result = await maintenanceService.listWorkOrders(
      { search, status, priority, type, technicianId, equipmentId, department, overdue, page, limit },
      scope
    )

    return res.status(200).json({
      success: true,
      message: 'Work orders retrieved successfully',
      data: result,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to list work orders',
    })
  }
})

/**
 * GET /api/maintenance/equipment/:equipmentId
 * Get maintenance history for equipment
 */
router.get('/equipment/:equipmentId', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const eqId = Array.isArray(req.params.equipmentId) ? req.params.equipmentId[0] : req.params.equipmentId
    const scope = getUserScope(req.user!)

    const history = await maintenanceService.getWorkOrdersByEquipment(eqId, scope)

    return res.status(200).json({
      success: true,
      message: 'Equipment maintenance history retrieved successfully',
      data: history,
    })

  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view maintenance for this equipment.',
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
      message: error?.message || 'Failed to retrieve equipment maintenance history',
    })
  }
})

/**
 * POST /api/maintenance/from-alert/:alertId
 * Create one idempotent work order from an active operational safety alert.
 */
router.post('/from-alert/:alertId', requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const result = await maintenanceService.createWorkOrderFromAlert(
      String(req.params.alertId),
      getUserScope(req.user!),
      req.user!.id,
    )
    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      message: result.duplicate ? 'Existing work order returned for safety alert' : 'Work order created from safety alert',
      data: result.workOrder,
    })
  } catch (error: any) {
    const status = error?.message === 'FORBIDDEN' ? 403 : error?.message === 'SAFETY_ALERT_NOT_FOUND' ? 404 : 400
    return res.status(status).json({ success: false, message: error?.message || 'Failed to create work order from safety alert' })
  }
})

/**
 * GET /api/maintenance/:id
 * Get work order detail
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const scope = getUserScope(req.user!)

    const item = await maintenanceService.getWorkOrderById(id, scope)
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Work order not found',
      })
    }
    if (item === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this work order.',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Work order detail retrieved successfully',
      data: item,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to retrieve work order detail',
    })
  }
})

/**
 * POST /api/maintenance
 * Create new work order
 */
router.post('/', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const parse = createWorkOrderSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid work order data',
        meta: { details: parse.error.format() },
      })
    }

    const scope = getUserScope(req.user!)
    const result = await maintenanceService.createWorkOrder(parse.data, scope, req.user!.id)

    if ((result as any).duplicate) {
      return res.status(409).json({
        success: false,
        message: (result as any).message,
        data: (result as any).existingWorkOrder,
      })
    }

    return res.status(201).json({
      success: true,
      message: 'Work order created successfully',
      data: result,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to create work orders for this equipment.',
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
      message: error?.message || 'Failed to create work order',
    })
  }
})

/**
 * PATCH /api/maintenance/:id
 * General update for work order
 */
router.patch('/:id', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const scope = getUserScope(req.user!)

    const updated = await maintenanceService.updateWorkOrder(id, req.body, scope)

    return res.status(200).json({
      success: true,
      message: 'Work order updated successfully',
      data: updated,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      })
    }
    if (error?.message === 'WORK_ORDER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Work order not found',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update work order',
    })
  }
})

/**
 * PATCH /api/maintenance/:id/status
 * Update work order status with transition rules
 */
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const parse = updateStatusSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status update payload',
        meta: { details: parse.error.format() },
      })
    }

    const scope = getUserScope(req.user!)
    const updated = await maintenanceService.updateWorkOrderStatus(id, parse.data.status, parse.data.notes, scope)

    return res.status(200).json({
      success: true,
      message: `Work order status updated to ${parse.data.status}`,
      data: updated,
    })
  } catch (error: any) {
    if (error?.message?.startsWith('INVALID_STATUS_TRANSITION')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      })
    }
    if (error?.message === 'FORBIDDEN_TECHNICIAN_UNASSIGNED') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Maintenance Technicians cannot modify work orders assigned to other personnel.',
      })
    }
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      })
    }
    if (error?.message === 'WORK_ORDER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Work order not found',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update work order status',
    })
  }
})

/**
 * PATCH /api/maintenance/:id/assign
 * Assign technician to work order
 */
router.patch('/:id/assign', requireRole('BIOMEDICAL_ENGINEER'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const parse = assignTechnicianSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid technician assignment payload',
        meta: { details: parse.error.format() },
      })
    }

    const scope = getUserScope(req.user!)
    const updated = await maintenanceService.assignTechnician(id, parse.data.technicianId, scope)

    return res.status(200).json({
      success: true,
      message: 'Technician assigned successfully',
      data: updated,
    })
  } catch (error: any) {
    if (error?.message === 'WORK_ORDER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Work order not found',
      })
    }
    if (error?.message === 'FORBIDDEN') {
      return res.status(403).json({ success: false, message: 'Only Biomedical Engineers may assign technicians.' })
    }
    if (error?.message === 'TECHNICIAN_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Active technician not found' })
    }
    if (error?.message === 'WORK_ORDER_TERMINAL') {
      return res.status(400).json({ success: false, message: 'A completed or cancelled work order cannot be reassigned.' })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to assign technician',
    })
  }
})

/**
 * PATCH /api/maintenance/:id/schedule
 * Schedule work order date
 */
router.patch('/:id/schedule', requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const parse = scheduleWorkOrderSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid schedule payload',
        meta: { details: parse.error.format() },
      })
    }

    const scope = getUserScope(req.user!)
    const updated = await maintenanceService.scheduleWorkOrder(id, parse.data.scheduledAt, parse.data.dueAt, scope)

    return res.status(200).json({
      success: true,
      message: 'Work order scheduled successfully',
      data: updated,
    })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN' || error?.message === 'FORBIDDEN_TECHNICIAN_UNASSIGNED') {
      return res.status(403).json({ success: false, message: 'You may only complete maintenance assigned to you.' })
    }
    if (error?.message === 'WORK_ORDER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Work order not found',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to schedule work order',
    })
  }
})

/**
 * PATCH /api/maintenance/:id/complete
 * Complete work order with notes, cost, and downtime
 */
router.patch('/:id/complete', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const parse = completeWorkOrderSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid work order completion payload',
        meta: { details: parse.error.format() },
      })

      /**
       * POST /api/maintenance/:id/reassess
       * Run the existing operational assessment after maintenance completion.
       * Alert resolution remains a separate biomedical verification action.
       */
      router.post('/:id/reassess', requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
        try {
          const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
          const workOrder = await maintenanceService.getWorkOrderById(id, getUserScope(req.user!))
          if (!workOrder || workOrder === 'FORBIDDEN') {
            return res.status(workOrder === 'FORBIDDEN' ? 403 : 404).json({ success: false, message: 'Work order not found or access denied' })
          }
          if (workOrder.status !== 'COMPLETED') {
            return res.status(400).json({ success: false, message: 'Maintenance must be completed before reassessment' })
          }
          const result = await assessmentService.runAssessment({
            equipmentId: workOrder.equipmentId,
            source: 'post_maintenance_reassessment',
            userId: req.user!.id,
            userScope: getUserScope(req.user!),
          })
          return res.status(200).json({
            success: true,
            message: 'Equipment reassessed using the existing operational assessment pipeline',
            data: result,
          })
        } catch (error: any) {
          return res.status(400).json({ success: false, message: error?.message || 'Failed to reassess equipment' })
        }
      })
    }

    const scope = getUserScope(req.user!)
    const updated = await maintenanceService.completeWorkOrder(id, parse.data, scope, req.user!.id)

    return res.status(200).json({
      success: true,
      message: 'Work order completed successfully',
      data: updated,
    })
  } catch (error: any) {
    if (error?.message === 'WORK_ORDER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Work order not found',
      })
    }
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to complete work order',
    })
  }
})

export default router
