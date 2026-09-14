import { simulateMaintenance } from '@/utils/assessment'
import { recommendTechnician } from '@/services/matching'
import type {
  AnomalyLevel,
  AppNotification,
  ColumnMapping,
  DatasetCapabilities,
  DatasetAICapabilities,
  UnifiedDatasetAssessment,
  DetectedColumnMapping,
  Criticality,
  DashboardSnapshot,
  Dataset,
  Equipment,
  HealthStatusLabel,
  ManualAssessmentInput,
  OperationalStatus,
  RiskAssessment,
  HistoricalSafetyAssessment,
  RiskLevel,
  SafetyAlert,
  SafetyStatus,
  SimulationResult,
  TelemetryPoint,
  TelemetrySeries,
  Technician,
  AlertStatus,
  NotificationSeverity,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderType,
  HistoryItem,
} from '@/types'
import { API_ORIGIN } from '@/config/app'

const API_BASE = API_ORIGIN

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('mediguard.token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

function throwBackendError(message: string): never {
  throw new Error(message)
}

function mapBackendEquipment(b: any): Equipment {
  const statusMap: Record<string, OperationalStatus> = {
    OPERATIONAL: 'operational',
    ATTENTION_REQUIRED: 'attention',
    HIGH_RISK: 'degraded',
    UNDER_MAINTENANCE: 'maintenance',
    OFFLINE: 'offline',
  }

  const critMap: Record<string, Criticality> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Life-supporting',
  }

  return {
    id: b.id || b.equipmentCode,
    name: b.name || b.equipmentType || 'Medical Equipment',
    equipmentCode: b.equipmentCode || null,
    equipmentType: b.equipmentType || b.name || 'Medical Equipment',
    manufacturer: b.manufacturer || b.historicalDetails?.manufacturerName || 'Manufacturer',
    model: b.model || 'Model',
    department: b.department || 'General',
    location: b.location || 'Central Storage',
    installationDate: b.installationDate ? new Date(b.installationDate).toISOString().split('T')[0] : '2023-01-01',
    warrantyExpiry: b.warrantyExpiry ? new Date(b.warrantyExpiry).toISOString().split('T')[0] : '2026-12-31',
    operatingHours: b.operatingHours ?? 100,
    healthScore: b.healthScore ?? 100,
    failureRisk: b.failureRisk ?? 0,
    operationalStatus: statusMap[b.status] || (b.status?.toLowerCase() as OperationalStatus) || 'operational',
    criticality: critMap[b.criticality] || (b.criticality as Criticality) || 'Medium',
    assignedTechnicianId: b.assignedTechnicianId || null,
    lastMaintenance: b.lastMaintenanceAt ? new Date(b.lastMaintenanceAt).toISOString().split('T')[0] : '2026-06-01',
    nextMaintenance: b.nextMaintenanceAt ? new Date(b.nextMaintenanceAt).toISOString().split('T')[0] : '2026-12-01',
    maintenanceState: 'current',
    safetyStatus: 'Normal',
    telemetrySource: 'realtime',
    connectionState: 'connected',
    lastTelemetryAt: new Date().toISOString(),
    sourceDatasetId: b.sourceDatasetId || b.sourceDataset?.id || null,
    sourceDatasetName: b.sourceDatasetName || b.sourceDataset?.name || null,
    sourceDatasetType: b.sourceDataset?.datasetType || null,
    sourceIdentifier: b.sourceIdentifier || null,
    sourceRowIndex: b.sourceRowIndex ?? null,
    isHistorical: b.sourceDataset?.datasetType === 'HISTORICAL_SAFETY',
    historicalDetails: b.historicalDetails ? {
      ...b.historicalDetails,
      lastEvent: b.historicalDetails.lastEvent ? {
        ...b.historicalDetails.lastEvent,
        eventDate: b.historicalDetails.lastEvent.eventDate || null,
      } : null,
    } : undefined,
  }

}

function mapBackendDataset(b: any): Dataset {
  const profile = b.profileSummary || {}
  return {
    id: b.id,
    name: b.name || b.fileName,
    format: (b.fileName?.toLowerCase().endsWith('.xlsx') || b.fileName?.toLowerCase().endsWith('.xls') ? 'xlsx' : 'csv'),
    uploadedAt: b.createdAt,
    status: b.status === 'READY' ? (b.mappingConfig ? 'Configured' : 'Ready') : b.status,
    profile: {
      rows: b.rowCount ?? profile.rowCount ?? 0,
      columns: b.columnCount ?? profile.columnCount ?? 0,
      numericalColumns: profile.numericColumns?.length ?? 0,
      categoricalColumns: profile.categoricalColumns?.length ?? 0,
      missingValuePercent: profile.missingValuePercent ?? 0,
      duplicates: profile.duplicateRows ?? 0,
      potentialTarget: b.targetColumn || profile.detectedTargetCandidate || null,
      warnings: profile.warnings || [],
      columnNames: profile.columnNames || [],
      columnDetails: profile.columns || [],
      datetimeColumns: profile.datetimeColumns || [],
      missingTotal: profile.missingTotal || 0,
      previewRows: profile.previewRows || [],
      possibleIdColumns: profile.possibleIdColumns || [],
      errors: profile.errors || [],
      detectedMapping: profile.detectedMapping || [],
      unmappedColumns: profile.unmappedColumns || [],
      suspiciousColumns: profile.suspiciousColumns || [],
      capabilities: profile.capabilities || undefined,
      compatibility: profile.compatibility || (profile.errors?.length ? 'REJECTED' : 'COMPATIBLE'),
    },
    mapping: b.mappingConfig || null,
    source: b.source || null,
    datasetType: b.datasetType || null,
    isOperational: Boolean(b.isOperational),
    provenance: b.provenance || null,
  }

}

