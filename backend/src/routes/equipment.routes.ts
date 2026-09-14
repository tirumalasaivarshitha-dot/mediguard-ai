import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { EquipmentStatus, Criticality } from '@prisma/client'
import { equipmentService, UserScope } from '../services/equipment.service'
import { historicalPredictionService } from '../services/historicalPrediction.service'
import { auditService } from '../services/audit.service'
import { authenticateToken, requireRole } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { ApiResponse, AuthenticatedRequest } from '../types'

const router = Router()

// Require authentication for all equipment routes
router.use(authenticateToken)

const createEquipmentSchema = z.object({
  body: z.object({
    equipmentCode: z.string().min(2, 'Equipment code required'),
    name: z.string().min(2, 'Equipment name required'),
    equipmentType: z.string().min(2, 'Equipment type required'),
    manufacturer: z.string().min(2, 'Manufacturer required'),
    model: z.string().min(1, 'Model required'),
    serialNumber: z.string().min(2, 'Serial number required'),
    department: z.string().min(2, 'Department required'),
    location: z.string().min(2, 'Location required'),
    installationDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
    warrantyExpiry: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
    operatingHours: z.number().min(0).optional(),
    criticality: z.nativeEnum(Criticality).optional(),
  }),
})

const updateEquipmentSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    equipmentType: z.string().min(2).optional(),
    manufacturer: z.string().min(2).optional(),
    model: z.string().min(1).optional(),
    department: z.string().min(2).optional(),
    location: z.string().min(2).optional(),
    installationDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
    warrantyExpiry: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
    operatingHours: z.number().min(0).optional(),
    criticality: z.nativeEnum(Criticality).optional(),
  }),
})

const updateStatusSchema = z.object({
  body: z.object({
    status: z.nativeEnum(EquipmentStatus),
  }),
})

const assignTechnicianSchema = z.object({
  body: z.object({
    technicianId: z.string().min(1, 'Technician ID required'),
  }),
})

function getUserScope(req: AuthenticatedRequest): UserScope {
  return {
    userId: req.user!.id,
    role: req.user!.role,
    department: req.user!.department,
  }
}

router.get('/filter-options', async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const options = await equipmentService.getFilterOptions(getUserScope(req), req.query.operationalDataset === 'true')
    res.status(200).json({ success: true, data: options })
  } catch (error) {
    next(error)
  }
})

