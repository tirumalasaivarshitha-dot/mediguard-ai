import { analyticsService } from './analytics.service'
import { equipmentService } from './equipment.service'
import { maintenanceService } from './maintenance.service'
import { safetyService } from './safety.service'
import { auditService } from './audit.service'

export interface ReportFilterOptions {
  category: 'EQUIPMENT_HEALTH' | 'FAILURE_RISK' | 'MAINTENANCE' | 'SAFETY_ALERTS' | 'DOWNTIME_COST' | 'DEPARTMENT_SUMMARY'
  department?: string
  startDate?: string
  endDate?: string
}

export const reportService = {
  async generateReport(filters: ReportFilterOptions, userId?: string, clientIp?: string) {
    const { category, department } = filters

    await auditService.log({
      userId,
      action: 'REPORT_GENERATED',
      entityType: 'REPORT',
      entityId: category,
      details: { filters },
      ipAddress: clientIp,
    })

    const hospitalHeader = {
      facility: 'MediGuard AI — Hospital Equipment Command Center',
      generatedAt: new Date().toISOString(),
      disclaimer: 'OPERATIONAL DATA REPORT — FOR HOSPITAL INTERNAL USE ONLY',
    }

    if (category === 'EQUIPMENT_HEALTH') {
      const eqData = await equipmentService.listEquipment({ department, limit: 100 }, { userId: userId || 'system', role: 'admin' })
      const healthMetrics = await analyticsService.getEquipmentHealthAnalytics({ department })
      return {
        header: hospitalHeader,
        category,
        summary: healthMetrics,
        records: eqData.records,
      }
    }

    if (category === 'FAILURE_RISK') {
      const eqData = await equipmentService.listEquipment({ department, limit: 100 }, { userId: userId || 'system', role: 'admin' })
      const riskMetrics = await analyticsService.getFailureRiskAnalytics({ department })
      return {
        header: hospitalHeader,
        category,
        summary: riskMetrics,
        records: eqData.records.sort((a: any, b: any) => b.failureRisk - a.failureRisk),
        disclaimer: 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED',
      }
    }

    if (category === 'MAINTENANCE') {
      const woData = await maintenanceService.listWorkOrders({ department, limit: 100 }, { userId: userId || 'system', role: 'admin' })
      const maintMetrics = await analyticsService.getMaintenanceAnalytics({ department })
      return {
        header: hospitalHeader,
        category,
        summary: maintMetrics,
        records: woData.records,
      }
    }

    if (category === 'SAFETY_ALERTS') {
      const safetyData = await safetyService.listAlerts({ department, limit: 100 }, { userId: userId || 'system', role: 'admin' })
      const safetyMetrics = await analyticsService.getSafetyAnalytics({ department })
      return {
        header: hospitalHeader,
        category,
        summary: safetyMetrics,
        records: safetyData.records,
      }
    }

    // Default / Downtime & Cost
    const costMetrics = await analyticsService.getCostAnalytics({ department })
    const downtimeMetrics = await analyticsService.getDowntimeAnalytics({ department })
    const woData = await maintenanceService.listWorkOrders({ department, limit: 100 }, { userId: userId || 'system', role: 'admin' })

    return {
      header: hospitalHeader,
      category,
      summary: { cost: costMetrics, downtime: downtimeMetrics },
      records: woData.records,
    }
  },

  async generateCSV(filters: ReportFilterOptions, userId?: string, clientIp?: string): Promise<string> {
    const report = await this.generateReport(filters, userId, clientIp)

    await auditService.log({
      userId,
      action: 'REPORT_EXPORTED',
      entityType: 'REPORT_CSV',
      entityId: filters.category,
      details: { filters },
      ipAddress: clientIp,
    })

    const lines: string[] = []
    lines.push(`# MediGuard AI Operational Report - ${filters.category}`)
    lines.push(`# Generated At: ${new Date().toISOString()}`)
    lines.push(`# Department Scope: ${filters.department || 'ALL'}`)
    lines.push(`# Data Label: OPERATIONAL DATA`)
    lines.push('')

    const records = report.records || []
    if (records.length === 0) {
      lines.push('ID,Name,Type,Department,Status,Value')
      lines.push('NO_DATA,No records match selected report filters,,,')
      return lines.join('\n')
    }

    const first = records[0]
    const firstRecord = first as Record<string, unknown>
    const keys = Object.keys(firstRecord).filter((k) => typeof firstRecord[k] !== 'object' && typeof firstRecord[k] !== 'function')
    lines.push(keys.join(','))

    records.forEach((r: any) => {
      const row = keys.map((k) => {
        let val = r[k]
        if (val === null || val === undefined) return '""'
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`
        return String(val)
      })
      lines.push(row.join(','))
    })

    return lines.join('\n')
  },
}