function mapBackendModel(b: any) {
  return {
    ...b,
    status: b.status === 'ACTIVE' ? 'Active' : b.status === 'EVALUATION' ? 'Evaluating' : b.status === 'INACTIVE' ? 'Archived' : b.status,
    datasetName: b.datasetName || '—',
    isOperational: Boolean(b.isOperational),
    evaluation: b.accuracy === null && b.recall === null ? null : {
      accuracy: b.accuracy === null ? null : b.accuracy * 100,
      precision: b.precision === null ? null : b.precision * 100,
      recall: b.recall === null ? null : b.recall * 100,
      f1: b.f1Score === null ? null : b.f1Score * 100,
      rocAuc: b.rocAuc === null ? null : b.rocAuc * 100,
      confusionMatrix: b.confusionMatrix,
      featureImportance: b.featureImportance || [],
    },
  }
}

function mapBackendAssessment(b: any): RiskAssessment {
  const statusMap: Record<string, OperationalStatus> = {
    OPERATIONAL: 'operational',
    ATTENTION_REQUIRED: 'attention',
    DEGRADED: 'degraded',
    MAINTENANCE: 'maintenance',
    DECOMMISSIONED: 'offline',
  }
  const anomalyMap: Record<string, AnomalyLevel> = {
    NORMAL: 'Normal',
    ANOMALY_DETECTED: 'Anomaly Detected',
    SEVERE_ANOMALY: 'Severe Anomaly',
  }
  const riskMap: Record<string, RiskLevel> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
  }

  return {
    equipmentId: b.equipmentId || 'EQ-000',
    healthScore: b.healthScore ?? 100,
    healthLabel: (b.healthLabel as HealthStatusLabel) || 'Good',
    failureRisk: b.failureRisk ?? 0,
    riskLevel: riskMap[b.riskLevel] || (b.riskLevel as RiskLevel) || 'Low',
    operationalStatus: statusMap[b.operationalStatus] || (b.operationalStatus?.toLowerCase() as OperationalStatus) || 'operational',
    safetyStatus: (b.safetyStatus as SafetyStatus) || 'Normal',
    maintenancePriority: b.maintenancePriority ?? 50,
    priorityLabel: (b.priorityLabel as any) || 'Routine',
    recommendedAction: b.recommendedAction || 'Continue routine monitoring.',
    anomalyLevel: anomalyMap[b.anomalyStatus] || (b.anomalyStatus as AnomalyLevel) || 'Normal',
    anomalies: (b.anomalies || []).map((a: any) => ({
      metric: a.metric || 'Sensor',
      level: a.level || 'Anomaly Detected',
      summary: a.summary || 'Abnormal reading detected',
    })),
    explanations: b.explanations || b.contributingFactors || ['System operating within expected ranges.'],
    contributions: (b.contributions || []).map((c: any) => ({
      feature: c.feature || 'Reading',
      contribution: c.contribution ?? 0,
      direction: c.direction || (c.contribution > 0 ? 'increases_risk' : c.contribution < 0 ? 'decreases_risk' : 'neutral'),
      note: c.note || c.summary || '',
    })),
    modelId: b.modelVersion || 'v1.0.0-rf-isolationforest',
    modelVersion: b.modelVersion || 'v1.0.0-rf-isolationforest',
    modelDataset: b.modelDataset || null,
    modelTrainingDataType: b.modelTrainingDataType || null,
    modelDisclaimer: b.modelDisclaimer || 'DEMO MODEL — NOT CLINICALLY VALIDATED',
    modelType: b.modelType || null,
    dataLabel: b.dataLabel || null,
    isValidated: b.isValidated,
    assessedAt: b.assessedAt || new Date().toISOString(),
    source: (b.dataType?.toLowerCase() as any) || 'realtime',
  }
}

function mapBackendReading(r: any): TelemetryPoint {
  return {
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
    temperature: r.temperature ?? 0,
    vibration: r.vibration ?? 0,
    powerKw: r.powerConsumption ?? r.powerKw ?? 0,
    pressure: r.pressure ?? 0,
    voltage: r.voltage ?? 0,
    errorCount: r.errorCount ?? 0,
    operatingHours: r.operatingHours ?? 0,
  }
}