// GET /api/equipment
router.get('/', async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { search, department, equipmentType, manufacturer, riskClass, country, status, criticality, assignedTechnicianId, sourceDatasetId, historicalOnly, page, limit, operationalDataset } = req.query

    const filters = {
      search: search ? String(search) : undefined,
      department: department ? String(department) : undefined,
      equipmentType: equipmentType ? String(equipmentType) : undefined,
      manufacturer: manufacturer ? String(manufacturer) : undefined,
      riskClass: riskClass ? String(riskClass) : undefined,
      country: country ? String(country) : undefined,
      status: status ? (status as EquipmentStatus) : undefined,
      criticality: criticality ? (criticality as Criticality) : undefined,
      assignedTechnicianId: assignedTechnicianId ? String(assignedTechnicianId) : undefined,
      sourceDatasetId: sourceDatasetId ? String(sourceDatasetId) : undefined,
      historicalOnly: historicalOnly === 'true',
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
      operationalDataset: operationalDataset === 'true',
    }

    const scope = getUserScope(req)
    const result = await equipmentService.listEquipment(filters, scope)

    res.status(200).json({
      success: true,
      data: result.records,
      meta: {
        pagination: result.pagination,
      },
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/equipment/code/:equipmentCode
router.get('/code/:equipmentCode', async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const scope = getUserScope(req)
    const code = Array.isArray(req.params.equipmentCode) ? req.params.equipmentCode[0] : req.params.equipmentCode
    const item = await equipmentService.getEquipmentByCode(code, scope)

    if (!item) {
      res.status(404).json({ success: false, message: 'Equipment not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: item,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/:id/historical-ai-assessment', async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const result = await historicalPredictionService.assessEquipment(id, getUserScope(req))
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'Access denied.' })
    if (['EQUIPMENT_NOT_FOUND', 'HISTORICAL_DEVICE_NOT_FOUND'].includes(error?.message)) return res.status(404).json({ success: false, message: 'Kaggle historical device not found.' })
    if (error?.message === 'HISTORICAL_DEVICE_REQUIRED') return res.status(422).json({ success: false, message: 'This equipment is not a device from the active Kaggle historical safety dataset.' })
    if (error?.message === 'HISTORICAL_CUTOFF_UNAVAILABLE') return res.status(422).json({ success: false, message: 'This historical device has no normalized exact event date for assessment.' })
    if (error?.message === 'HISTORICAL_MODEL_NOT_AVAILABLE') return res.status(503).json({ success: false, message: 'The completed Kaggle historical safety model is unavailable.' })
    next(error)
  }
})

// GET /api/equipment/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const scope = getUserScope(req)
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const item = await equipmentService.getEquipmentById(id, scope, req.query.operationalDataset === 'true')

    if (!item) {
      res.status(404).json({ success: false, message: 'Equipment not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: item,
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/equipment (ADMIN, BIOMEDICAL_ENGINEER only)
router.post(
  '/',
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  validate(createEquipmentSchema),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const item = await equipmentService.createEquipment(req.body)

      await auditService.log({
        userId: req.user?.id,
        action: 'EQUIPMENT_CREATED',
        entityType: 'Equipment',
        entityId: item.id,
        details: { equipmentCode: item.equipmentCode, name: item.name, department: item.department },
        ipAddress: req.ip,
      })

      res.status(201).json({
        success: true,
        data: item,
      })
    } catch (error) {
      if (error instanceof Error && (error.message === 'DUPLICATE_CODE' || error.message === 'DUPLICATE_SERIAL')) {
        res.status(409).json({
          success: false,
          message: error.message === 'DUPLICATE_CODE' ? 'Equipment code already exists' : 'Serial number already exists',
        })
        return
      }
      next(error)
    }
  },
)

// PATCH /api/equipment/:id (ADMIN, BIOMEDICAL_ENGINEER only)
router.patch(
  '/:id',
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  validate(updateEquipmentSchema),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const item = await equipmentService.updateEquipment(id, req.body)

      await auditService.log({
        userId: req.user?.id,
        action: 'EQUIPMENT_UPDATED',
        entityType: 'Equipment',
        entityId: item.id,
        details: { updatedFields: Object.keys(req.body) },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: item,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        res.status(404).json({ success: false, message: 'Equipment not found' })
        return
      }
      next(error)
    }
  },
)

// PATCH /api/equipment/:id/status (ADMIN, BIOMEDICAL_ENGINEER only)
router.patch(
  '/:id/status',
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  validate(updateStatusSchema),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const item = await equipmentService.updateEquipmentStatus(id, req.body.status)

      await auditService.log({
        userId: req.user?.id,
        action: 'EQUIPMENT_STATUS_CHANGED',
        entityType: 'Equipment',
        entityId: item.id,
        details: { newStatus: req.body.status },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: item,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        res.status(404).json({ success: false, message: 'Equipment not found' })
        return
      }
      next(error)
    }
  },
)

// PATCH /api/equipment/:id/technician (ADMIN, BIOMEDICAL_ENGINEER only)
router.patch(
  '/:id/technician',
  requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'),
  validate(assignTechnicianSchema),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const item = await equipmentService.assignTechnician(id, req.body.technicianId)

      await auditService.log({
        userId: req.user?.id,
        action: 'EQUIPMENT_TECHNICIAN_ASSIGNED',
        entityType: 'Equipment',
        entityId: item.id,
        details: { assignedTechnicianId: req.body.technicianId },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: item,
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'NOT_FOUND') {
          res.status(404).json({ success: false, message: 'Equipment not found' })
          return
        }
        if (error.message === 'INVALID_TECHNICIAN') {
          res.status(400).json({ success: false, message: 'Invalid or inactive technician profile' })
          return
        }
      }
      next(error)
    }
  },
)

export default router
