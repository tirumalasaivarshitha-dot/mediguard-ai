import { prisma } from '../config/database'
import { WorkOrderStatus, Priority, WorkOrderType, EquipmentStatus, AlertSeverity, NotificationType, UserRole } from '@prisma/client'
import { equipmentService, UserScope } from './equipment.service'
import { auditService } from './audit.service'
import { socketManager } from '../sockets/socketManager'
import { notificationService } from './notification.service'

export interface WorkOrderFilterParams {
  search?: string
  status?: WorkOrderStatus
  priority?: Priority
  type?: WorkOrderType
  technicianId?: string
  equipmentId?: string
  department?: string
  overdue?: boolean
  page?: number
  limit?: number
}

// Retained only as historical demo reference; operational methods never read it.
/*
  {
    id: 'wo-1024',
    workOrderCode: 'WO-1024',
    equipmentId: 'eq-mri-042',
    title: 'High Thermal Stress Inspection & Cooling Subsystem Service',
    description: 'AI Assessment detected elevated temperature (48.5°C) and power fluctuations.',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    status: 'PENDING',
    scheduledAt: new Date(Date.now() + 86400000),
    dueAt: new Date(Date.now() + 172800000),
    startedAt: null,
    completedAt: null,
    estimatedCost: 1200,
    actualCost: null,
    maintenanceCost: null,
    downtimeMinutes: null,
    partsUsed: ['Cooling Pump Seal Kit', 'Thermal Paste'],
    notes: 'Generated from AI Risk Assessment (Failure Risk: 58%).',
    technicianNotes: null,
    completionNotes: null,
    source: 'AI_ASSESSMENT',
    assessmentId: 'ass-101',
    assignedTechnicianId: 'u-tech',
    createdById: 'u-admin',
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(),
    equipment: {
      id: 'eq-mri-042',
      equipmentCode: 'MRI-042',
      name: 'High-Field MRI Scanner',
      equipmentType: 'MRI Scanner',
      department: 'Radiology',
      location: 'Imaging Suite 2',
    },
    assignedTechnician: {
      id: 'u-tech',
      employeeCode: 'TECH-104',
      user: { name: 'James Okonkwo', email: 'jokonkwo@riverside.hospital' },
    },
    safetyAlerts: {
      select: {
        id: true,
        title: true,
        description: true,
        riskScore: true,
        status: true,
        resolutionNotes: true,
      },
    },
  },
  {
    id: 'wo-1025',
    workOrderCode: 'WO-1025',
    equipmentId: 'eq-vent-018',
    title: 'Routine Preventive Calibration & Filter Replacement',
    description: 'Quarterly Hamilton Ventilator calibration and oxygen sensor check.',
    type: 'PREVENTIVE',
    priority: 'MEDIUM',
    status: 'COMPLETED',
    scheduledAt: new Date(Date.now() - 604800000),
    dueAt: new Date(Date.now() - 518400000),
    startedAt: new Date(Date.now() - 600000000),
    completedAt: new Date(Date.now() - 590000000),
    estimatedCost: 350,
    actualCost: 320,
    maintenanceCost: 320,
    downtimeMinutes: 45,
    partsUsed: ['HAMILTON O2 Cell', 'HEPA Filter Pack'],
    notes: 'Routine maintenance completed per hospital schedule.',
    technicianNotes: 'Sensors calibrated to hamilton factory specifications.',
    completionNotes: 'All pressure tests passed. Equipment returned to service.',
    source: 'MANUAL',
    assessmentId: null,
    assignedTechnicianId: 'u-tech',
    createdById: 'u-biomed',
    createdAt: new Date(Date.now() - 700000000),
    updatedAt: new Date(Date.now() - 590000000),
    equipment: {
      id: 'eq-vent-018',
      equipmentCode: 'VENT-018',
      name: 'ICU Mechanical Ventilator',
      equipmentType: 'Ventilator',
      department: 'Emergency',
      location: 'ICU Bed 04',
    },
    assignedTechnician: {
      id: 'u-tech',
      employeeCode: 'TECH-104',
      user: { name: 'James Okonkwo', email: 'jokonkwo@riverside.hospital' },
    },
    safetyAlerts: {
      select: {
        id: true,
        title: true,
        description: true,
        riskScore: true,
        status: true,
        resolutionNotes: true,
      },
    },
  },
]
*/