function mapBackendWorkOrder(b: any): WorkOrder {
  const statusMap: Record<string, WorkOrderStatus> = {
    PENDING: 'Pending',
    ASSIGNED: 'Assigned',
    SCHEDULED: 'Scheduled',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }
  const priorityMap: Record<string, 'Low' | 'Routine' | 'Elevated' | 'Urgent'> = {
    LOW: 'Low',
    ROUTINE: 'Routine',
    MEDIUM: 'Routine',
    ELEVATED: 'Elevated',
    HIGH: 'Elevated',
    URGENT: 'Urgent',
    CRITICAL: 'Urgent',
  }
  const typeMap: Record<string, 'Preventive' | 'Corrective' | 'Emergency'> = {
    PREVENTIVE: 'Preventive',
    CORRECTIVE: 'Corrective',
    EMERGENCY: 'Emergency',
  }

  const parts = Array.isArray(b.partsUsed)
    ? b.partsUsed
    : typeof b.partsUsed === 'string'
      ? JSON.parse(b.partsUsed || '[]')
      : (b.parts || [])
  const relatedAlert = Array.isArray(b.safetyAlerts) ? b.safetyAlerts[0] : null

  return {
    id: b.workOrderCode || b.id,
    workOrderCode: b.workOrderCode || b.id,
    equipmentId: b.equipment?.id || b.equipmentId || 'EQ-000',
    title: b.title || 'Maintenance Work Order',
    description: b.description || b.technicianNotes || '',
    type: typeMap[b.type] || (b.type as any) || 'Preventive',
    status: statusMap[b.status] || (b.status as any) || 'Pending',
    priorityLabel: priorityMap[b.priority] || (b.priorityLabel as any) || 'Routine',
    assignedTechnicianId: b.assignedTechnicianId || (b.assignedTechnician?.name) || null,
    scheduledDate: b.scheduledAt ? new Date(b.scheduledAt).toISOString().split('T')[0] : (b.scheduledDate || null),
    scheduledAt: b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null,
    dueDate: b.dueAt ? new Date(b.dueAt).toISOString().split('T')[0] : null,
    dueAt: b.dueAt ? new Date(b.dueAt).toISOString() : null,
    downtimeHours: b.downtimeHours ?? null,
    parts,
    estimatedCost: b.maintenanceCost ?? b.estimatedCost ?? null,
    notes: b.technicianNotes || b.description || '',
    technicianNotes: b.technicianNotes || null,
    completionNotes: b.completionNotes || null,
    source: b.source || 'MANUAL',
    assessmentId: b.assessmentId || null,
    failureRisk: b.failureRisk ?? b.assessment?.failureRisk ?? relatedAlert?.riskScore ?? null,
    createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : undefined,
    completedAt: b.completedAt ? new Date(b.completedAt).toISOString() : null,
    equipmentName: b.equipment?.name || null,
    equipmentType: b.equipment?.equipmentType || null,
    equipmentCode: b.equipment?.equipmentCode || null,
    assignedTechnicianName: b.assignedTechnician?.user?.name || b.assignedTechnician?.name || null,
    relatedAlertId: relatedAlert?.id || null,
    relatedAlertTitle: relatedAlert?.title || null,
    relatedAlertStatus: relatedAlert?.status || null,
    relatedAlertRiskScore: relatedAlert?.riskScore ?? b.assessment?.failureRisk ?? null,
    relatedAlertReason: relatedAlert?.description || null,
    relatedAlertRecommendedAction: relatedAlert?.resolutionNotes || null,
  }
}

function mapBackendAlert(b: any): SafetyAlert {
  const statusMap: Record<string, AlertStatus> = {
    OPEN: 'Unacknowledged',
    ACKNOWLEDGED: 'Acknowledged',
    ASSIGNED: 'Assigned',
    ESCALATED: 'Escalated',
    RESOLVED: 'Resolved',
    DISMISSED: 'Dismissed',
  }
  const severityMap: Record<string, 'Warning' | 'High' | 'Critical'> = {
    INFO: 'Warning',
    WARNING: 'Warning',
    HIGH: 'High',
    CRITICAL: 'Critical',
  }

  return {
    id: b.id,
    equipmentId: b.equipment?.id || b.equipmentId || 'EQ-000',
    title: b.title || undefined,
    severity: severityMap[b.severity] || (b.severity === 'CRITICAL' ? 'Critical' : 'High'),
    riskScore: b.assessment?.failureRisk ?? b.riskScore ?? null,
    reason: b.description || b.assessment?.explanation || b.title || 'Safety inspection recommended',
    recommendedAction: b.resolutionNotes || (b.severity === 'CRITICAL' ? 'Immediate safety inspection recommended.' : 'Biomedical engineering safety review recommended.'),
    responsibleRole: b.assignedTo?.user?.name || b.assignedToId || 'Biomedical Engineering',
    assignedTechnicianId: b.assignedToId || null,
    assignedTechnicianUserId: b.assignedTo?.user?.id || null,
    assignedTechnicianName: b.assignedTo?.user?.name || null,
    status: statusMap[b.status] || (b.status as any) || 'Unacknowledged',
    createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
    equipmentName: b.equipment?.name || null,
    equipmentType: b.equipment?.equipmentType || null,
    equipmentStatus: b.equipment?.status || null,
    equipmentCode: b.equipment?.equipmentCode || null,
    healthScore: b.equipment?.healthScore ?? b.assessment?.healthScore ?? null,
    workOrderId: b.workOrderId || b.workOrder?.id || null,
    workOrderCode: b.workOrder?.workOrderCode || null,
    workOrderStatus: b.workOrder?.status ? ({
      PENDING: 'Pending',
      ASSIGNED: 'Assigned',
      SCHEDULED: 'Scheduled',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    } as Record<string, WorkOrderStatus>)[b.workOrder.status] || null : null,
    updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : undefined,
  }
}

function mapBackendNotification(b: any): AppNotification {
  const severityMap: Record<string, NotificationSeverity> = {
    INFO: 'Info',
    WARNING: 'Warning',
    HIGH: 'High',
    CRITICAL: 'Critical',
  }

  return {
    id: b.id,
    severity: severityMap[b.severity] || 'Info',
    title: b.title || 'Notification',
    body: b.message || '',
    createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
    read: Boolean(b.isRead),
    href: b.relatedAlertId ? '/safety' : (b.relatedEquipmentId ? `/equipment/${b.relatedEquipmentId}` : '/dashboard'),
  }
}

