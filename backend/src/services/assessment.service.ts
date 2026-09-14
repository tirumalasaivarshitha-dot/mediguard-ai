import { prisma } from '../config/database'
import { env } from '../config/env'
import { equipmentService, UserScope } from './equipment.service'
import { auditService } from './audit.service'
import { safetyService } from './safety.service'
import { socketManager } from '../sockets/socketManager'
import { AlertSeverity, EquipmentStatus } from '@prisma/client'
import { modelService } from './model.service'
import { historicalPredictionService } from './historicalPrediction.service'
import { datasetService } from './dataset.service'

const ML_SERVICE_URL = env.ML_SERVICE_URL

function alertSeverityForAssessment(failureRisk: number | null, healthScore: number | null, anomalyDetected: boolean) {
  if (failureRisk !== null && failureRisk >= 90) return AlertSeverity.CRITICAL
  if (failureRisk !== null && failureRisk >= 70) return AlertSeverity.HIGH
  if (failureRisk !== null && failureRisk >= 50) return AlertSeverity.WARNING
  if (anomalyDetected && healthScore !== null && healthScore < 40) return AlertSeverity.CRITICAL
  if (anomalyDetected && healthScore !== null && healthScore < 60) return AlertSeverity.HIGH
  return null
}

async function createEarlyWarningAlert(params: {
  equipmentId?: string
  assessmentId?: string
  title: string
  aiMode: string
  failureRisk: number | null
  healthScore: number | null
  anomalyDetected: boolean
  condition: string
  maintenancePriority: string
  reasons: string[]
  recommendedActions: string[]
  model?: { id: string; version: string; name: string } | null
  dataLabel?: string
}) {
  if (!params.equipmentId || params.dataLabel === 'HISTORICAL SAFETY DATA' || params.aiMode === 'MAINTENANCE_ANALYSIS' || params.aiMode === 'NO_AI_AVAILABLE') return null
  const severity = alertSeverityForAssessment(params.failureRisk, params.healthScore, params.anomalyDetected)
  if (!severity) return null

  const riskText = params.failureRisk === null
    ? 'Predicted failure risk is unavailable; this is an anomaly/condition warning only.'
    : `Predicted failure risk is ${params.failureRisk.toFixed(1)}%.`
  const title = params.failureRisk === null ? 'Abnormal Operating Behavior Detected' : params.title
  const description = [
    `${title} — early-warning decision support; this does not confirm an equipment failure.`,
    riskText,
    `AI mode: ${params.aiMode}. Condition: ${params.condition}. Health score: ${params.healthScore ?? 'Unavailable'}. Maintenance priority: ${params.maintenancePriority}.`,
    params.reasons.length ? `Contributing factors: ${params.reasons.join(' | ')}` : undefined,
    params.recommendedActions.length ? `Recommended action: ${params.recommendedActions.join(' | ')}` : undefined,
    params.model ? `Model: ${params.model.name} (${params.model.version}, ${params.model.id}).` : 'Model: no supervised failure model selected.',
  ].filter(Boolean).join(' ')

  return safetyService.createAlert({
    equipmentId: params.equipmentId,
    assessmentId: params.assessmentId,
    title,
    description,
    severity,
    riskScore: params.failureRisk === null ? undefined : Math.round(params.failureRisk),
    source: params.failureRisk === null ? 'AI_ANOMALY' : 'AI_ASSESSMENT',
  })
}

