import { prisma } from '../config/database'
import { AlertSeverity, AlertStatus, UserRole, NotificationType } from '@prisma/client'
import { UserScope } from './equipment.service'
import { auditService } from './audit.service'
import { notificationService } from './notification.service'
import { socketManager } from '../sockets/socketManager'

export interface CreateAlertInput {
  equipmentId: string
  assessmentId?: string
  title: string
  description: string
  severity?: AlertSeverity
  riskScore?: number
  source?: string
  assignedToId?: string
}

export interface ListAlertsFilters {
  status?: AlertStatus
  severity?: AlertSeverity
  equipmentId?: string
  department?: string
  assignedToId?: string
  unresolved?: boolean
  page?: number
  limit?: number
}

const ACTIVE_ALERT_STATUSES: AlertStatus[] = [
  AlertStatus.OPEN,
  AlertStatus.ACKNOWLEDGED,
  AlertStatus.ASSIGNED,
  AlertStatus.ESCALATED,
]

const ALERT_SEVERITY_RANK: Record<AlertSeverity, number> = {
  [AlertSeverity.INFO]: 0,
  [AlertSeverity.WARNING]: 1,
  [AlertSeverity.HIGH]: 2,
  [AlertSeverity.CRITICAL]: 3,
}

// Retained only as historical demo reference; operational methods never read it.
/*
  {
    id: 'alt-101',
    equipmentId: 'eq-mri-042',
    title: 'High Thermal Stress Alert',
    description: 'Operating temperature exceeded 48.5°C threshold.',
    severity: AlertSeverity.HIGH,
    status: AlertStatus.OPEN,
    riskScore: 58,
    source: 'AI_ASSESSMENT',
    assignedToId: 'u-tech',
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 3600000),
    equipment: {
      id: 'eq-mri-042',
      equipmentCode: 'MRI-042',
      name: 'High-Field MRI Scanner',
      equipmentType: 'MRI Scanner',
      department: 'Radiology',
      location: 'Imaging Suite 2',
      healthScore: 42,
      failureRisk: 58,
      status: 'ATTENTION_REQUIRED',
    },
    assignedTo: {
      id: 'u-tech',
      employeeCode: 'TECH-104',
      user: { id: 'u-tech', name: 'James Okonkwo', email: 'jokonkwo@riverside.hospital', role: 'TECHNICIAN' },
    },
  },
  {
    id: 'alt-102',
    equipmentId: 'eq-vent-018',
    title: 'Flow Sensor Calibration Drift',
    description: 'Ventilator flow sensor deviation exceeds 8%. Safety inspection required.',
    severity: AlertSeverity.CRITICAL,
    status: AlertStatus.ACKNOWLEDGED,
    riskScore: 78,
    source: 'AI_ASSESSMENT',
    assignedToId: 'u-tech',
    createdAt: new Date(Date.now() - 7200000),
    updatedAt: new Date(Date.now() - 1800000),
    acknowledgedAt: new Date(Date.now() - 1800000),
    equipment: {
      id: 'eq-vent-018',
      equipmentCode: 'VENT-018',
      name: 'ICU Mechanical Ventilator',
      equipmentType: 'Ventilator',
      department: 'Emergency',
      location: 'ICU Bed 04',
      healthScore: 28,
      failureRisk: 78,
      status: 'CRITICAL',
    },
    assignedTo: {
      id: 'u-tech',
      employeeCode: 'TECH-104',
      user: { id: 'u-tech', name: 'James Okonkwo', email: 'jokonkwo@riverside.hospital', role: 'TECHNICIAN' },
    },
  },
]
*/