export const maintenanceService = {
  async createWorkOrderFromAlert(alertId: string, userScope: UserScope, userId: string) {
    const role = userScope.role.toUpperCase()
    if (role !== UserRole.ADMIN && role !== UserRole.BIOMEDICAL_ENGINEER && role !== 'ADMIN' && role !== 'BIOMEDICAL_ENGINEER') {
      throw new Error('FORBIDDEN')
    }

    const alert = await prisma.safetyAlert.findUnique({
      where: { id: alertId },
      include: {
        equipment: true,
        assessment: true,
        assignedTo: { include: { user: true } },
        workOrder: true,
      },
    })
    if (!alert) throw new Error('SAFETY_ALERT_NOT_FOUND')
    if (alert.status === 'RESOLVED' || alert.status === 'DISMISSED') throw new Error('SAFETY_ALERT_CLOSED')
    if (alert.workOrder) return { duplicate: true, workOrder: alert.workOrder }
    const activeDataset = await prisma.dataset.findFirst({
      where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } },
      select: { id: true },
    })
    if (!activeDataset || alert.equipment.sourceDatasetId !== activeDataset.id) throw new Error('EQUIPMENT_NOT_IN_ACTIVE_DATASET')

    const priority = alert.severity === AlertSeverity.CRITICAL
      ? Priority.CRITICAL
      : alert.severity === AlertSeverity.HIGH
        ? Priority.HIGH
        : alert.severity === AlertSeverity.WARNING
          ? Priority.MEDIUM
          : Priority.LOW
    const workOrder = await prisma.maintenanceWorkOrder.create({
      data: {
        workOrderCode: `WO-${1024 + (Date.now() % 9000)}`,
        equipmentId: alert.equipmentId,
        title: `Early-warning maintenance: ${alert.title}`,
        description: `${alert.description}\nOriginating safety alert: ${alert.id}`,
        type: WorkOrderType.CORRECTIVE,
        priority,
        status: alert.assignedToId ? WorkOrderStatus.ASSIGNED : WorkOrderStatus.PENDING,
        assignedTechnicianId: alert.assignedToId,
        source: 'AI_EARLY_WARNING',
        assessmentId: alert.assessmentId,
        notes: `Created from safety alert ${alert.id}. Biomedical review is required before work begins.`,
        createdById: userId,
      },
      include: {
        equipment: true,
        assessment: { select: { failureRisk: true } },
        assignedTechnician: { include: { user: true } },
      },
    })

    await prisma.safetyAlert.update({
      where: { id: alert.id },
      data: { workOrderId: workOrder.id },
    })
    socketManager.emit('maintenance:created', workOrder)
    socketManager.emitToRoom(`equipment:${alert.equipmentId}`, 'maintenance:created', workOrder)
    await notificationService.notifyResponsiblePersonnel({
      title: `Maintenance work created: ${workOrder.title}`,
      message: `Work order ${workOrder.workOrderCode} was created from safety alert ${alert.id} for ${alert.equipment.equipmentCode}.`,
      type: NotificationType.WORK_ORDER_UPDATE,
      severity: alert.severity,
      relatedEquipmentId: alert.equipmentId,
      relatedAlertId: alert.id,
      assignedTechnicianUserId: alert.assignedTo?.userId,
    })
    return {
      duplicate: false,
      workOrder: {
        ...workOrder,
        failureRisk: workOrder.assessment?.failureRisk ?? alert.assessment?.failureRisk ?? alert.riskScore ?? null,
      },
    }
  },

  async listWorkOrders(params: WorkOrderFilterParams, scope?: UserScope) {
    const page = Math.max(1, params.page || 1)
    const limit = Math.min(100, Math.max(1, params.limit || 20))
    const skip = (page - 1) * limit

    const where: any = {}
    const activeDataset = await prisma.dataset.findFirst({
      where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } },
      select: { id: true },
    })
    where.equipment = { sourceDatasetId: activeDataset?.id || '__NO_ACTIVE_DATASET__' }

    // RBAC scoping
    if (scope) {
      const roleUpper = scope.role.toUpperCase()
      if (roleUpper === 'TECHNICIAN' || roleUpper === 'MAINTENANCE_TECHNICIAN') {
        where.AND = [{
          OR: [
            { assignedTechnicianId: scope.userId },
            { assignedTechnician: { userId: scope.userId } },
          ],
        }]
      }
    }

    if (params.status) where.status = params.status
    if (params.priority) where.priority = params.priority
    if (params.type) where.type = params.type
    if (params.technicianId) where.assignedTechnicianId = params.technicianId
    if (params.equipmentId) where.equipmentId = params.equipmentId
    if (params.department) {
      where.equipment = { ...where.equipment, department: params.department }
    }
    if (params.overdue) {
      where.dueAt = { lt: new Date() }
      where.status = { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] }
    }

    if (params.search) {
      const q = params.search.trim()
      where.OR = [
        { workOrderCode: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { equipmentId: { contains: q, mode: 'insensitive' } },
        { equipment: { equipmentCode: { contains: q, mode: 'insensitive' } } },
        { equipment: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    try {
      const [total, records] = await Promise.all([
        prisma.maintenanceWorkOrder.count({ where }),
        prisma.maintenanceWorkOrder.findMany({
          where,
          skip,
          take: limit,
          include: {
            equipment: {
              select: {
                id: true,
                equipmentCode: true,
                name: true,
                equipmentType: true,
                department: true,
                location: true,
                status: true,
              },
            },
            assignedTechnician: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
            assessment: { select: { failureRisk: true } },
            safetyAlerts: {
              select: { id: true, title: true, status: true, riskScore: true, description: true, resolutionNotes: true },
            },
            createdBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      return {
        records: records.map((record) => ({
          ...record,
          failureRisk: record.assessment?.failureRisk ?? record.safetyAlerts[0]?.riskScore ?? null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      }
    } catch (error: any) {
      console.error(`[Maintenance] PostgreSQL list failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async getWorkOrderById(id: string, scope?: UserScope) {
    try {
      const item = await prisma.maintenanceWorkOrder.findFirst({
        where: { OR: [{ id }, { workOrderCode: id }] },
        include: {
          equipment: true,
          assignedTechnician: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, role: true } },
          assessment: { select: { failureRisk: true } },
          safetyAlerts: {
            select: { id: true, title: true, status: true, riskScore: true },
          },
        },
      })

      if (!item) return null

      if (scope) {
        const roleUpper = scope.role.toUpperCase()
        if ((roleUpper === 'TECHNICIAN' || roleUpper === 'MAINTENANCE_TECHNICIAN') &&
            item.assignedTechnician?.userId !== scope.userId) {
          return 'FORBIDDEN'
        }
      }

      return item
        ? {
            ...item,
            failureRisk: item.assessment?.failureRisk ?? item.safetyAlerts[0]?.riskScore ?? null,
          }
        : item as typeof item | 'FORBIDDEN'
    } catch (error: any) {
      console.error(`[Maintenance] PostgreSQL read failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async getWorkOrdersByEquipment(equipmentId: string, scope?: UserScope) {
    const eq = await equipmentService.getEquipmentById(equipmentId, scope)
    if (!eq || eq === 'FORBIDDEN') {
      throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
    }

    try {
      return await prisma.maintenanceWorkOrder.findMany({
        where: { equipmentId },
        include: {
          assignedTechnician: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    } catch (error: any) {
      console.error(`[Maintenance] PostgreSQL history read failed for ${equipmentId}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async createWorkOrder(
    data: {
      equipmentId: string
      title: string
      description?: string
      type?: WorkOrderType
      priority?: Priority
      assignedTechnicianId?: string
      scheduledAt?: string | Date
      dueAt?: string | Date
      notes?: string
      source?: string
      assessmentId?: string
      partsUsed?: string[]
      estimatedCost?: number
    },
    userScope?: UserScope,
    userId?: string
  ) {
    // Check equipment existence and RBAC scope
    const eq = await equipmentService.getEquipmentById(data.equipmentId, userScope)
    if (!eq || eq === 'FORBIDDEN') {
      throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
    }

    const eqTargetId = typeof eq === 'object' ? eq.id : data.equipmentId

    // Check for existing duplicate active work order for this equipment
    const existingActive = await this.getActiveWorkOrderForEquipment(eqTargetId)
    if (existingActive) {
      return {
        duplicate: true,
        message: `An active work order (${existingActive.workOrderCode || existingActive.id}) is already in progress for equipment ${eqTargetId}.`,
        existingWorkOrder: existingActive,
      }
    }

    const codeNumber = 1024 + (Date.now() % 9000)
    const workOrderCode = `WO-${codeNumber}`
    const priority = data.priority || Priority.MEDIUM
    const status = data.assignedTechnicianId ? WorkOrderStatus.ASSIGNED : WorkOrderStatus.PENDING

    const payload = {
      workOrderCode,
      equipmentId: eqTargetId,
      title: data.title,
      description: data.description || null,
      type: data.type || WorkOrderType.PREVENTIVE,
      priority,
      status,
      assignedTechnicianId: data.assignedTechnicianId || null,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      notes: data.notes || null,
      estimatedCost: data.estimatedCost ?? null,
      partsUsed: data.partsUsed ? JSON.parse(JSON.stringify(data.partsUsed)) : null,
      source: data.source || 'MANUAL',
      assessmentId: data.assessmentId || null,
      createdById: userId || null,
    }

    let savedWo: any = null

    try {
      savedWo = await prisma.maintenanceWorkOrder.create({
        data: payload,
        include: {
          equipment: true,
          assignedTechnician: { include: { user: true } },
        },
      })
    } catch (error: any) {
      console.error(`[Maintenance] PostgreSQL create failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }

    // Emit Socket.IO event
    socketManager.emit('maintenance:created', savedWo)
    socketManager.emitToRoom(`equipment:${eqTargetId}`, 'maintenance:created', savedWo)

    // Audit Logging
    try {
      await auditService.log({
        userId,
        action: 'WORK_ORDER_CREATED',
        entityType: 'MaintenanceWorkOrder',
        entityId: savedWo.id,
        details: {
          workOrderCode: savedWo.workOrderCode,
          equipmentId: eqTargetId,
          priority: savedWo.priority,
          source: savedWo.source,
        },
      })
    } catch {}

    return savedWo
  },

  async getActiveWorkOrderForEquipment(equipmentId: string) {
    const activeStatuses: WorkOrderStatus[] = [WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED, WorkOrderStatus.SCHEDULED, WorkOrderStatus.IN_PROGRESS]
    try {
      return await prisma.maintenanceWorkOrder.findFirst({
        where: {
          equipmentId,
          status: { in: activeStatuses },
        },
        orderBy: { createdAt: 'desc' },
      })
    } catch (error: any) {
      console.error(`[Maintenance] PostgreSQL active work-order read failed for ${equipmentId}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async updateWorkOrder(id: string, patch: any, userScope?: UserScope) {
    const current = await this.getWorkOrderById(id, userScope)
    if (!current || current === 'FORBIDDEN') {
      throw new Error(current === 'FORBIDDEN' ? 'FORBIDDEN' : 'WORK_ORDER_NOT_FOUND')
    }

    const payload: any = {}
    if (patch.title) payload.title = patch.title
    if (patch.description !== undefined) payload.description = patch.description
    if (patch.priority) payload.priority = patch.priority
    if (patch.type) payload.type = patch.type
    if (patch.scheduledAt !== undefined) payload.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null
    if (patch.dueAt !== undefined) payload.dueAt = patch.dueAt ? new Date(patch.dueAt) : null
    if (patch.notes !== undefined) payload.notes = patch.notes
    if (patch.technicianNotes !== undefined) payload.technicianNotes = patch.technicianNotes

    try {
      const updated = await prisma.maintenanceWorkOrder.update({
        where: { id: current.id },
        data: payload,
        include: { equipment: true, assignedTechnician: { include: { user: true } } },
      })
      socketManager.emit('maintenance:updated', updated)
      return updated
    } catch {
      Object.assign(current, payload, { updatedAt: new Date() })
      socketManager.emit('maintenance:updated', current)
      return current
    }
  },

  async updateWorkOrderStatus(id: string, newStatus: WorkOrderStatus, notes?: string, userScope?: UserScope) {
    const current = await this.getWorkOrderById(id, userScope)
    if (!current || current === 'FORBIDDEN') {
      throw new Error(current === 'FORBIDDEN' ? 'FORBIDDEN' : 'WORK_ORDER_NOT_FOUND')
    }

    // Role check for Maintenance Technicians: cannot modify unrelated work orders
    if (userScope) {
      const roleUpper = userScope.role.toUpperCase()
      if (roleUpper === 'TECHNICIAN' || roleUpper === 'MAINTENANCE_TECHNICIAN') {
        const isAssigned = current.assignedTechnicianId === userScope.userId || current.assignedTechnician?.userId === userScope.userId
        if (!isAssigned) {
          throw new Error('FORBIDDEN_TECHNICIAN_UNASSIGNED')
        }
      }
    }

    // Validate Status Transitions
    const allowedTransitions: Record<string, string[]> = {
      PENDING: ['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
      ASSIGNED: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
      SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    }

    const currentStatus = current.status as string
    if (currentStatus !== newStatus && !allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot transition work order from ${currentStatus} to ${newStatus}`)
    }

    const payload: any = { status: newStatus }
    if (notes) payload.technicianNotes = notes
    if (newStatus === WorkOrderStatus.IN_PROGRESS) {
      payload.startedAt = new Date()
    } else if (newStatus === WorkOrderStatus.COMPLETED) {
      payload.completedAt = new Date()
    }

    let updated: any = null
    try {
      updated = await prisma.maintenanceWorkOrder.update({
        where: { id: current.id },
        data: payload,
        include: { equipment: true, assignedTechnician: { include: { user: true } } },
      })
    } catch {
      Object.assign(current, payload, { updatedAt: new Date() })
      updated = current
    }

    // If status became IN_PROGRESS, update equipment status to UNDER_MAINTENANCE / MAINTENANCE
    if (newStatus === WorkOrderStatus.IN_PROGRESS && current.equipmentId) {
      try {
        await equipmentService.updateEquipmentStatus(current.equipmentId, EquipmentStatus.UNDER_MAINTENANCE)
      } catch {}
    }

    // Emit Socket.IO events
    const socketEvent =
      newStatus === WorkOrderStatus.IN_PROGRESS
        ? 'maintenance:started'
        : newStatus === WorkOrderStatus.CANCELLED
        ? 'maintenance:cancelled'
        : 'maintenance:updated'
    socketManager.emit(socketEvent, updated)
    socketManager.emitToRoom(`equipment:${current.equipmentId}`, socketEvent, updated)
    if (newStatus === WorkOrderStatus.IN_PROGRESS) {
      await notificationService.notifyResponsiblePersonnel({
        title: `Work started: ${updated.title}`,
        message: `${updated.workOrderCode || updated.id} is now in progress.`,
        type: NotificationType.WORK_ORDER_UPDATE,
        relatedEquipmentId: updated.equipmentId,
        assignedTechnicianUserId: updated.assignedTechnician?.userId,
      })
    }

    return updated
  },

  async assignTechnician(id: string, technicianId: string, userScope?: UserScope) {
    if (userScope?.role.toUpperCase() !== 'BIOMEDICAL_ENGINEER') {
      throw new Error('FORBIDDEN')
    }
    const current = await this.getWorkOrderById(id, userScope)
    if (!current || current === 'FORBIDDEN') {
      throw new Error(current === 'FORBIDDEN' ? 'FORBIDDEN' : 'WORK_ORDER_NOT_FOUND')
    }
    if (current.status === WorkOrderStatus.COMPLETED || current.status === WorkOrderStatus.CANCELLED) {
      throw new Error('WORK_ORDER_TERMINAL')
    }

    const technician = await prisma.technicianProfile.findUnique({
      where: { id: technicianId },
      include: { user: { select: { isActive: true } } },
    })
    if (!technician || !technician.user.isActive) throw new Error('TECHNICIAN_NOT_FOUND')

    const nextStatus = current.status === WorkOrderStatus.PENDING ? WorkOrderStatus.ASSIGNED : current.status

    try {
      const updated = await prisma.maintenanceWorkOrder.update({
        where: { id: current.id },
        data: {
          assignedTechnicianId: technicianId,
          status: nextStatus,
        },
        include: { equipment: true, assignedTechnician: { include: { user: true } } },
      })
      socketManager.emit('maintenance:assigned', updated)
      await notificationService.notifyResponsiblePersonnel({
        title: `Work order assigned: ${updated.title}`,
        message: `You have been assigned ${updated.workOrderCode || updated.id} for ${updated.equipment.equipmentCode}.`,
        type: NotificationType.TECHNICIAN_ASSIGNMENT,
        severity: updated.priority === Priority.CRITICAL ? AlertSeverity.CRITICAL : updated.priority === Priority.HIGH ? AlertSeverity.HIGH : AlertSeverity.INFO,
        relatedEquipmentId: updated.equipmentId,
        assignedTechnicianUserId: updated.assignedTechnician?.userId,
      })
      return updated
    } catch {
      current.assignedTechnicianId = technicianId
      current.status = nextStatus
      socketManager.emit('maintenance:assigned', current)
      return current
    }
  },

  async scheduleWorkOrder(id: string, scheduledAt: string | Date, dueAt?: string | Date, userScope?: UserScope) {
    const current = await this.getWorkOrderById(id, userScope)
    if (!current || current === 'FORBIDDEN') {
      throw new Error(current === 'FORBIDDEN' ? 'FORBIDDEN' : 'WORK_ORDER_NOT_FOUND')
    }

    const nextStatus = current.status === WorkOrderStatus.PENDING || current.status === WorkOrderStatus.ASSIGNED ? WorkOrderStatus.SCHEDULED : current.status

    const payload: any = {
      scheduledAt: new Date(scheduledAt),
      status: nextStatus,
    }
    if (dueAt) payload.dueAt = new Date(dueAt)

    try {
      const updated = await prisma.maintenanceWorkOrder.update({
        where: { id: current.id },
        data: payload,
        include: { equipment: true, assignedTechnician: { include: { user: true } } },
      })
      socketManager.emit('maintenance:scheduled', updated)
      await notificationService.notifyResponsiblePersonnel({
        title: `Work order scheduled: ${updated.title}`,
        message: `${updated.workOrderCode || updated.id} is scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
        type: NotificationType.WORK_ORDER_UPDATE,
        relatedEquipmentId: updated.equipmentId,
        assignedTechnicianUserId: updated.assignedTechnician?.userId,
      })
      return updated
    } catch {
      Object.assign(current, payload, { updatedAt: new Date() })
      socketManager.emit('maintenance:scheduled', current)
      return current
    }
  },

  async completeWorkOrder(
    id: string,
    data: {
      completionNotes?: string
      technicianNotes?: string
      partsUsed?: string[]
      maintenanceCost?: number
      downtimeMinutes?: number
    },
    userScope?: UserScope,
    userId?: string
  ) {
    const current = await this.getWorkOrderById(id, userScope)
    if (!current || current === 'FORBIDDEN') {
      throw new Error(current === 'FORBIDDEN' ? 'FORBIDDEN' : 'WORK_ORDER_NOT_FOUND')
    }

    const payload: any = {
      status: WorkOrderStatus.COMPLETED,
      completedAt: new Date(),
      completionNotes: data.completionNotes || null,
      technicianNotes: data.technicianNotes || current.technicianNotes || null,
      partsUsed: data.partsUsed ? JSON.parse(JSON.stringify(data.partsUsed)) : current.partsUsed,
      maintenanceCost: data.maintenanceCost ?? current.maintenanceCost ?? current.actualCost ?? null,
      actualCost: data.maintenanceCost ?? current.actualCost ?? null,
      downtimeMinutes: data.downtimeMinutes ?? current.downtimeMinutes ?? null,
    }

    let updated: any = null
    try {
      updated = await prisma.maintenanceWorkOrder.update({
        where: { id: current.id },
        data: payload,
        include: { equipment: true, assignedTechnician: { include: { user: true } } },
      })
    } catch {
      Object.assign(current, payload, { updatedAt: new Date() })
      updated = current
    }

    // Update equipment status and last maintenance timestamp
    if (current.equipmentId) {
      try {
        await prisma.equipment.update({
          where: { id: current.equipmentId },
          data: {
            status: EquipmentStatus.OPERATIONAL,
            lastMaintenanceAt: new Date(),
          },
        })
      } catch {
        if (current.equipment && typeof current.equipment === 'object') {
          current.equipment.status = EquipmentStatus.OPERATIONAL
          current.equipment.lastMaintenanceAt = new Date()
        }
      }
    }

    // Emit Socket.IO real-time completion event
    socketManager.emit('maintenance:completed', updated)
    socketManager.emitToRoom(`equipment:${current.equipmentId}`, 'maintenance:completed', updated)
    await notificationService.notifyResponsiblePersonnel({
      title: `Maintenance completed: ${updated.title}`,
      message: `${updated.workOrderCode || updated.id} is complete. Equipment reassessment is required before the originating alert is resolved.`,
      type: NotificationType.RETURNED_TO_SERVICE,
      relatedEquipmentId: updated.equipmentId,
      assignedTechnicianUserId: updated.assignedTechnician?.userId,
    })

    // Audit Logging
    try {
      await auditService.log({
        userId,
        action: 'WORK_ORDER_COMPLETED',
        entityType: 'MaintenanceWorkOrder',
        entityId: updated.id,
        details: {
          workOrderCode: updated.workOrderCode,
          equipmentId: updated.equipmentId,
          maintenanceCost: updated.maintenanceCost,
          downtimeMinutes: updated.downtimeMinutes,
        },
      })
    } catch {}

    return updated
  },
}
