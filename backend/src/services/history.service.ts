import { prisma } from '../config/database'
import { UserScope } from './equipment.service'

const HISTORICAL_WORK_ORDER_STATUS = 'COMPLETED'
const HISTORICAL_ALERT_STATUSES = ['RESOLVED', 'DISMISSED']
const ADMIN_HISTORY_ALERT_STATUSES = ['ACKNOWLEDGED', 'ASSIGNED', 'ESCALATED', 'RESOLVED', 'DISMISSED']

export function buildHistoryWorkOrderWhere(scope: UserScope): any {
  const role = scope.role.toUpperCase()
  const isTechnician = role === 'TECHNICIAN' || role === 'MAINTENANCE_TECHNICIAN'

  return {
    ...(role === 'ADMIN' || role === 'HOSPITAL_ADMIN'
      ? { id: '__ADMIN_ALERT_HISTORY_ONLY__' }
      : { status: HISTORICAL_WORK_ORDER_STATUS }),
    equipment: { sourceDataset: { datasetType: { not: 'HISTORICAL_SAFETY' } } },
    ...(isTechnician
      ? { assignedTechnician: { userId: scope.userId } }
      : role === 'BIOMEDICAL_ENGINEER'
        ? {
            OR: [
              { createdById: scope.userId },
              { assignedTechnician: { userId: scope.userId } },
            ],
          }
        : {}),
  }
}

export const historyService = {
  async listHistory(scope: UserScope) {
    const role = scope.role.toUpperCase()
    const isTechnician = role === 'TECHNICIAN' || role === 'MAINTENANCE_TECHNICIAN'
    const isBiomedicalEngineer = role === 'BIOMEDICAL_ENGINEER'
    const isAdministrator = role === 'ADMIN' || role === 'HOSPITAL_ADMIN'

    try {
      const workOrderWhere = buildHistoryWorkOrderWhere(scope)

      const workOrders = await prisma.maintenanceWorkOrder.findMany({
        where: workOrderWhere as any,
        include: {
          equipment: {
            select: {
              id: true,
              equipmentCode: true,
              name: true,
              equipmentType: true,
              department: true,
              location: true,
            },
          },
          assessment: {
            select: { failureRisk: true, explanation: true },
          },
          assignedTechnician: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, role: true } },
          safetyAlerts: {
            select: { id: true, title: true, status: true, resolvedAt: true, dismissedAt: true },
          },
        },
        orderBy: { completedAt: 'desc' },
      })

      const items: any[] = workOrders.map((workOrder) => ({
        id: workOrder.id,
        type: 'MAINTENANCE',
        equipment: workOrder.equipment,
        maintenance: workOrder,
        alert: workOrder.safetyAlerts[0] || null,
        status: workOrder.status,
        completedAt: workOrder.completedAt,
        reviewedAt: null,
        riskLevel: workOrder.assessment?.failureRisk == null
          ? null
          : workOrder.assessment.failureRisk >= 75 ? 'CRITICAL' : workOrder.assessment.failureRisk >= 50 ? 'HIGH' : 'NORMAL',
        failureRisk: workOrder.assessment?.failureRisk ?? null,
        problem: workOrder.title,
        action: workOrder.completionNotes || workOrder.technicianNotes || workOrder.description || null,
        assignedTechnician: workOrder.assignedTechnician?.user || null,
        reviewedBy: workOrder.createdBy || null,
        activityAt: workOrder.completedAt || workOrder.updatedAt,
      }))

      if (!isTechnician) {
        const reviewedLogs = await prisma.auditLog.findMany({
          where: {
            ...(isBiomedicalEngineer ? { userId: scope.userId } : {}),
            entityType: { in: ['SafetyAlert', 'SAFETY_ALERT'] },
            action: { in: ['SAFETY_ALERT_CREATED', 'SAFETY_ALERT_ASSIGNED', 'SAFETY_ALERT_ACKNOWLEDGED', 'SAFETY_ALERT_ESCALATED', 'SAFETY_ALERT_RESOLVED', 'SAFETY_ALERT_DISMISSED'] },
          },
          select: { entityId: true, action: true, userId: true, createdAt: true },
        })
        const reviewedAlertIds = [...new Set(reviewedLogs.map((log) => log.entityId))]
        if (reviewedAlertIds.length || !isBiomedicalEngineer) {
          const alerts = await prisma.safetyAlert.findMany({
            where: {
              ...(isBiomedicalEngineer ? { id: { in: reviewedAlertIds } } : {}),
              equipment: { sourceDataset: { datasetType: { not: 'HISTORICAL_SAFETY' } } },
              status: { in: (isAdministrator ? ADMIN_HISTORY_ALERT_STATUSES : HISTORICAL_ALERT_STATUSES) as any },
            },
            include: {
              equipment: {
                select: {
                  id: true,
                  equipmentCode: true,
                  name: true,
                  equipmentType: true,
                  department: true,
                  location: true,
                  sourceDataset: { select: { id: true, name: true } },
                },
              },
              assessment: {
                select: {
                  failureRisk: true,
                  explanation: true,
                  modelVersion: { select: { id: true, name: true, version: true, datasetId: true, datasetName: true } },
                },
              },
              assignedTo: { include: { user: { select: { id: true, name: true, email: true } } } },
              workOrder: { select: { id: true, workOrderCode: true, status: true, completedAt: true } },
            },
          })
          items.push(...alerts.map((alert) => {
            const acknowledgedLog = reviewedLogs
              .filter((log) => log.entityId === alert.id && log.action === 'SAFETY_ALERT_ACKNOWLEDGED')
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null
            const reviewedAt = reviewedLogs
              .filter((log) => log.entityId === alert.id)
              .map((log) => log.createdAt)
              .sort((a, b) => b.getTime() - a.getTime())[0] || null
            return {
              id: alert.id,
              type: 'ALERT',
              equipment: alert.equipment,
              alert,
              maintenance: alert.workOrder,
              status: alert.status,
              completedAt: alert.resolvedAt || alert.dismissedAt,
              reviewedAt,
              riskLevel: alert.riskScore == null ? null : alert.riskScore >= 75 ? 'CRITICAL' : alert.riskScore >= 50 ? 'HIGH' : 'NORMAL',
              failureRisk: alert.riskScore ?? alert.assessment?.failureRisk ?? null,
              problem: alert.title,
              action: alert.resolutionNotes || alert.description,
              assignedTechnician: alert.assignedTo?.user || null,
              reviewedBy: { id: scope.userId },
              acknowledgedAt: alert.acknowledgedAt,
              acknowledgedBy: acknowledgedLog?.userId || null,
              dataset: alert.equipment?.sourceDataset || null,
              model: alert.assessment?.modelVersion || null,
              activityAt: alert.acknowledgedAt || alert.resolvedAt || alert.dismissedAt || reviewedAt,
            }
          }))
        }
      }

      items.sort((a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime())
      return { items }
    } catch (error: any) {
      console.error(`[History] PostgreSQL list failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },
}