export const api = {
  async listHistory(): Promise<HistoryItem[]> {
    const res = await fetch(`${API_BASE}/api/history`, {
      headers: getAuthHeaders(),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok || payload.success === false) {
      throwBackendError(payload.message || 'Unable to load history.')
    }
    const items = payload.data?.items
    if (!Array.isArray(items)) {
      throwBackendError('History response was not in the expected format.')
    }
    return items as HistoryItem[]
  },

  async getDashboard(): Promise<DashboardSnapshot> {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/overview`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          return {
            total: data.data.total,
            healthy: data.data.healthy,
            attention: data.data.attention,
            highRisk: data.data.highRisk,
            critical: data.data.critical,
            underMaintenance: data.data.underMaintenance,
            activeSafetyAlerts: data.data.activeSafetyAlerts,
            maintenanceDue: data.data.maintenanceDue,
            activeDatasetId: data.data.activeDatasetId,
            activeDatasetName: data.data.activeDatasetName,
            dataMode: data.data.dataMode,
            disclaimer: data.data.disclaimer,
          }
        }
        if (data.success === false) {
          throwBackendError(data.message || 'Database service unavailable.')
        }
      } else {
        const payload = await res.json().catch(() => ({}))
        throwBackendError(payload.message || 'Unable to connect to the MediGuard AI backend.')
      }
      throwBackendError('Unable to connect to the MediGuard AI backend.')
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Unable to connect to the MediGuard AI backend.')
    }
  },

  async listEquipment(filters?: { q?: string; department?: string; type?: string; manufacturer?: string; riskClass?: string; country?: string; status?: string; operationalDataset?: boolean; historicalOnly?: boolean }) {
    try {
      const params = new URLSearchParams()
      if (filters?.q) params.set('search', filters.q)
      if (filters?.department) params.set('department', filters.department)
      if (filters?.type) params.set('equipmentType', filters.type)
      if (filters?.manufacturer) params.set('manufacturer', filters.manufacturer)
      if (filters?.riskClass) params.set('riskClass', filters.riskClass)
      if (filters?.country) params.set('country', filters.country)
      if (filters?.status) {
        const revStatus: Record<string, string> = {
          operational: 'OPERATIONAL',
          attention: 'ATTENTION_REQUIRED',
          degraded: 'HIGH_RISK',
          maintenance: 'UNDER_MAINTENANCE',
          offline: 'OFFLINE',
        }
        params.set('status', revStatus[filters.status] || filters.status)
      }
      if (filters?.operationalDataset) params.set('operationalDataset', 'true')
      if (filters?.historicalOnly) params.set('historicalOnly', 'true')

      const res = await fetch(`${API_BASE}/api/equipment?${params.toString()}`, {
        headers: getAuthHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        const items = data.data?.records || data.data || []
        if (Array.isArray(items)) {
          if (items.length === 0) return []
          return items.map(mapBackendEquipment)
        }
      }

      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Database service unavailable.')
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Unable to connect to the MediGuard AI backend.')
    }
  },

  async getEquipmentFilterOptions(operationalDataset = false) {
    const suffix = operationalDataset ? '?operationalDataset=true' : ''
    const res = await fetch(`${API_BASE}/api/equipment/filter-options${suffix}`, { headers: getAuthHeaders() })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Database service unavailable.')
    return data.data as {
      types: string[]
      departments: string[]
      manufacturers?: string[]
      models?: string[]
      dataSources?: { id: string; name: string }[]
      activeDataset?: { id: string; name: string; datasetType: string } | null
      historicalRiskClasses?: string[]
      historicalCountries?: string[]
    }
  },

  async getEquipment(id: string, operationalDataset = true) {
    try {
      const suffix = operationalDataset ? '?operationalDataset=true' : ''
      const res = await fetch(`${API_BASE}/api/equipment/${id}${suffix}`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          return mapBackendEquipment(data.data)
        }
      }
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Database service unavailable.')
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Unable to connect to the MediGuard AI backend.')
    }
  },

  async getHistoricalAssessment(id: string): Promise<HistoricalSafetyAssessment> {
    const res = await fetch(`${API_BASE}/api/equipment/${encodeURIComponent(id)}/historical-ai-assessment`, {
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Historical safety model unavailable.')
    return data.data as HistoricalSafetyAssessment
  },

  async getTelemetry(id: string): Promise<TelemetrySeries> {
    try {
      const res = await fetch(`${API_BASE}/api/telemetry/equipment/${id}/history?limit=60`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        const records = data.data?.records || []
        if (Array.isArray(records) && records.length > 0) {
          const points = records.map(mapBackendReading).reverse()
          const current = points[points.length - 1]
          const isSimulated = records.some(
            (r: any) => r.dataSource === 'SIMULATED_TELEMETRY' || r.dataSource === 'synthetic',
          )
          return {
            equipmentId: id,
            source: isSimulated ? 'SIMULATED_TELEMETRY' : 'realtime',
            simulated: isSimulated,
            lastUpdate: current.timestamp,
            connectionState: 'connected',
            points,
            current,
            units: {
              temperature: '°C',
              vibration: 'mm/s',
              powerKw: 'kW',
              pressure: 'bar',
              voltage: 'V',
            },
          }
        }
        return {
          equipmentId: id,
          source: 'realtime',
          simulated: false,
          lastUpdate: new Date().toISOString(),
          connectionState: 'connected',
          points: [],
          current: {
            timestamp: new Date().toISOString(),
            temperature: 0,
            vibration: 0,
            powerKw: 0,
            pressure: 0,
            voltage: 0,
            errorCount: 0,
            operatingHours: 0,
          },
          units: {
            temperature: '°C',
            vibration: 'mm/s',
            powerKw: 'kW',
            pressure: 'bar',
            voltage: 'V',
          },
        }
      }
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Database service unavailable.')
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Unable to connect to the MediGuard AI backend.')
    }
  },

  async getLatestTelemetry(id: string) {
    const res = await fetch(`${API_BASE}/api/telemetry/equipment/${id}/latest`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Database service unavailable.')
    }
    const data = await res.json()
    return data.data ? mapBackendReading(data.data) : null
  },

  async getLatestAssessment(id: string): Promise<RiskAssessment | null> {
    const res = await fetch(`${API_BASE}/api/assessment/latest/${id}`, {
      headers: getAuthHeaders(),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'AI service unavailable.')
    }
    const data = await res.json()
    return data.data ? mapBackendAssessment(data.data) : null
  },

  async startSimulator(equipmentId: string, intervalMs = 2000) {
    const res = await fetch(`${API_BASE}/api/telemetry/simulator/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ equipmentId, intervalMs }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Unable to start backend telemetry simulator.')
    }
    return res.json()
  },

  async stopSimulator(equipmentId: string) {
    const res = await fetch(`${API_BASE}/api/telemetry/simulator/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ equipmentId }),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Unable to stop backend telemetry simulator.')
    }
    return res.json()
  },

  async getAssessment(id: string): Promise<RiskAssessment> {
    try {
      const res = await fetch(`${API_BASE}/api/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ equipmentId: id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          return mapBackendAssessment(data.data)
        }
        if (data.success === false) {
          throwBackendError(data.message || 'AI service unavailable.')
        }
      }
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'AI service unavailable.')
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('AI service unavailable.')
    }
  },

  async analyzeManual(input: ManualAssessmentInput): Promise<RiskAssessment> {
    try {
      const res = await fetch(`${API_BASE}/api/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          equipmentType: input.equipmentType,
          source: (input as any).source || 'manual',
          manualReadings: {
            temperature: input.temperature,
            vibration: input.vibration,
            powerKw: input.powerKw,
            operatingHours: input.operatingHours,
            errorCount: input.errorCount,
            lastMaintenanceDaysAgo: input.lastMaintenanceDaysAgo,
            department: input.department,
          },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          return mapBackendAssessment(data.data)
        }
        if (data.success === false) {
          throwBackendError(data.message || 'AI service unavailable.')
        }
      }
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'AI service unavailable.')
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('AI service unavailable.')
    }
  },

  async listTechnicians(): Promise<Technician[]> {
    const res = await fetch(`${API_BASE}/api/technicians`, { headers: getAuthHeaders() })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Technician data unavailable.')
    }
    const data = await res.json()
    return (data.data || []).map((technician: any) => ({
      id: technician.id,
      userId: technician.userId,
      name: technician.name,
      role: technician.role || 'Technician',
      expertise: technician.expertise || [],
      certifications: technician.certifications || [],
      department: technician.department || 'General',
      location: technician.location || 'Unassigned',
      availability: technician.availability || 'Available',
      currentWorkload: technician.currentWorkload ?? 0,
      assignedEquipmentIds: technician.assignedEquipmentIds || [],
    }))
  },

  recommendTechnician(equipment: Equipment, pool: Technician[]) {
    return recommendTechnician(equipment, pool)
  },

  async listWorkOrders(filters?: { search?: string; status?: string; equipmentId?: string; priority?: string; type?: string; technicianId?: string; overdue?: boolean; page?: number; limit?: number }) {
    try {
      const params = new URLSearchParams()
      if (filters?.status) {
        const statusMap: Record<string, string> = {
          Pending: 'PENDING',
          Assigned: 'ASSIGNED',
          Scheduled: 'SCHEDULED',
          'In Progress': 'IN_PROGRESS',
          Completed: 'COMPLETED',
          Cancelled: 'CANCELLED',
        }
        params.set('status', statusMap[filters.status] || filters.status)
      }
      if (filters?.equipmentId) params.set('equipmentId', filters.equipmentId)
      if (filters?.search) params.set('search', filters.search)
      if (filters?.priority) params.set('priority', filters.priority.toUpperCase())
      if (filters?.type) params.set('type', filters.type.toUpperCase())
      if (filters?.technicianId) params.set('technicianId', filters.technicianId)
      if (filters?.overdue) params.set('overdue', 'true')
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.limit) params.set('limit', String(filters.limit))

      const res = await fetch(`${API_BASE}/api/maintenance?${params.toString()}`, {
        headers: getAuthHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        const records = data.data?.records || data.data || []
        if (Array.isArray(records)) {
          const backendMapped = records.map(mapBackendWorkOrder)
          return backendMapped
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async getWorkOrder(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/maintenance/${id}`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          return mapBackendWorkOrder(data.data)
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async createWorkOrder(partial: {
    equipmentId: string
    title: string
    type?: 'Preventive' | 'Corrective' | 'Emergency' | string
    priorityLabel?: 'Low' | 'Routine' | 'Elevated' | 'Urgent' | string
    notes?: string
    description?: string
    scheduledAt?: string
    dueAt?: string
    assessmentId?: string
    source?: string
  }) {
    try {
      const typeRev: Record<string, string> = {
        Preventive: 'PREVENTIVE',
        Corrective: 'CORRECTIVE',
        Emergency: 'EMERGENCY',
      }
      const priorityRev: Record<string, string> = {
        Low: 'LOW',
        Routine: 'MEDIUM',
        Elevated: 'HIGH',
        Urgent: 'CRITICAL',
      }

      const res = await fetch(`${API_BASE}/api/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          equipmentId: partial.equipmentId,
          title: partial.title,
          type: typeRev[partial.type || 'Preventive'] || (partial.type?.toUpperCase() || 'PREVENTIVE'),
          priority: priorityRev[partial.priorityLabel || 'Routine'] || (partial.priorityLabel?.toUpperCase() || 'MEDIUM'),
          description: partial.notes || partial.description || '',
          dueAt: partial.dueAt || partial.scheduledAt,
          scheduledAt: partial.scheduledAt,
          assessmentId: partial.assessmentId,
          source: partial.source || (partial.assessmentId ? 'AI_ASSESSMENT' : 'MANUAL'),
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = typeof data.message === 'string' ? data.message : 'Failed to create work order.'
        throwBackendError(message === 'DATABASE_UNAVAILABLE' ? 'Database service unavailable.' : message)
      }

      if (data.data) {
        const created = mapBackendWorkOrder(data.data)
        return created
      }

      throwBackendError('Failed to create work order.')
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }

  },

  async updateWorkOrderStatus(id: string, status: WorkOrderStatus, technicianNotes?: string) {
    try {
      const statusMap: Record<string, string> = {
        Pending: 'PENDING',
        Assigned: 'ASSIGNED',
        Scheduled: 'SCHEDULED',
        'In Progress': 'IN_PROGRESS',
        Completed: 'COMPLETED',
        Cancelled: 'CANCELLED',
      }
      const res = await fetch(`${API_BASE}/api/maintenance/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          status: statusMap[status] || status.toUpperCase().replace(' ', '_'),
          technicianNotes,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const updated = mapBackendWorkOrder(data.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')

  },

  async assignTechnician(workOrderId: string, technicianId: string) {
    try {
      const res = await fetch(`${API_BASE}/api/maintenance/${workOrderId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ technicianId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const updated = mapBackendWorkOrder(data.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')

  },

  async scheduleWorkOrder(workOrderId: string, scheduledAt: string) {
    try {
      const res = await fetch(`${API_BASE}/api/maintenance/${workOrderId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ scheduledAt }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const updated = mapBackendWorkOrder(data.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')

  },

  async completeWorkOrder(
    workOrderId: string,
    data: { completionNotes?: string; downtimeHours?: number; partsUsed?: string[]; maintenanceCost?: number },
  ) {
    try {
      const res = await fetch(`${API_BASE}/api/maintenance/${workOrderId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const resData = await res.json()
        if (resData.data) {
          const updated = mapBackendWorkOrder(resData.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async createWorkOrderFromAlert(alertId: string) {
    const res = await fetch(`${API_BASE}/api/maintenance/from-alert/${alertId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    })
    if (res.ok) {
      const data = await res.json()
      if (data.data) return mapBackendWorkOrder(data.data)
    }
    throwBackendError('Unable to create maintenance work from this safety alert.')
  },

  async reassessMaintenanceWorkOrder(workOrderId: string) {
    const res = await fetch(`${API_BASE}/api/maintenance/${workOrderId}/reassess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    })
    if (res.ok) {
      const data = await res.json()
      if (data.data) return data.data
    }
    throwBackendError('Unable to reassess equipment after maintenance.')
  },

  async listAlerts(filters?: { status?: string; severity?: string; equipmentId?: string; department?: string; assignedToId?: string; unresolved?: boolean; page?: number; limit?: number }) {
    try {
      const params = new URLSearchParams()
      if (filters?.status) {
        const statusMap: Record<string, string> = {
          Unacknowledged: 'OPEN',
          Acknowledged: 'ACKNOWLEDGED',
          Assigned: 'ASSIGNED',
          Escalated: 'ESCALATED',
          Resolved: 'RESOLVED',
          Dismissed: 'DISMISSED',
        }
        params.set('status', statusMap[filters.status] || filters.status.toUpperCase())
      }
      if (filters?.severity) params.set('severity', filters.severity.toUpperCase())
      if (filters?.equipmentId) params.set('equipmentId', filters.equipmentId)
      if (filters?.department) params.set('department', filters.department)
      if (filters?.assignedToId) params.set('assignedToId', filters.assignedToId)
      if (filters?.unresolved) params.set('unresolved', 'true')
      if (filters?.page) params.set('page', String(filters.page))
      if (filters?.limit) params.set('limit', String(filters.limit))

      const res = await fetch(`${API_BASE}/api/safety?${params.toString()}`, {
        headers: getAuthHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        const records = data.data?.records || data.data || []
        if (Array.isArray(records)) {
          if (records.length === 0) return []
          const mapped = records.map(mapBackendAlert)
          return mapped
        }
      } else {
        const payload = await res.json().catch(() => ({}))
        throwBackendError(payload.message || 'Database service unavailable.')
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async updateAlert(id: string, patch: Partial<SafetyAlert> & { reason?: string }) {
    try {
      let endpoint = `${API_BASE}/api/safety/${id}`
      let method = 'PATCH'
      let body: any = {}

      if (patch.status === 'Acknowledged') {
        endpoint = `${API_BASE}/api/safety/${id}/acknowledge`
      } else if (patch.status === 'Escalated') {
        endpoint = `${API_BASE}/api/safety/${id}/escalate`
        body = { reason: patch.reason }
      } else if (patch.status === 'Resolved') {
        endpoint = `${API_BASE}/api/safety/${id}/resolve`
        body = { resolutionNotes: patch.recommendedAction }
      } else if (patch.assignedTechnicianId) {
        endpoint = `${API_BASE}/api/safety/${id}/assign`
        body = { technicianId: patch.assignedTechnicianId }
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: Object.keys(body).length ? JSON.stringify(body) : undefined,
      })

      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const updated = mapBackendAlert(data.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async acknowledgeAlert(id: string) {
    return this.updateAlert(id, { status: 'Acknowledged' })
  },

  async assignAlertTechnician(id: string, technicianId: string) {
    return this.updateAlert(id, { assignedTechnicianId: technicianId, status: 'Assigned' })
  },

  async escalateAlert(id: string, reason?: string) {
    return this.updateAlert(id, { status: 'Escalated', reason: reason || 'Escalated to biomedical engineer.' })
  },

  async resolveAlert(id: string, resolutionNotes?: string, workOrderId?: string) {
    try {
      const res = await fetch(`${API_BASE}/api/safety/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ resolutionNotes, workOrderId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const updated = mapBackendAlert(data.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async dismissAlert(id: string, reason?: string) {
    try {
      const res = await fetch(`${API_BASE}/api/safety/${id}/dismiss`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const updated = mapBackendAlert(data.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async listNotifications() {
    try {
      const res = await fetch(`${API_BASE}/api/notifications`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        const records = data.data?.records || data.data || []
        if (Array.isArray(records) && records.length > 0) {
          const mapped = records.map(mapBackendNotification)
          return mapped
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async markNotificationRead(id: string) {
    try {
      const res = await fetch(`${API_BASE}/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          const updated = mapBackendNotification(data.data)
          return updated
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

  async markAllNotificationsRead() {
    try {
      const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throwBackendError(payload.message || 'Database service unavailable.')
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
  },

  async listDatasets(): Promise<Dataset[]> {
    const res = await fetch(`${API_BASE}/api/datasets`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'Database service unavailable.')
    }
    const data = await res.json()
    const records = data.data?.records || data.data || []
    if (!Array.isArray(records) || records.length === 0) return []
    return records.map(mapBackendDataset)
  },

  async profileUpload(file: File): Promise<Dataset> {
    const form = new FormData()
    form.append('file', file)
    form.append('name', file.name)
    form.append('datasetType', 'TELEMETRY')
    const res = await fetch(`${API_BASE}/api/datasets`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Dataset upload failed.')
    return mapBackendDataset(data.data)
  },

  async profileKaggleUpload(files: File[]): Promise<Dataset> {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    form.append('name', 'Kaggle medical-device safety history')
    form.append('datasetType', 'HISTORICAL_SAFETY')
    const res = await fetch(`${API_BASE}/api/datasets`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Kaggle dataset upload failed.')
    return mapBackendDataset(data.data)
  },

  async activateDataset(id: string) {
    const res = await fetch(`${API_BASE}/api/datasets/${id}/activate`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Dataset activation failed.')
    return mapBackendDataset(data.data)
  },

  async deleteDataset(id: string) {
    const res = await fetch(`${API_BASE}/api/datasets/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throwBackendError(data.message || 'Dataset deletion failed.')
  },

  async configureDataset(id: string, mapping: ColumnMapping) {
    const res = await fetch(`${API_BASE}/api/datasets/${id}/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ mapping }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Dataset mapping failed.')
    return data.data
  },

  async getDatasetCapabilities(id: string): Promise<{
    compatibility: Dataset['profile']['compatibility']
    capabilities: DatasetCapabilities
    detectedMapping: DetectedColumnMapping[]
    warnings: string[]
    errors: string[]
  }> {
    const res = await fetch(`${API_BASE}/api/datasets/${id}/capabilities`, {
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Dataset capability assessment failed.')
    return data.data
  },

  async getDatasetAICapabilities(id: string): Promise<DatasetAICapabilities> {
    const res = await fetch(`${API_BASE}/api/datasets/${id}/ai-capabilities`, {
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'AI capability assessment failed.')
    return data.data
  },

  async assessDatasetRow(id: string, rowIndex = 0, equipmentId?: string): Promise<UnifiedDatasetAssessment> {
    const res = await fetch(`${API_BASE}/api/datasets/${id}/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ rowIndex, equipmentId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Dataset-aware assessment failed.')
    return data.data
  },

  async listModels() {
    const res = await fetch(`${API_BASE}/api/models`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throwBackendError(payload.message || 'AI service unavailable.')
    }
    const data = await res.json()
    const records = data.data?.records || data.data || []
    if (!Array.isArray(records) || records.length === 0) return []
    return records.map(mapBackendModel)
  },

  async activateModel(id: string) {
    const res = await fetch(`${API_BASE}/api/models/${id}/activate`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) {
      const message = data.message === 'MODEL_BELOW_REVIEW_THRESHOLD'
        ? 'This model cannot be activated because its validation recall is below the required review threshold.'
        : data.message === 'MODEL_NOT_FOUND'
          ? 'The selected model is no longer available.'
          : data.message || 'Model activation failed.'
      throwBackendError(message)
    }
    return data.data
  },

  async checkModelCompatibility(id: string) {
    const res = await fetch(`${API_BASE}/api/models/${id}/compatibility`, { headers: getAuthHeaders() })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Compatibility check failed.')
    return data.data
  },

  async activateOperationalModel(id: string) {
    const res = await fetch(`${API_BASE}/api/models/${id}/activate-operational`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Operational model activation failed.')
    return data.data
  },

  async trainModel(input: { name: string; algorithm: string; datasetId: string; targetColumn: string }) {
    const res = await fetch(`${API_BASE}/api/models/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Model training failed.')
    return data.data
  },

  async trainHistoricalSafety(datasetId: string) {
    const res = await fetch(`${API_BASE}/api/models/train-historical-safety`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ datasetId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Historical safety model training failed.')
    return data.data
  },

  async predictDataset(modelId: string, datasetId: string) {
    const res = await fetch(`${API_BASE}/api/models/${modelId}/predict-dataset/${datasetId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Dataset prediction failed.')
    return data.data
  },

  async processDatasetPredictions(modelId: string, datasetId: string) {
    const res = await fetch(`${API_BASE}/api/models/${modelId}/process-dataset/${datasetId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.data) throwBackendError(data.message || 'Dataset processing failed.')
    return data.data
  },

  async historicalSafetyRequest(path: string, query?: Record<string, string | number | undefined>) {
    const params = new URLSearchParams()
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value))
    })
    const suffix = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${API_BASE}/api/historical-safety${path}${suffix}`, { headers: getAuthHeaders() })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok || !payload.data) throwBackendError(payload.message || 'Historical safety data is unavailable.')
    return payload.data
  },

  async getHistoricalSafetyOverview(filters?: Record<string, string | number | undefined>) {
    return this.historicalSafetyRequest('/overview', filters)
  },

  async getHistoricalSafetyEventTrends(filters?: Record<string, string | number | undefined>) {
    return this.historicalSafetyRequest('/event-trends', filters)
  },

  async getHistoricalSafetyEventTypes(filters?: Record<string, string | number | undefined>) {
    return this.historicalSafetyRequest('/event-types', filters)
  },

  async listHistoricalSafetyDevices(filters?: Record<string, string | number | undefined>) {
    return this.historicalSafetyRequest('/devices', filters)
  },

  async getHistoricalSafetyDevice(id: string) {
    return this.historicalSafetyRequest(`/devices/${encodeURIComponent(id)}`)
  },

  async listHistoricalSafetyDeviceEvents(id: string, query?: { page?: number; limit?: number }) {
    return this.historicalSafetyRequest(`/devices/${encodeURIComponent(id)}/events`, query)
  },

  async listHistoricalSafetyManufacturers(filters?: Record<string, string | number | undefined>) {
    return this.historicalSafetyRequest('/manufacturers', filters)
  },

  async getHistoricalSafetyManufacturer(id: string) {
    return this.historicalSafetyRequest(`/manufacturers/${encodeURIComponent(id)}`)
  },

  async listHistoricalSafetyManufacturerEvents(id: string, query?: { page?: number; limit?: number }) {
    return this.historicalSafetyRequest(`/manufacturers/${encodeURIComponent(id)}/events`, query)
  },

  async listHistoricalSafetyCountries() {
    return this.historicalSafetyRequest('/countries')
  },

  async listHistoricalSafetyEvents(filters?: {
    search?: string
    eventType?: string
    country?: string
    manufacturerId?: number
    deviceId?: number
    from?: string
    to?: string
    page?: number
    limit?: number
  }) {
    return this.historicalSafetyRequest('/events', filters)
  },

  async getHistoricalSafetyEvent(id: string) {
    return this.historicalSafetyRequest(`/events/${encodeURIComponent(id)}`)
  },

  async getAnalytics(timeframe = '30d', department?: string) {
    try {
      const params = new URLSearchParams({ timeframe })
      if (department && department !== 'ALL') params.set('department', department)

      const [healthRes, riskRes, maintRes, safetyRes, techRes, costRes, downtimeRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/equipment-health?${params.toString()}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/analytics/risk?${params.toString()}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/analytics/maintenance?${params.toString()}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/analytics/safety?${params.toString()}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/analytics/technicians?${params.toString()}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/analytics/cost?${params.toString()}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/analytics/downtime?${params.toString()}`, { headers: getAuthHeaders() }),
      ])

      if (![healthRes, riskRes, maintRes, safetyRes, techRes, costRes, downtimeRes].every((response) => response.ok)) {
        throw new Error('Analytics service unavailable.')
      }

      const health = healthRes.ok ? (await healthRes.json()).data : null
      const risk = riskRes.ok ? (await riskRes.json()).data : null
      const maintenance = maintRes.ok ? (await maintRes.json()).data : null
      const safety = safetyRes.ok ? (await safetyRes.json()).data : null
      const techniciansData = techRes.ok ? (await techRes.json()).data : null
      const cost = costRes.ok ? (await costRes.json()).data : null
      const downtime = downtimeRes.ok ? (await downtimeRes.json()).data : null

      return {
        health,
        risk,
        maintenance,
        safety,
        technicians: techniciansData,
        cost,
        downtime,
        trend: health?.trend || [],
        riskByDepartment: risk?.riskByDepartment || [],
        riskByManufacturer: risk?.riskByManufacturer || [],
        technicianWorkload: techniciansData?.records
          ? techniciansData.records.map((t: any) => ({ name: t.name, workload: t.activeWorkOrders }))
          : [],
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Analytics service unavailable.')
    }
  },

  async simulateWhatIf(equipmentId: string): Promise<SimulationResult> {
    const eq = await this.getEquipment(equipmentId)
    if (!eq) throw new Error('Equipment not found')
    const est = simulateMaintenance(eq.healthScore, eq.failureRisk)
    return {
      equipmentId,
      labeledAs: 'SIMULATION / ESTIMATE',
      currentHealth: eq.healthScore,
      currentRisk: eq.failureRisk,
      estimatedHealth: est.estimatedHealth,
      estimatedRisk: est.estimatedRisk,
      riskReductionPoints: eq.failureRisk - est.estimatedRisk,
      healthImprovementPoints: est.estimatedHealth - eq.healthScore,
      potentialDowntimeReductionHours: est.potentialDowntimeReductionHours,
      notes: [
        'This is an estimate based on typical recovery after preventive maintenance for similar equipment.',
        'It is not a guaranteed outcome and does not replace manufacturer guidance.',
      ],
    }
  },

  async getAuditLogs() {
    throwBackendError('Audit log service unavailable.')
  },

  async getMaintenanceHistory(equipmentId?: string) {
    try {
      const url = equipmentId
        ? `${API_BASE}/api/maintenance/equipment/${equipmentId}`
        : `${API_BASE}/api/maintenance?status=COMPLETED`
      const res = await fetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const items = data.data?.records || data.data || []
        if (Array.isArray(items) && items.length > 0) {
          return items.map((b: any) => ({
            id: b.id || b.workOrderCode,
            equipmentId: b.equipment?.id || b.equipmentId || 'EQ-000',
            workOrderId: b.workOrderCode || b.id,
            date: b.completedAt ? new Date(b.completedAt).toISOString().split('T')[0] : (b.createdAt ? new Date(b.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
            type: (b.type === 'PREVENTIVE' ? 'Preventive' : b.type === 'CORRECTIVE' ? 'Corrective' : 'Emergency') as WorkOrderType,
            technicianId: b.assignedTechnicianId || 'TECH-001',
            summary: b.completionNotes || b.description || 'Maintenance work order',
            downtimeHours: b.downtimeHours || 0,
            cost: b.maintenanceCost || b.estimatedCost || 0,
          }))
        }
      }
    } catch (error) {
      if (error instanceof Error) throw error
      throwBackendError('Database service unavailable.')
    }
    throwBackendError('Database service unavailable.')
  },

}
