import { prisma } from '../config/database'
import { EquipmentStatus, WorkOrderStatus, AlertSeverity, AlertStatus } from '@prisma/client'

function parseDateFilter(timeframe?: string, startDate?: string, endDate?: string): { gte?: Date; lte?: Date } | null {
  if (startDate || endDate) {
    const res: { gte?: Date; lte?: Date } = {}
    if (startDate) res.gte = new Date(startDate)
    if (endDate) res.lte = new Date(endDate)
    return res
  }
  if (!timeframe || timeframe === 'ALL') return null
  const now = new Date()
  let days = 30
  if (timeframe === '7d') days = 7
  else if (timeframe === '30d') days = 30
  else if (timeframe === '90d') days = 90
  else if (timeframe === '1y') days = 365
  return { gte: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) }
}

export const analyticsService = {
  async getOverview(filters?: { department?: string; timeframe?: string; startDate?: string; endDate?: string; scopeRole?: string; userId?: string }) {
    try {
      const whereEq: any = {}
      const whereAlerts: any = {}
      const whereWorkOrders: any = {}
      const activeDataset = await prisma.dataset.findFirst({ where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } }, select: { id: true, name: true, datasetType: true } })
      if (!activeDataset) {
        return {
          total: 0, healthy: 0, attention: 0, highRisk: 0, critical: 0, underMaintenance: 0,
          activeSafetyAlerts: 0, maintenanceDue: 0, overdueMaintenance: 0, openWorkOrders: 0,
          criticalSafetyAlerts: 0, dataMode: 'OPERATIONAL DATA', activeDatasetId: null,
          activeDatasetName: null, disclaimer: 'No active operational dataset.',
        }
      }
      if (activeDataset) {
        whereEq.sourceDatasetId = activeDataset.id
        whereAlerts.equipment = { sourceDatasetId: activeDataset.id }
        whereWorkOrders.equipment = { sourceDatasetId: activeDataset.id }
      }

      if (filters?.department && filters.department !== 'ALL') {
        whereEq.department = filters.department
        whereAlerts.equipment = { department: filters.department }
        whereWorkOrders.equipment = { department: filters.department }
      }

      if (filters?.scopeRole?.toUpperCase() === 'MAINTENANCE_TECHNICIAN' && filters.userId) {
        whereEq.assignedTechnician = { userId: filters.userId }
        whereAlerts.equipment = { assignedTechnician: { userId: filters.userId } }
        whereWorkOrders.assignedTechnician = { userId: filters.userId }
      }
      whereEq.sourceDatasetId = activeDataset.id
      whereAlerts.equipment = { ...(whereAlerts.equipment || {}), sourceDatasetId: activeDataset.id }
      whereWorkOrders.equipment = { ...(whereWorkOrders.equipment || {}), sourceDatasetId: activeDataset.id }

      if (activeDataset?.datasetType === 'HISTORICAL_SAFETY') {
        return {
          total: await prisma.equipment.count({ where: whereEq }),
          healthy: 0,
          attention: 0,
          highRisk: 0,
          critical: 0,
          underMaintenance: 0,
          activeSafetyAlerts: 0,
          maintenanceDue: 0,
          overdueMaintenance: 0,
          openWorkOrders: 0,
          criticalSafetyAlerts: 0,
          dataMode: 'HISTORICAL SAFETY DATA',
          activeDatasetId: activeDataset.id,
          activeDatasetName: activeDataset.name,
          disclaimer: 'Historical safety records are analytical context only; no live telemetry or future failure prediction is available.',
        }
      }

      const total = await prisma.equipment.count({ where: whereEq })
      const healthy = await prisma.equipment.count({
        where: { ...whereEq, status: EquipmentStatus.OPERATIONAL, healthScore: { gte: 75 } },
      })
      const attention = await prisma.equipment.count({
        where: { ...whereEq, status: EquipmentStatus.ATTENTION_REQUIRED },
      })
      const highRisk = await prisma.equipment.count({
        where: { ...whereEq, failureRisk: { gte: 50, lt: 75 } },
      })
      const critical = await prisma.equipment.count({
        where: {
          ...whereEq,
          OR: [{ status: EquipmentStatus.CRITICAL }, { failureRisk: { gte: 75 } }, { healthScore: { lt: 40 } }],
        },
      })
      const underMaintenance = await prisma.equipment.count({
        where: { ...whereEq, status: EquipmentStatus.UNDER_MAINTENANCE },
      })
      const activeSafetyAlerts = await prisma.safetyAlert.count({
        where: { ...whereAlerts, status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED, AlertStatus.ESCALATED] } },
      })
      const criticalSafetyAlerts = await prisma.safetyAlert.count({
        where: {
          ...whereAlerts,
          severity: AlertSeverity.CRITICAL,
          status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED, AlertStatus.ESCALATED] },
        },
      })
      const now = new Date()
      const maintenanceDue = await prisma.equipment.count({
        where: { ...whereEq, nextMaintenanceAt: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } },
      })
      const overdueMaintenance = await prisma.equipment.count({
        where: { ...whereEq, nextMaintenanceAt: { lt: now } },
      })
      const openWorkOrders = await prisma.maintenanceWorkOrder.count({
        where: { ...whereWorkOrders, status: { in: [WorkOrderStatus.PENDING, WorkOrderStatus.ASSIGNED, WorkOrderStatus.SCHEDULED, WorkOrderStatus.IN_PROGRESS] } },
      })

      return {
        total,
        healthy,
        attention,
        highRisk,
        critical,
        underMaintenance,
        activeSafetyAlerts,
        maintenanceDue,
        overdueMaintenance,
        openWorkOrders,
        criticalSafetyAlerts,
        dataMode: 'OPERATIONAL DATA',
        activeDatasetId: activeDataset?.id || null,
        activeDatasetName: activeDataset?.name || null,
      }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL overview failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return {
        total: 0,
        healthy: 0,
        attention: 0,
        highRisk: 0,
        critical: 0,
        underMaintenance: 0,
        activeSafetyAlerts: 0,
        maintenanceDue: 0,
        overdueMaintenance: 0,
        openWorkOrders: 0,
        criticalSafetyAlerts: 0,
        dataMode: 'OPERATIONAL DATA',
      }
    }
  },

  async getEquipmentHealthAnalytics(filters?: { department?: string; timeframe?: string; startDate?: string; endDate?: string }) {
    try {
      const whereEq: any = {}
      const activeDataset = await prisma.dataset.findFirst({ where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } }, select: { id: true, name: true, datasetType: true } })
      if (!activeDataset) {
        return {
          avgHealthScore: 0,
          totalCount: 0,
          categories: { EXCELLENT: 0, GOOD: 0, ATTENTION_REQUIRED: 0, POOR: 0, CRITICAL: 0 },
          declining: [],
          healthDistribution: [],
          trend: [],
          dataMode: 'OPERATIONAL DATA',
          hasData: false,
          disclaimer: 'No active operational dataset.',
        }
      }
      whereEq.sourceDatasetId = activeDataset.id
      if (filters?.department && filters.department !== 'ALL') {
        whereEq.department = filters.department
      }

      const list = await prisma.equipment.findMany({
        where: whereEq,
        select: { id: true, equipmentCode: true, name: true, equipmentType: true, department: true, healthScore: true, failureRisk: true, status: true },
      })

      if (list.length === 0) {
        return {
          avgHealthScore: 0,
          totalCount: 0,
          categories: { EXCELLENT: 0, GOOD: 0, ATTENTION_REQUIRED: 0, POOR: 0, CRITICAL: 0 },
          declining: [],
          healthDistribution: [],
          trend: [],
          dataMode: 'OPERATIONAL DATA',
          hasData: false,
        }
      }

      const avgHealthScore = Math.round(list.reduce((acc, e) => acc + e.healthScore, 0) / list.length)

      const categories = {
        EXCELLENT: list.filter((e) => e.healthScore >= 90).length,
        GOOD: list.filter((e) => e.healthScore >= 75 && e.healthScore < 90).length,
        ATTENTION_REQUIRED: list.filter((e) => e.healthScore >= 55 && e.healthScore < 75).length,
        POOR: list.filter((e) => e.healthScore >= 40 && e.healthScore < 55).length,
        CRITICAL: list.filter((e) => e.healthScore < 40).length,
      }

      const declining = list
        .filter((e) => e.healthScore < 60 || e.failureRisk >= 50)
        .sort((a, b) => a.healthScore - b.healthScore)
        .slice(0, 5)

      // Trend generation from recent assessment history or baseline
      const dateFilter = parseDateFilter(filters?.timeframe, filters?.startDate, filters?.endDate)
      const whereAssessment: any = dateFilter ? { assessedAt: dateFilter } : {}
      if (filters?.department && filters.department !== 'ALL') {
        whereAssessment.equipment = { department: filters.department }
      }

      const assessments = await prisma.assessment.findMany({
        where: whereAssessment,
        select: { healthScore: true, failureRisk: true, assessedAt: true },
        orderBy: { assessedAt: 'asc' },
        take: 30,
      })

      const trend = assessments.map((a, i) => ({
        date: new Date(a.assessedAt).toISOString().split('T')[0],
        health: a.healthScore,
        risk: a.failureRisk,
      }))

      return {
        avgHealthScore,
        totalCount: list.length,
        categories,
        declining,
        healthDistribution: [
          { name: 'Excellent (90-100)', count: categories.EXCELLENT },
          { name: 'Good (75-89)', count: categories.GOOD },
          { name: 'Attention (55-74)', count: categories.ATTENTION_REQUIRED },
          { name: 'Poor (40-54)', count: categories.POOR },
          { name: 'Critical (<40)', count: categories.CRITICAL },
        ],
        trend,
        dataMode: 'OPERATIONAL DATA',
        hasData: true,
      }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL health analytics failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return {
        avgHealthScore: 0,
        totalCount: 0,
        categories: { EXCELLENT: 0, GOOD: 0, ATTENTION_REQUIRED: 0, POOR: 0, CRITICAL: 0 },
        declining: [],
        healthDistribution: [],
        trend: [],
        dataMode: 'OPERATIONAL DATA',
        hasData: false,
      }
    }
  },

  async getFailureRiskAnalytics(filters?: { department?: string; timeframe?: string; startDate?: string; endDate?: string }) {
    try {
      const whereEq: any = {}
      const activeDataset = await prisma.dataset.findFirst({ where: { isOperational: true }, select: { id: true, name: true, datasetType: true } })
      if (activeDataset) whereEq.sourceDatasetId = activeDataset.id
      if (activeDataset?.datasetType === 'HISTORICAL_SAFETY') {
        return {
          avgRisk: 0,
          totalCount: 0,
          riskCategories: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
          highestRisk: [],
          riskByDepartment: [],
          riskByManufacturer: [],
          riskDistribution: [],
          dataMode: 'HISTORICAL SAFETY DATA',
          disclaimer: 'Historical safety records cannot be presented as future telemetry failure prediction.',
          hasData: false,
          message: 'Historical-only dataset',
        }
      }
      if (filters?.department && filters.department !== 'ALL') {
        whereEq.department = filters.department
      }

      const list = await prisma.equipment.findMany({
        where: whereEq,
        select: { id: true, equipmentCode: true, name: true, equipmentType: true, manufacturer: true, department: true, failureRisk: true, healthScore: true },
      })

      if (list.length === 0) {
        return {
          avgRisk: 0,
          totalCount: 0,
          riskCategories: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
          highestRisk: [],
          riskByDepartment: [],
          riskByManufacturer: [],
          riskDistribution: [],
          dataMode: 'OPERATIONAL DATA',
          disclaimer: 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED',
          hasData: false,
          message: 'Insufficient assessment history',
        }
      }

      const avgRisk = Math.round(list.reduce((acc, e) => acc + e.failureRisk, 0) / list.length)

      const riskCategories = {
        LOW: list.filter((e) => e.failureRisk < 25).length,
        MEDIUM: list.filter((e) => e.failureRisk >= 25 && e.failureRisk < 50).length,
        HIGH: list.filter((e) => e.failureRisk >= 50 && e.failureRisk < 75).length,
        CRITICAL: list.filter((e) => e.failureRisk >= 75).length,
      }

      const highestRisk = list
        .filter((e) => e.failureRisk >= 40)
        .sort((a, b) => b.failureRisk - a.failureRisk)
        .slice(0, 5)

      // Group risk by department
      const deptMap: Record<string, { totalRisk: number; count: number }> = {}
      list.forEach((e) => {
        const d = e.department || 'General'
        if (!deptMap[d]) deptMap[d] = { totalRisk: 0, count: 0 }
        deptMap[d].totalRisk += e.failureRisk
        deptMap[d].count += 1
      })
      const riskByDepartment = Object.entries(deptMap).map(([department, val]) => ({
        department,
        avgRisk: Math.round(val.totalRisk / val.count),
      }))

      // Group risk by manufacturer
      const mfrMap: Record<string, { totalRisk: number; highRiskCount: number; count: number }> = {}
      list.forEach((e) => {
        const m = e.manufacturer || 'Unknown'
        if (!mfrMap[m]) mfrMap[m] = { totalRisk: 0, highRiskCount: 0, count: 0 }
        mfrMap[m].totalRisk += e.failureRisk
        if (e.failureRisk >= 50) mfrMap[m].highRiskCount += 1
        mfrMap[m].count += 1
      })
      const riskByManufacturer = Object.entries(mfrMap).map(([manufacturer, val]) => ({
        manufacturer,
        highRisk: val.highRiskCount,
        avgRisk: Math.round(val.totalRisk / val.count),
      }))

      return {
        avgRisk,
        totalCount: list.length,
        riskCategories,
        highestRisk,
        riskByDepartment,
        riskByManufacturer,
        riskDistribution: [
          { name: 'Low (<25%)', count: riskCategories.LOW },
          { name: 'Medium (25-49%)', count: riskCategories.MEDIUM },
          { name: 'High (50-74%)', count: riskCategories.HIGH },
          { name: 'Critical (≥75%)', count: riskCategories.CRITICAL },
        ],
        dataMode: 'OPERATIONAL DATA',
        disclaimer: 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED',
        hasData: true,
      }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL risk analytics failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return {
        avgRisk: 0,
        totalCount: 0,
        riskCategories: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
        highestRisk: [],
        riskByDepartment: [],
        riskByManufacturer: [],
        riskDistribution: [],
        dataMode: 'OPERATIONAL DATA',
        disclaimer: 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED',
        hasData: false,
        message: 'Insufficient assessment history',
      }
    }
  },

  async getMaintenanceAnalytics(filters?: { department?: string; timeframe?: string; startDate?: string; endDate?: string }) {
    try {
      const dateFilter = parseDateFilter(filters?.timeframe, filters?.startDate, filters?.endDate)
      const whereWo: any = dateFilter ? { createdAt: dateFilter } : {}
      if (filters?.department && filters.department !== 'ALL') {
        whereWo.equipment = { department: filters.department }
      }

      const list = await prisma.maintenanceWorkOrder.findMany({
        where: whereWo,
        select: { id: true, type: true, priority: true, status: true, maintenanceCost: true, downtimeMinutes: true, createdAt: true, completedAt: true },
      })

      const total = list.length
      const pending = list.filter((w) => w.status === WorkOrderStatus.PENDING).length
      const assigned = list.filter((w) => w.status === WorkOrderStatus.ASSIGNED).length
      const scheduled = list.filter((w) => w.status === WorkOrderStatus.SCHEDULED).length
      const inProgress = list.filter((w) => w.status === WorkOrderStatus.IN_PROGRESS).length
      const completed = list.filter((w) => w.status === WorkOrderStatus.COMPLETED).length
      const cancelled = list.filter((w) => w.status === WorkOrderStatus.CANCELLED).length

      const preventiveCount = list.filter((w) => w.type === 'PREVENTIVE').length
      const correctiveCount = list.filter((w) => w.type === 'CORRECTIVE').length
      const emergencyCount = list.filter((w) => w.type === 'EMERGENCY').length

      const totalCost = list.reduce((acc, w) => acc + (w.maintenanceCost || 0), 0)
      const totalDowntimeMinutes = list.reduce((acc, w) => acc + (w.downtimeMinutes || 0), 0)

      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

      // Calculate avg completion time (in hours) for completed work orders with timestamps
      const completedWithTimes = list.filter((w) => w.status === WorkOrderStatus.COMPLETED && w.completedAt && w.createdAt)
      const avgCompletionHours =
        completedWithTimes.length > 0
          ? Math.round(
              (completedWithTimes.reduce((acc, w) => acc + (new Date(w.completedAt!).getTime() - new Date(w.createdAt).getTime()), 0) /
                (completedWithTimes.length * 3600000)) *
                10,
            ) / 10
          : null

      return {
        total,
        statusCounts: { PENDING: pending, ASSIGNED: assigned, SCHEDULED: scheduled, IN_PROGRESS: inProgress, COMPLETED: completed, CANCELLED: cancelled },
        typeCounts: { PREVENTIVE: preventiveCount, CORRECTIVE: correctiveCount, EMERGENCY: emergencyCount },
        completionRate,
        avgCompletionHours,
        totalCost,
        totalDowntimeHours: Math.round((totalDowntimeMinutes / 60) * 10) / 10,
        dataMode: 'OPERATIONAL DATA',
        hasData: total > 0,
      }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL maintenance analytics failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return {
        total: 0,
        statusCounts: { PENDING: 0, ASSIGNED: 0, SCHEDULED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 },
        typeCounts: { PREVENTIVE: 0, CORRECTIVE: 0, EMERGENCY: 0 },
        completionRate: 0,
        avgCompletionHours: null,
        totalCost: 0,
        totalDowntimeHours: 0,
        dataMode: 'OPERATIONAL DATA',
        hasData: false,
      }
    }
  },

  async getSafetyAnalytics(filters?: { department?: string; timeframe?: string; startDate?: string; endDate?: string }) {
    try {
      const dateFilter = parseDateFilter(filters?.timeframe, filters?.startDate, filters?.endDate)
      const whereAlert: any = dateFilter ? { createdAt: dateFilter } : {}
      if (filters?.department && filters.department !== 'ALL') {
        whereAlert.equipment = { department: filters.department }
      }

      const list = await prisma.safetyAlert.findMany({
        where: whereAlert,
        select: { id: true, severity: true, status: true, createdAt: true, resolvedAt: true },
      })

      const total = list.length
      const open = list.filter((a) => a.status === AlertStatus.OPEN).length
      const acknowledged = list.filter((a) => a.status === AlertStatus.ACKNOWLEDGED).length
      const assigned = list.filter((a) => a.status === AlertStatus.ASSIGNED).length
      const escalated = list.filter((a) => a.status === AlertStatus.ESCALATED).length
      const resolved = list.filter((a) => a.status === AlertStatus.RESOLVED).length
      const dismissed = list.filter((a) => a.status === AlertStatus.DISMISSED).length

      const critical = list.filter((a) => a.severity === AlertSeverity.CRITICAL).length
      const high = list.filter((a) => a.severity === AlertSeverity.HIGH).length
      const warning = list.filter((a) => a.severity === AlertSeverity.WARNING).length

      const unresolvedCritical = list.filter(
        (a) => a.severity === AlertSeverity.CRITICAL && ([AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED, AlertStatus.ESCALATED] as AlertStatus[]).includes(a.status),
      ).length

      return {
        total,
        statusCounts: { OPEN: open, ACKNOWLEDGED: acknowledged, ASSIGNED: assigned, ESCALATED: escalated, RESOLVED: resolved, DISMISSED: dismissed },
        severityCounts: { CRITICAL: critical, HIGH: high, WARNING: warning },
        unresolvedCritical,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
        dataMode: 'OPERATIONAL DATA',
        hasData: total > 0,
      }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL safety analytics failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return {
        total: 0,
        statusCounts: { OPEN: 0, ACKNOWLEDGED: 0, ASSIGNED: 0, ESCALATED: 0, RESOLVED: 0, DISMISSED: 0 },
        severityCounts: { CRITICAL: 0, HIGH: 0, WARNING: 0 },
        unresolvedCritical: 0,
        resolutionRate: 0,
        dataMode: 'OPERATIONAL DATA',
        hasData: false,
      }
    }
  },

  async getTechnicianAnalytics(filters?: { department?: string }) {
    try {
      const whereTech: any = {}
      if (filters?.department && filters.department !== 'ALL') {
        whereTech.department = filters.department
      }

      const techs = await prisma.technicianProfile.findMany({
        where: whereTech,
        include: { user: { select: { name: true, email: true } }, assignedWorkOrders: { select: { id: true, status: true } } },
      })

      const records = techs.map((t) => {
        const active = t.assignedWorkOrders.filter((w) => w.status !== WorkOrderStatus.COMPLETED && w.status !== WorkOrderStatus.CANCELLED).length
        const completed = t.assignedWorkOrders.filter((w) => w.status === WorkOrderStatus.COMPLETED).length
        return {
          id: t.id,
          name: t.user.name,
          employeeCode: t.employeeCode,
          department: t.department,
          availability: t.availability,
          workload: t.workload,
          activeWorkOrders: active,
          completedWorkOrders: completed,
        }
      })

      return { records, totalTechnicians: techs.length, dataMode: 'OPERATIONAL DATA', hasData: techs.length > 0 }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL technician analytics failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return { records: [], totalTechnicians: 0, dataMode: 'OPERATIONAL DATA', hasData: false }
    }
  },

  async getCostAnalytics(filters?: { department?: string; timeframe?: string; startDate?: string; endDate?: string }) {
    try {
      const dateFilter = parseDateFilter(filters?.timeframe, filters?.startDate, filters?.endDate)
      const whereWo: any = { status: WorkOrderStatus.COMPLETED, maintenanceCost: { not: null } }
      if (dateFilter) whereWo.completedAt = dateFilter
      if (filters?.department && filters.department !== 'ALL') {
        whereWo.equipment = { department: filters.department }
      }

      const list = await prisma.maintenanceWorkOrder.findMany({
        where: whereWo,
        include: { equipment: { select: { department: true, equipmentType: true } } },
      })

      if (list.length === 0) {
        return {
          totalCost: 0,
          avgCost: 0,
          costByDept: {},
          recordCount: 0,
          dataMode: 'OPERATIONAL DATA',
          hasData: false,
          message: 'No cost data available',
        }
      }

      const totalCost = list.reduce((acc, w) => acc + (w.maintenanceCost || 0), 0)
      const avgCost = list.length > 0 ? Math.round((totalCost / list.length) * 100) / 100 : 0

      const costByDept: Record<string, number> = {}
      list.forEach((w) => {
        const dept = w.equipment.department || 'General'
        costByDept[dept] = (costByDept[dept] || 0) + (w.maintenanceCost || 0)
      })

      return {
        totalCost,
        avgCost,
        costByDept,
        recordCount: list.length,
        dataMode: 'OPERATIONAL DATA',
        hasData: true,
      }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL cost analytics failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return {
        totalCost: 0,
        avgCost: 0,
        costByDept: {},
        recordCount: 0,
        dataMode: 'OPERATIONAL DATA',
        hasData: false,
        message: 'No cost data available',
      }
    }
  },

  async getDowntimeAnalytics(filters?: { department?: string; timeframe?: string; startDate?: string; endDate?: string }) {
    try {
      const dateFilter = parseDateFilter(filters?.timeframe, filters?.startDate, filters?.endDate)
      const whereWo: any = { downtimeMinutes: { not: null } }
      if (dateFilter) whereWo.createdAt = dateFilter
      if (filters?.department && filters.department !== 'ALL') {
        whereWo.equipment = { department: filters.department }
      }

      const list = await prisma.maintenanceWorkOrder.findMany({
        where: whereWo,
        include: { equipment: { select: { department: true, equipmentType: true } } },
      })

      if (list.length === 0) {
        return {
          totalDowntimeHours: 0,
          avgDowntimeHours: 0,
          recordCount: 0,
          dataMode: 'OPERATIONAL DATA',
          hasData: false,
          message: 'No downtime data available',
        }
      }

      const totalMinutes = list.reduce((acc, w) => acc + (w.downtimeMinutes || 0), 0)
      const totalHours = Math.round((totalMinutes / 60) * 10) / 10
      const avgDowntimeHours = list.length > 0 ? Math.round((totalHours / list.length) * 10) / 10 : 0

      return {
        totalDowntimeHours: totalHours,
        avgDowntimeHours,
        recordCount: list.length,
        dataMode: 'OPERATIONAL DATA',
        hasData: true,
      }
    } catch (error: any) {
      console.error(`[Analytics] PostgreSQL downtime analytics failed: ${error?.message || error}`)
      throw new Error('ANALYTICS_DATABASE_UNAVAILABLE')
      return {
        totalDowntimeHours: 0,
        avgDowntimeHours: 0,
        recordCount: 0,
        dataMode: 'OPERATIONAL DATA',
        hasData: false,
        message: 'No downtime data available',
      }
    }
  },
}