export const assessmentService = {
  buildPriority(healthScore: number | null, failureRisk: number | null, anomalyDetected: boolean, maintenanceOverdue = false) {
    const score = Math.max(
      failureRisk ?? 0,
      healthScore === null ? 0 : 100 - healthScore,
      anomalyDetected ? 50 : 0,
      maintenanceOverdue ? 35 : 0,
    )
    if (score >= 75) return 'CRITICAL'
    if (score >= 50) return 'HIGH'
    if (score >= 25) return 'MEDIUM'
    return 'LOW'
  },

  async runDatasetAssessment(params: {
    datasetId: string
    rowIndex?: number
    equipmentId?: string
    userScope?: UserScope
  }) {
    const dataset = await prisma.dataset.findUnique({ where: { id: params.datasetId } })
    if (!dataset) throw new Error('DATASET_NOT_FOUND')
    const selection = await modelService.assessDatasetCapabilities(params.datasetId)
    const profile = await datasetService.profileDataset(params.datasetId)
    const mode = selection.recommendedMode
    const selected = selection.selectedModel
    const rows = mode === 'HISTORICAL_SAFETY_INTELLIGENCE'
      ? []
      : await this.readDatasetRows(dataset.storagePath)
    const row = rows[params.rowIndex ?? 0] || {}
    if (mode !== 'HISTORICAL_SAFETY_INTELLIGENCE' && !rows[params.rowIndex ?? 0]) {
      throw new Error('DATASET_ROW_NOT_FOUND')
    }
    const mapping = (dataset.mappingConfig || {}) as Record<string, string>
    const sourceFor = (canonical: string) => mapping[canonical] || profile.detectedMapping.find((item) => item.canonicalField === canonical)?.sourceColumn || canonical
    const rowIdentifier = row[sourceFor('equipment_id')] ?? row[sourceFor('device_id')] ?? row[sourceFor('machine_id')] ?? row[sourceFor('asset_id')] ?? row[sourceFor('serial_number')]
    let linkedEquipment: any = params.equipmentId ? await equipmentService.getEquipmentById(params.equipmentId, params.userScope) : null
    if (!params.equipmentId && rowIdentifier !== undefined && rowIdentifier !== null) {
      linkedEquipment = await equipmentService.getEquipmentByCode(String(rowIdentifier), params.userScope)
    }
    const associationLimitation = !linkedEquipment && rowIdentifier !== undefined
      ? 'The dataset row has an equipment identifier, but no matching equipment record was found; no equipment record was created.'
      : undefined
    const base = {
      equipmentId: linkedEquipment?.id || params.equipmentId || (rowIdentifier === undefined ? `dataset:${params.datasetId}:${params.rowIndex ?? 0}` : String(rowIdentifier)),
      equipmentName: linkedEquipment?.name || String(row[sourceFor('equipment_name')] || row[sourceFor('equipment_type')] || 'Equipment record unavailable'),
      equipmentType: linkedEquipment?.equipmentType || String(row[sourceFor('equipment_type')] || 'Medical Equipment'),
      condition: 'UNKNOWN',
      healthScore: null as number | null,
      riskLevel: 'UNKNOWN',
      failureRisk: null as number | null,
      anomalyDetected: false,
      aiMode: mode,
      selectedModel: selected ? {
        id: selected.id,
        name: selected.name,
        version: selected.version,
        algorithm: selected.algorithm,
        trainingDataType: selected.trainingDataType,
        datasetName: selected.datasetName,
        status: selected.status,
        isOperational: selected.isOperational,
        isValidated: selected.status !== 'FAILED' && selected.artifactAvailable,
        artifactAvailable: selected.artifactAvailable,
      } : null,
      reasons: [] as string[],
      contributingFactors: [] as Array<{ factor: string; direction: 'INCREASES_RISK' | 'DECREASES_RISK' | 'NEUTRAL' }>,
      recommendedActions: [] as string[],
      maintenancePriority: 'LOW',
      priorityReason: 'No elevated operational indicator was provided.',
      limitations: [...selection.limitations],
      dataLabel: mode === 'HISTORICAL_SAFETY_INTELLIGENCE' ? 'HISTORICAL SAFETY DATA' : 'OPERATIONAL TELEMETRY',
    }
    if (associationLimitation) base.limitations.push(associationLimitation)

    if (mode === 'HISTORICAL_SAFETY_INTELLIGENCE') {
      if (!params.equipmentId) {
        return {
          ...base,
          reasons: ['Historical safety intelligence requires a provenance-linked historical device.'],
          recommendedActions: ['Select a historical device associated with the active historical safety dataset.'],
          limitations: [...base.limitations, 'No operational failure risk, alert, or maintenance priority is produced.'],
        }
      }
      const historical = await historicalPredictionService.assessEquipment(params.equipmentId, params.userScope)
      return {
        ...base,
        condition: historical.prediction.riskLevel === 'HIGH' ? 'ATTENTION' : 'UNKNOWN',
        riskLevel: historical.prediction.riskLevel,
        reasons: historical.prediction.explanation,
        recommendedActions: [historical.operationalAction],
        historicalSafetyRisk: historical.prediction.recurrenceProbability,
        historicalAssessment: historical,
        limitations: [...base.limitations, 'Historical recurrence risk is not physical equipment failure risk.'],
        maintenancePriority: 'LOW',
        priorityReason: 'Historical recurrence is informational only and does not create an operational maintenance priority.',
      }
    }

    if (mode === 'NO_AI_AVAILABLE') {
      return {
        ...base,
        reasons: ['No compatible AI capability is available for this dataset.'],
        recommendedActions: ['Review the dataset mapping and capability assessment before requesting an AI assessment.'],
        limitations: [...base.limitations, 'No operational assessment or maintenance priority was produced.'],
      }
    }

    if (mode === 'MAINTENANCE_ANALYSIS') {
      const mapping = (dataset.mappingConfig || {}) as Record<string, string>
      const status = String(row[mapping.maintenanceStatus || 'maintenance_status'] || '').trim()
      const dateValue = row[mapping.lastMaintenance || 'last_maintenance']
      const date = dateValue ? new Date(String(dateValue)) : null
      const overdue = date && !Number.isNaN(date.getTime()) && date.getTime() < Date.now() - 180 * 86400000
      return {
        ...base,
        condition: overdue || /overdue|open|due/i.test(status) ? 'ATTENTION' : 'HEALTHY',
        healthScore: overdue || /overdue|open|due/i.test(status) ? 70 : 90,
        riskLevel: overdue || /overdue|open|due/i.test(status) ? 'MEDIUM' : 'LOW',
        reasons: [status ? `Maintenance status is ${status}.` : 'Maintenance history is available for review.'],
        recommendedActions: [overdue ? 'Schedule biomedical maintenance review.' : 'Continue maintenance review according to hospital policy.'],
        maintenancePriority: overdue || /overdue|open|due/i.test(status) ? 'HIGH' : 'LOW',
        priorityReason: overdue || /overdue|open|due/i.test(status) ? 'Maintenance status or age indicates review is due.' : 'Maintenance record does not indicate an overdue condition.',
      }
    }

    const selectedRecord = selected ? await prisma.modelVersion.findUnique({ where: { id: selected.id } }) : null
    const operational = await this.runDatasetOperationalAssessment(dataset, row, params, selected, selectedRecord, sourceFor)
    const result = {
      ...base,
      ...operational,
      aiMode: mode,
      dataLabel: 'OPERATIONAL TELEMETRY',
      maintenancePriority: this.buildPriority(operational.healthScore, operational.failureRisk, operational.anomalyDetected),
      priorityReason: operational.failureRisk !== null
        ? `Priority reflects the supervised failure risk (${operational.failureRisk.toFixed(1)}%) and current health score.`
        : operational.anomalyDetected
          ? 'Priority reflects an anomaly requiring biomedical review without a supervised failure probability.'
          : 'No elevated operational indicator was detected.',
      contributingFactors: (operational.reasons || []).map((factor: string) => ({
        factor,
        direction: 'INCREASES_RISK' as const,
      })),
      limitations: [...base.limitations, ...(operational.limitations || [])],
    }
    await createEarlyWarningAlert({
      equipmentId: linkedEquipment?.id,
      title: result.failureRisk !== null ? 'Elevated Predicted Failure Risk Detected' : 'Abnormal Operating Behavior Detected',
      aiMode: result.aiMode,
      failureRisk: result.failureRisk,
      healthScore: result.healthScore,
      anomalyDetected: result.anomalyDetected,
      condition: result.condition,
      maintenancePriority: result.maintenancePriority,
      reasons: result.reasons,
      recommendedActions: result.recommendedActions,
      model: result.selectedModel ? { id: result.selectedModel.id, version: result.selectedModel.version, name: result.selectedModel.name } : null,
      dataLabel: result.dataLabel,
    })
    return result
  },

  async readDatasetRows(storagePath: string | null) {
    if (!storagePath) throw new Error('DATASET_CONTENT_NOT_AVAILABLE')
    const fs = await import('fs/promises')
    const path = await import('path')
    const resolved = path.resolve(storagePath)
    const rows = JSON.parse(await fs.readFile(resolved, 'utf8'))
    if (!Array.isArray(rows)) throw new Error('DATASET_CONTENT_NOT_AVAILABLE')
    return rows as Record<string, unknown>[]
  },

  async runDatasetOperationalAssessment(
    dataset: any,
    row: Record<string, unknown>,
    params: any,
    selected: any,
    selectedRecord: any,
    sourceFor: (canonical: string) => string,
  ) {
    const mapping = (dataset.mappingConfig || {}) as Record<string, string>
    const value = (field: string) => row[mapping[field] || sourceFor(field)]
    const equipment = {
      id: params.equipmentId || String(value('equipmentId') || `dataset:${dataset.id}`),
      equipmentType: String(value('equipmentType') || 'Medical Equipment'),
      equipmentCode: String(value('equipmentId') || 'DATASET-EQUIPMENT'),
      name: String(value('equipmentName') || value('equipmentType') || 'Medical Equipment'),
      manufacturer: String(value('manufacturer') || 'Unknown'),
      model: String(value('model') || 'Unknown'),
      department: String(value('department') || 'General'),
      location: String(value('location') || 'Unknown'),
      operatingHours: Number(value('operatingHours') || 0),
      criticality: 'MEDIUM',
      lastMaintenanceDaysAgo: 30,
    }
    const manualReadings = {
      temperature: Number(value('temperature')),
      vibration: Number(value('vibration')),
      powerKw: Number(value('power')),
      pressure: Number(value('pressure')),
      operatingHours: Number(value('operatingHours')),
      errorCount: Number(value('errorCount') || 0),
    }
    const validReadings = Object.fromEntries(Object.entries(manualReadings).filter(([, item]) => Number.isFinite(item)))
    const selectedFeatures = ((selectedRecord?.featureSchema as { originalFeatures?: string[] } | null)?.originalFeatures || []) as string[]
    const featureVector = selected
      ? Object.fromEntries(selectedFeatures
        .map((feature) => [feature, row[feature]])
        .filter(([, item]) => item !== undefined && item !== null && item !== '' )) 
      : undefined
    if (!Object.keys(validReadings).length) {
      return {
        condition: 'UNKNOWN',
        healthScore: null,
        riskLevel: 'UNKNOWN',
        failureRisk: null,
        anomalyDetected: false,
        reasons: ['No usable operational telemetry values were found in the mapped dataset row.'],
        recommendedActions: ['Review the canonical telemetry mapping.'],
        limitations: ['The row could not be assessed without usable telemetry values.'],
      }
    }
    const response = await fetch(`${ML_SERVICE_URL}/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {}) },
      body: JSON.stringify({
        equipment,
        manualReadings: validReadings,
        ...(featureVector && Object.keys(featureVector).length === selectedFeatures.length ? { featureVector } : {}),
        source: 'dataset',
        ...(selectedRecord?.artifactPath ? { modelArtifact: selectedRecord.artifactPath, modelVersionOverride: selected.version, modelDataset: selected.datasetName, modelTrainingDataType: selected.trainingDataType } : {}),
      }),
    })
    const result = await response.json() as any
    if (!response.ok) {
      return {
        condition: 'UNKNOWN',
        healthScore: null,
        riskLevel: 'UNKNOWN',
        failureRisk: null,
        anomalyDetected: false,
        reasons: ['The compatible operational model could not assess this dataset row.'],
        recommendedActions: ['Review model compatibility and artifact availability.'],
        limitations: [result.detail || 'Operational model assessment failed.'],
      }
    }
    const risk = typeof result.failureRisk === 'number' && selected ? result.failureRisk : null
    return {
      condition: result.healthScore >= 80 ? 'HEALTHY' : result.healthScore >= 50 ? 'ATTENTION' : 'POOR',
      healthScore: result.healthScore ?? null,
      riskLevel: risk === null ? 'UNKNOWN' : result.riskLevel,
      failureRisk: risk,
      anomalyDetected: result.anomalyStatus !== 'NORMAL',
      reasons: result.contributingFactors || [],
      recommendedActions: result.recommendedAction ? [result.recommendedAction] : [],
      limitations: risk === null ? ['Supervised failure prediction was unavailable; no failure probability is reported.'] : [],
    }
  },
  async runAssessment(params: {
    equipmentId?: string
    equipmentType?: string
    manualReadings?: any
    source?: string
    userId?: string
    userScope?: UserScope
  }) {
    let eq: any = null

    if (params.equipmentId) {
      eq = await equipmentService.getEquipmentById(params.equipmentId, params.userScope, true)
      if (!eq || eq === 'FORBIDDEN') {
        throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
      }
    }

    // Build equipment object for ML service
    const equipmentPayload = {
      id: eq?.id || params.equipmentId || 'manual-input',
      equipmentCode: eq?.equipmentCode || 'EQ-MANUAL',
      name: eq?.name || params.equipmentType || 'Medical Equipment',
      equipmentType: eq?.equipmentType || params.equipmentType || 'Medical Device',
      manufacturer: eq?.manufacturer || 'Generic',
      model: eq?.model || 'Standard',
      department: eq?.department || params.manualReadings?.department || 'General',
      location: eq?.location || 'Storage',
      operatingHours: eq?.operatingHours || params.manualReadings?.operatingHours || 100,
      criticality: eq?.criticality || 'MEDIUM',
      lastMaintenanceDaysAgo: params.manualReadings?.lastMaintenanceDaysAgo || 30,
    }

    // Construct ML assessment request payload
    const mlPayload: Record<string, unknown> = {
      equipment: equipmentPayload,
      telemetry: [],
      manualReadings: params.manualReadings ? {
        temperature: params.manualReadings.temperature,
        vibration: params.manualReadings.vibration,
        powerKw: params.manualReadings.powerKw,
        pressure: params.manualReadings.pressure,
        voltage: params.manualReadings.voltage,
        operatingHours: params.manualReadings.operatingHours,
        errorCount: params.manualReadings.errorCount,
      } : undefined,
      source: params.source || 'telemetry',
    }

    const activeDataset = await prisma.dataset.findFirst({
      where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } },
      select: { id: true },
    })
    const operationalModel = activeDataset ? await prisma.modelVersion.findFirst({
      where: { isOperational: true, datasetId: activeDataset.id },
      orderBy: { activatedAt: 'desc' },
    }) : null
    if (operationalModel?.artifactPath) {
      mlPayload.modelArtifact = operationalModel.artifactPath
      mlPayload.modelVersionOverride = operationalModel.version
      mlPayload.modelDataset = operationalModel.datasetName
      mlPayload.modelTrainingDataType = operationalModel.trainingDataType
    }

    let mlResponseData: any = null

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(`${ML_SERVICE_URL}/assess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {}),
        },
        body: JSON.stringify(mlPayload),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        throw new Error(`ML service returned status ${res.status}`)
      }
      mlResponseData = await res.json()
    } catch (err: any) {
      console.warn(`[Assessment Service] ML service call failed (${err?.message}). Checking for a persisted last-known assessment.`)
      // If ML service is unavailable, do NOT fabricate a fake prediction.
      // If equipmentId is present, check for existing previous assessment
      if (params.equipmentId) {
        const lastKnown = await this.getLatestAssessment(params.equipmentId, params.userScope)
        if (lastKnown) {
          return {
            ...lastKnown,
            dataType: 'LAST_KNOWN_ASSESSMENT',
            modelDisclaimer: 'AI Assessment Service temporarily unavailable. Displaying last known assessment.',
          }
        }
      }
      throw new Error('ML_SERVICE_UNAVAILABLE')
    }

    // Map response to domain output
    const assessmentResult = {
      id: `ass-${Date.now()}`,
      equipmentId: equipmentPayload.id,
      healthScore: mlResponseData.healthScore,
      healthLabel: mlResponseData.healthLabel,
      failureRisk: mlResponseData.failureRisk,
      riskLevel: mlResponseData.riskLevel,
      operationalStatus: mlResponseData.operationalStatus,
      safetyStatus: mlResponseData.safetyStatus,
      anomalyStatus: mlResponseData.anomalyStatus,
      anomalies: mlResponseData.anomalies || [],
      maintenancePriority: mlResponseData.maintenancePriority,
      priorityLabel: mlResponseData.priorityLabel,
      explanations: mlResponseData.contributingFactors || [],
      contributions: mlResponseData.contributions || [],
      recommendedAction: mlResponseData.recommendedAction,
      modelVersion: mlResponseData.modelVersion || 'v1.0.0-rf-isolationforest',
      assessmentType: mlResponseData.assessmentType || 'ML',
      dataType: mlResponseData.dataType || 'SIMULATED_TELEMETRY',
      modelDisclaimer: mlResponseData.modelDisclaimer || 'DEMO MODEL — NOT CLINICALLY VALIDATED',
      assessedAt: mlResponseData.assessedAt || new Date().toISOString(),
    }

    // Persist to Database if equipment exists
    if (eq && eq.id) {
      try {
        const savedAssessment = await prisma.assessment.create({
          data: {
            equipmentId: eq.id,
            healthScore: assessmentResult.healthScore,
            failureRisk: Math.round(assessmentResult.failureRisk),
            operationalStatus: assessmentResult.operationalStatus,
            safetyStatus: assessmentResult.safetyStatus,
            anomalyStatus: assessmentResult.anomalyStatus,
            maintenancePriority: String(assessmentResult.maintenancePriority),
            explanation: JSON.stringify(assessmentResult.explanations),
            modelVersionId: operationalModel?.id,
            assessedAt: new Date(assessmentResult.assessedAt),
          },
        })

        // Update equipment table with latest risk & status
        const nextStatus = assessmentResult.operationalStatus as EquipmentStatus
        await prisma.equipment.update({
          where: { id: eq.id },
          data: {
            healthScore: assessmentResult.healthScore,
            failureRisk: Math.round(assessmentResult.failureRisk),
            ...(Object.values(EquipmentStatus).includes(nextStatus) ? { status: nextStatus } : {}),
          },
        })

        await createEarlyWarningAlert({
          equipmentId: eq.id,
          assessmentId: savedAssessment.id,
          title: 'Elevated Predicted Failure Risk Detected',
          aiMode: 'OPERATIONAL_FAILURE_PREDICTION',
          failureRisk: typeof assessmentResult.failureRisk === 'number' ? assessmentResult.failureRisk : null,
          healthScore: assessmentResult.healthScore,
          anomalyDetected: assessmentResult.anomalyStatus !== 'NORMAL',
          condition: assessmentResult.healthLabel,
          maintenancePriority: String(assessmentResult.maintenancePriority),
          reasons: assessmentResult.explanations,
          recommendedActions: assessmentResult.recommendedAction ? [assessmentResult.recommendedAction] : [],
          model: operationalModel ? { id: operationalModel.id, version: operationalModel.version, name: operationalModel.name } : null,
          dataLabel: assessmentResult.dataType === 'HISTORICAL_SAFETY_DATA' ? 'HISTORICAL SAFETY DATA' : 'OPERATIONAL TELEMETRY',
        })
      } catch (error: any) {
        console.error(`[Assessment Service] PostgreSQL persistence failed for ${eq.id}: ${error?.message || error}`)
        throw new Error('ASSESSMENT_PERSISTENCE_FAILED')
      }

      // Record Audit Log safely
      try {
        await auditService.log({
          userId: params.userId,
          action: 'AI_ASSESSMENT_COMPLETED',
          entityType: 'Equipment',
          entityId: eq.id,
          details: {
            healthScore: assessmentResult.healthScore,
            failureRisk: assessmentResult.failureRisk,
            riskLevel: assessmentResult.riskLevel,
            modelVersion: assessmentResult.modelVersion,
          },
        })
      } catch {
        // Continue if audit logging table is unavailable in standalone mode
      }

      socketManager.emitToRoom(`equipment:${eq.id}`, 'prediction:update', assessmentResult)
    }

    // Always emit global real-time Socket.IO prediction and risk update events
    socketManager.emit('prediction:update', assessmentResult)
    socketManager.emit('risk:changed', {
      equipmentId: assessmentResult.equipmentId,
      failureRisk: assessmentResult.failureRisk,
      riskLevel: assessmentResult.riskLevel,
    })

    return assessmentResult
  },

  async getLatestAssessment(equipmentId: string, scope?: UserScope) {
    // Verify scope access
    const eq = await equipmentService.getEquipmentById(equipmentId, scope)
    if (!eq || eq === 'FORBIDDEN') return null

    try {
      const item = await prisma.assessment.findFirst({
        where: { equipmentId },
        orderBy: { assessedAt: 'desc' },
        include: { modelVersion: true },
      })
      if (!item) return null

      return {
        id: item.id,
        equipmentId: item.equipmentId,
        healthScore: item.healthScore,
        failureRisk: item.failureRisk,
        operationalStatus: item.operationalStatus,
        safetyStatus: item.safetyStatus,
        anomalyStatus: item.anomalyStatus,
        maintenancePriority: item.maintenancePriority ? Number(item.maintenancePriority) : 50,
        explanations: item.explanation ? JSON.parse(item.explanation) : [],
        modelVersion: item.modelVersion?.version || 'v1.0.0-rf-isolationforest',
        assessedAt: item.assessedAt.toISOString(),
      }
    } catch (error: any) {
      console.error(`[Assessment Service] PostgreSQL read failed for ${equipmentId}: ${error?.message || error}`)
      throw new Error('ASSESSMENT_DATABASE_UNAVAILABLE')
    }
  },

  async getAssessmentHistory(equipmentId: string, scope?: UserScope, page = 1, limit = 10) {
    const eq = await equipmentService.getEquipmentById(equipmentId, scope)
    if (!eq || eq === 'FORBIDDEN') {
      throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
    }

    try {
      const skip = (page - 1) * limit
      const [total, records] = await Promise.all([
        prisma.assessment.count({ where: { equipmentId } }),
        prisma.assessment.findMany({
          where: { equipmentId },
          orderBy: { assessedAt: 'desc' },
          skip,
          take: limit,
          include: { modelVersion: true },
        }),
      ])

      return {
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      }
    } catch (error: any) {
      console.error(`[Assessment Service] PostgreSQL history read failed for ${equipmentId}: ${error?.message || error}`)
      throw new Error('ASSESSMENT_DATABASE_UNAVAILABLE')
    }
  },
}