export const safetyService = {
  /**
   * List safety alerts with pagination and server-side RBAC scoping
   */
  async listAlerts(filters?: ListAlertsFilters, scope?: UserScope) {
    const page = Math.max(1, filters?.page || 1)
    const limit = Math.min(100, Math.max(1, filters?.limit || 20))
    const skip = (page - 1) * limit

    try {
      const where: any = {}
      const roleUpper = scope?.role.toUpperCase()
      const activeDataset = await prisma.dataset.findFirst({
        where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } },
        select: { id: true },
      })
      where.equipment = { sourceDatasetId: activeDataset?.id || '__NO_ACTIVE_DATASET__' }

      if (roleUpper === UserRole.ADMIN) {
        where.status = AlertStatus.OPEN
      } else if (filters?.status) {
        where.status = filters.status
      } else if (filters?.unresolved) {
        where.status = { in: ACTIVE_ALERT_STATUSES }
      }

      if (filters?.severity) {
        where.severity = filters.severity
      }

      if (filters?.equipmentId) {
        where.equipmentId = filters.equipmentId
      }

      if (filters?.assignedToId) {
        where.assignedToId = filters.assignedToId
      }

      if (scope) {
        if (roleUpper === UserRole.TECHNICIAN) {
          where.OR = [
            { assignedTo: { userId: scope.userId } },
            { equipment: { assignedTechnician: { userId: scope.userId } } },
          ]
        }
      }

      if (filters?.department) {
        where.equipment = { ...(where.equipment || {}), department: filters.department }
      }

      const [total, records] = await Promise.all([
        prisma.safetyAlert.count({ where }),
        prisma.safetyAlert.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            equipment: {
              select: {
                id: true,
                equipmentCode: true,
                name: true,
                equipmentType: true,
                department: true,
                location: true,
                healthScore: true,
                failureRisk: true,
                status: true,
              },
            },
            assessment: {
              select: {
                id: true,
                healthScore: true,
                failureRisk: true,
                safetyStatus: true,
                explanation: true,
                assessedAt: true,
              },
            },
            assignedTo: {
              include: {
                user: { select: { id: true, name: true, email: true, role: true } },
              },
            },
            workOrder: {
              select: {
                id: true,
                workOrderCode: true,
                title: true,
                status: true,
                priority: true,
              },
            },
          },
        }),
      ])

      return {
        records,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      }
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL list failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Get single safety alert by ID
   */
  async getAlertById(id: string, scope?: UserScope) {
    try {
      const alert = await prisma.safetyAlert.findUnique({
        where: { id },
        include: {
          equipment: {
            include: {
              assignedTechnician: {
                include: { user: { select: { id: true, name: true, email: true } } },
              },
            },
          },
          assessment: true,
          assignedTo: {
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
          },
          workOrder: true,
          notifications: { take: 5, orderBy: { createdAt: 'desc' } },
        },
      })

      if (alert) {
        if (scope) {
          if (scope.role === UserRole.TECHNICIAN &&
              alert.assignedTo?.userId !== scope.userId &&
              alert.equipment?.assignedTechnician?.userId !== scope.userId) {
            return 'FORBIDDEN'
          }
        }
        return alert as typeof alert | 'FORBIDDEN'
      }
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL read failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Get safety alerts for equipment
   */
  async getAlertsByEquipmentId(equipmentId: string, scope?: UserScope) {
    try {
      const where: any = {
        OR: [{ equipmentId }, { equipment: { equipmentCode: equipmentId } }],
      }
      if (scope?.role === UserRole.TECHNICIAN) {
        where.OR = [
          { assignedTo: { userId: scope.userId } },
          { equipment: { assignedTechnician: { userId: scope.userId } } },
        ]
      }
      const eqAlerts = await prisma.safetyAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: {
            include: { user: { select: { name: true, email: true } } },
          },
          workOrder: {
            select: { id: true, workOrderCode: true, status: true },
          },
        },
      })

      return eqAlerts
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL equipment alerts read failed for ${equipmentId}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Create or update safety alert
   */
  async createAlert(input: CreateAlertInput, actorId?: string) {
    let equipment: any = null
    try {
      equipment = await prisma.equipment.findFirst({
        where: { OR: [{ id: input.equipmentId }, { equipmentCode: input.equipmentId }] },
        include: { assignedTechnician: { include: { user: true } } },
      })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL equipment lookup failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
    if (!equipment) throw new Error('EQUIPMENT_NOT_FOUND')
    const activeDataset = await prisma.dataset.findFirst({
      where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } },
      select: { id: true },
    })
    if (!activeDataset || equipment.sourceDatasetId !== activeDataset.id) throw new Error('EQUIPMENT_NOT_IN_ACTIVE_DATASET')

    // Check duplicate active alert
    let existingActive: any = null
    try {
      existingActive = await prisma.safetyAlert.findFirst({
        where: {
          equipmentId: equipment.id,
          status: { in: ACTIVE_ALERT_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL active-alert lookup failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }

    if (existingActive) {
      try {
        const previousRisk = existingActive.riskScore
        const previousSeverity = existingActive.severity
        const nextSeverity = input.severity && ALERT_SEVERITY_RANK[input.severity] > ALERT_SEVERITY_RANK[existingActive.severity as AlertSeverity]
          ? input.severity
          : existingActive.severity
        const updatedAlert = await prisma.safetyAlert.update({
          where: { id: existingActive.id },
          data: {
            riskScore: input.riskScore ?? existingActive.riskScore,
            assessmentId: input.assessmentId || existingActive.assessmentId,
            description: `${existingActive.description}\n[Update]: ${input.description}`,
            severity: nextSeverity,
          },
          include: { equipment: true, assignedTo: { include: { user: true } } },
        })
        const riskChanged = input.riskScore !== undefined && input.riskScore !== previousRisk
        const severityChanged = nextSeverity !== previousSeverity
        if (riskChanged || severityChanged) {
          socketManager.emit('safety:escalated', {
            alertId: updatedAlert.id,
            equipmentId: updatedAlert.equipmentId,
            severity: updatedAlert.severity,
            riskScore: updatedAlert.riskScore,
            status: updatedAlert.status,
            updated: true,
          })
          await notificationService.notifyResponsiblePersonnel({
            title: `Safety Alert Updated: ${updatedAlert.title}`,
            message: `${updatedAlert.description} (${equipment.equipmentCode || equipment.id})`,
            severity: updatedAlert.severity,
            relatedEquipmentId: equipment.id,
            relatedAlertId: updatedAlert.id,
            department: equipment.department,
            assignedTechnicianUserId: equipment.assignedTechnician?.userId,
          })
        }
        return { alert: updatedAlert, isDuplicate: true }
      } catch (error: any) {
        console.error(`[Safety] PostgreSQL alert update failed for ${existingActive.id}: ${error?.message || error}`)
        throw new Error('DATABASE_UNAVAILABLE')
      }
    }

    // Create new alert
    let newAlert: any = null
    try {
      newAlert = await prisma.safetyAlert.create({
        data: {
          equipmentId: equipment.id,
          assessmentId: input.assessmentId,
          title: input.title,
          description: input.description,
          severity: input.severity || AlertSeverity.WARNING,
          status: AlertStatus.OPEN,
          riskScore: input.riskScore ?? null,
          source: input.source || 'AI_ASSESSMENT',
          assignedToId: input.assignedToId || equipment.assignedTechnicianId,
        },
        include: {
          equipment: true,
          assignedTo: { include: { user: true } },
        },
      })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL alert creation failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }

    // Audit Log & Notification & Socket Emission
    try {
      await auditService.log({
        userId: actorId || undefined,
        action: 'SAFETY_ALERT_CREATED',
        entityType: 'SafetyAlert',
        entityId: newAlert.id,
        details: {
          equipmentId: newAlert.equipmentId,
          severity: newAlert.severity,
          riskScore: newAlert.riskScore,
          source: newAlert.source,
        },
      })
    } catch {}

    try {
      await notificationService.notifyResponsiblePersonnel({
        title: `Safety Review Recommended: ${newAlert.title}`,
        message: `${newAlert.description} (${equipment.equipmentCode || equipment.id})`,
        severity: newAlert.severity,
        relatedEquipmentId: equipment.id,
        relatedAlertId: newAlert.id,
        department: equipment.department,
        assignedTechnicianUserId: equipment.assignedTechnician?.userId,
      })
    } catch {}

    socketManager.emit('safety:created', {
      alertId: newAlert.id,
      equipmentId: newAlert.equipmentId,
      severity: newAlert.severity,
      status: newAlert.status,
      title: newAlert.title,
      createdAt: newAlert.createdAt,
    })

    return { alert: newAlert, isDuplicate: false }
  },

  /**
   * Acknowledge safety alert
   */
  async acknowledgeAlert(id: string, actor: { userId: string; role: string }) {
    let alert: any = null
    try {
      alert = await prisma.safetyAlert.findUnique({ where: { id } })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL lookup failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }

    if (!alert) throw new Error('Safety alert not found')

    if (actor.role.toUpperCase() === UserRole.TECHNICIAN) {
      throw new Error('FORBIDDEN')
    }

    if (alert.status === AlertStatus.RESOLVED || alert.status === AlertStatus.DISMISSED) {
      throw new Error(`Cannot acknowledge safety alert in '${alert.status}' state`)
    }

    try {
      const updated = await prisma.safetyAlert.update({
        where: { id },
        data: {
          status: AlertStatus.ACKNOWLEDGED,
          acknowledgedAt: new Date(),
        },
        include: { equipment: true, assignedTo: { include: { user: true } } },
      })
      try {
        await auditService.log({
          userId: actor.userId,
          action: 'SAFETY_ALERT_ACKNOWLEDGED',
          entityType: 'SafetyAlert',
          entityId: id,
          details: { equipmentId: updated.equipmentId },
        })
      } catch (auditError: any) {
        console.error(`[Safety] Acknowledgement audit failed for ${id}: ${auditError?.message || auditError}`)
      }
      socketManager.emit('safety:acknowledged', { alertId: id, equipmentId: updated.equipmentId, status: updated.status })
      return updated
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL acknowledgement failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Assign technician to safety alert
   */
  async assignAlert(id: string, technicianId: string, actor: { userId: string; role: string }) {
    let alert: any = null
    try {
      alert = await prisma.safetyAlert.findUnique({ where: { id } })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL lookup failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
    if (!alert) throw new Error('Safety alert not found')

    const technician = await prisma.technicianProfile.findUnique({
      where: { id: technicianId },
      include: { user: { select: { id: true, isActive: true } } },
    })
    if (!technician || !technician.user.isActive) throw new Error('TECHNICIAN_NOT_FOUND')

    if (alert.status === AlertStatus.RESOLVED || alert.status === AlertStatus.DISMISSED) {
      throw new Error(`Cannot assign technician to safety alert in '${alert.status}' state`)
    }

    try {
      const updated = await prisma.safetyAlert.update({
        where: { id },
        data: {
          assignedToId: technicianId,
          status: AlertStatus.ASSIGNED,
        },
        include: { equipment: true, assignedTo: { include: { user: true } } },
      })
      await notificationService.notifyResponsiblePersonnel({
        title: `Safety alert assigned: ${updated.title}`,
        message: `Alert ${updated.id} for ${updated.equipment.equipmentCode || updated.equipment.id} requires technician review.`,
        type: NotificationType.TECHNICIAN_ASSIGNMENT,
        severity: updated.severity,
        relatedEquipmentId: updated.equipmentId,
        relatedAlertId: updated.id,
        assignedTechnicianUserId: updated.assignedTo?.userId,
      })
      socketManager.emit('safety:assigned', { alertId: id, equipmentId: updated.equipmentId, assignedToId: technicianId })
      return updated
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL assignment failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Escalate safety alert
   */
  async escalateAlert(id: string, reason: string | undefined, actor: { userId: string; role: string }) {
    let alert: any = null
    try {
      alert = await prisma.safetyAlert.findUnique({ where: { id } })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL lookup failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
    if (!alert) throw new Error('Safety alert not found')

    if (actor.role.toUpperCase() === UserRole.TECHNICIAN) throw new Error('FORBIDDEN')

    if (alert.status === AlertStatus.RESOLVED || alert.status === AlertStatus.DISMISSED) {
      throw new Error(`Cannot escalate safety alert in '${alert.status}' state`)
    }

    try {
      const updated = await prisma.safetyAlert.update({
        where: { id },
        data: {
          status: AlertStatus.ESCALATED,
          escalatedAt: new Date(),
          description: reason ? `${alert.description}\n[ESCALATION NOTE]: ${reason}` : alert.description,
        },
        include: { equipment: true, assignedTo: { include: { user: true } } },
      })
      socketManager.emit('safety:escalated', { alertId: id, equipmentId: updated.equipmentId, status: updated.status })
      return updated
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL escalation failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Resolve safety alert
   */
  async resolveAlert(id: string, resolutionNotes: string | undefined, workOrderId: string | undefined, actor: { userId: string; role: string }) {
    const role = actor.role.toUpperCase()
    if (role !== UserRole.ADMIN && role !== UserRole.BIOMEDICAL_ENGINEER && role !== 'ADMIN' && role !== 'BIOMEDICAL_ENGINEER') {
      throw new Error('FORBIDDEN')
    }
    let alert: any = null
    try {
      alert = await prisma.safetyAlert.findUnique({ where: { id } })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL lookup failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
    if (!alert) throw new Error('Safety alert not found')

    const linkedWorkOrderId = workOrderId || alert.workOrderId
    if (linkedWorkOrderId) {
      const workOrder = await prisma.maintenanceWorkOrder.findUnique({ where: { id: linkedWorkOrderId } })
      if (!workOrder) throw new Error('WORK_ORDER_NOT_FOUND')
      if (workOrder.status !== 'COMPLETED') throw new Error('MAINTENANCE_NOT_COMPLETED')
      const reassessment = await prisma.assessment.findFirst({
        where: {
          equipmentId: alert.equipmentId,
          assessedAt: { gte: workOrder.completedAt || workOrder.updatedAt },
        },
        orderBy: { assessedAt: 'desc' },
      })
      if (!reassessment) throw new Error('REASSESSMENT_REQUIRED')
      if (reassessment.failureRisk >= 50 || reassessment.healthScore < 60 || reassessment.anomalyStatus && reassessment.anomalyStatus !== 'NORMAL') {
        throw new Error('EQUIPMENT_REMAINS_AT_RISK')
      }
    }

    try {
      const updated = await prisma.safetyAlert.update({
        where: { id },
        data: {
          status: AlertStatus.RESOLVED,
          resolvedAt: new Date(),
          resolutionNotes: resolutionNotes || 'Resolved after inspection and corrective action.',
          workOrderId: linkedWorkOrderId || undefined,
        },
        include: { equipment: true, assignedTo: { include: { user: true } } },
      })
      await notificationService.notifyResponsiblePersonnel({
        title: `Safety alert resolved: ${updated.title}`,
        message: `Alert ${updated.id} was resolved after maintenance verification.`,
        type: NotificationType.RETURNED_TO_SERVICE,
        severity: updated.severity,
        relatedEquipmentId: updated.equipmentId,
        relatedAlertId: updated.id,
        assignedTechnicianUserId: updated.assignedTo?.userId,
      })
      socketManager.emit('safety:resolved', { alertId: id, equipmentId: updated.equipmentId, status: updated.status })
      return updated
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL resolution failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Dismiss safety alert
   */
  async dismissAlert(id: string, reason: string | undefined, actor: { userId: string; role: string }) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.BIOMEDICAL_ENGINEER && actor.role !== 'admin' && actor.role !== 'biomedical_engineer') {
      throw new Error('Only Hospital Administrators and Biomedical Engineers can dismiss safety alerts.')
    }

    let alert: any = null
    try {
      alert = await prisma.safetyAlert.findUnique({ where: { id } })
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL lookup failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
    if (!alert) throw new Error('Safety alert not found')

    try {
      const updated = await prisma.safetyAlert.update({
        where: { id },
        data: {
          status: AlertStatus.DISMISSED,
          dismissedAt: new Date(),
          resolutionNotes: reason || 'Dismissed as false positive or non-actionable.',
        },
        include: { equipment: true },
      })
      socketManager.emit('safety:dismissed', { alertId: id, equipmentId: updated.equipmentId, status: updated.status })
      return updated
    } catch (error: any) {
      console.error(`[Safety] PostgreSQL dismissal failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },
}
