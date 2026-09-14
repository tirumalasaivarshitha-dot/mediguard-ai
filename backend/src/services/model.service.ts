import { prisma } from '../config/database'
import { ModelStatus } from '@prisma/client'
import { auditService } from './audit.service'
import { datasetService } from './dataset.service'
import { env } from '../config/env'

export const OPERATIONAL_FEATURES = [
  'temp_current',
  'temp_baseline_dev',
  'vib_current',
  'vib_baseline_dev',
  'power_current',
  'power_baseline_dev',
  'operating_hours',
  'error_count',
  'days_since_maintenance',
  'temp_trend',
  'vib_trend',
]

export const modelService = {
  async assessDatasetCapabilities(datasetId: string) {
    const dataset = await datasetService.getDatasetById(datasetId)
    if (!dataset) throw new Error('DATASET_NOT_FOUND')
    const profile = await datasetService.profileDataset(datasetId)
    const models = await prisma.modelVersion.findMany({
      where: { status: { not: ModelStatus.FAILED } },
      orderBy: [{ isOperational: 'desc' }, { isActive: 'desc' }, { createdAt: 'desc' }],
    })

    const historical = Boolean(profile.capabilities.historicalSafetyIntelligence || dataset.datasetType === 'HISTORICAL_SAFETY')
    const telemetry = Boolean(profile.capabilities.telemetryAnalysis && !historical)
    const modelResults = models.map((model) => {
      const schema = model.featureSchema as { originalFeatures?: string[]; targetColumn?: string; preprocessing?: string } | null
      const expected = schema?.originalFeatures || (model.isOperational ? OPERATIONAL_FEATURES : [])
      const mapping = profile.detectedMapping || []
      const availableSourceColumns = new Set(profile.columnNames)
      const availableCanonical = new Set<string>(mapping.filter((item) => item.status === 'MAPPED' && item.canonicalField).map((item) => String(item.canonicalField)))
      const requiredCanonical = expected.map((feature) => canonicalForOperationalFeature(feature))
      const missing = expected.filter((feature, index) => {
        if (availableSourceColumns.has(feature)) return false
        const canonical = requiredCanonical[index]
        if (feature === 'days_since_maintenance') return false
        return !canonical || !availableCanonical.has(canonical)
      })
      const modelHistorical = String(model.trainingDataType || '').toUpperCase().includes('HISTORICAL') ||
        String(model.datasetName || '').toLowerCase().includes('kaggle') ||
        !model.isOperational && String(model.trainingDataType || '').toUpperCase().includes('SAFETY')
      const modeCompatible = historical ? modelHistorical : !modelHistorical && telemetry
      const targetCompatible = !model.targetColumn || !profile.capabilities.failureTarget?.column ||
        model.targetColumn === profile.capabilities.failureTarget.column || model.datasetId === datasetId
      const statusCompatible = model.status === ModelStatus.ACTIVE || model.status === ModelStatus.EVALUATION
      const artifactAvailable = Boolean(model.artifactPath)
      const schemaCompatible = historical
        ? modelHistorical && model.datasetId === datasetId
        : missing.length === 0 && model.isOperational && model.datasetId === datasetId
      const compatible = modeCompatible && targetCompatible && statusCompatible && artifactAvailable && schemaCompatible &&
        (model.datasetId === datasetId || modelHistorical)
      const quality = (model.rocAuc ?? 0) * 0.45 + (model.f1Score ?? 0) * 0.3 + (model.recall ?? 0) * 0.15 + (model.precision ?? 0) * 0.1
      return {
        model,
        compatible,
        missingFeatures: missing,
        modeCompatible,
        targetCompatible,
        statusCompatible,
        artifactAvailable,
        quality,
      }
    })

    const compatibleModels = modelResults.filter((result) => result.compatible)
    compatibleModels.sort((a, b) =>
      Number(b.model.isOperational) - Number(a.model.isOperational) ||
      Number(b.model.isActive) - Number(a.model.isActive) ||
      b.quality - a.quality ||
      new Date(b.model.createdAt).getTime() - new Date(a.model.createdAt).getTime())
    const selected = compatibleModels[0]?.model || null
    const mode = historical
      ? 'HISTORICAL_SAFETY_INTELLIGENCE'
      : profile.capabilities.maintenanceAnalysis && !telemetry
        ? 'MAINTENANCE_ANALYSIS'
        : profile.capabilities.failurePrediction && selected
          ? 'OPERATIONAL_FAILURE_PREDICTION'
          : telemetry
            ? 'OPERATIONAL_ANOMALY_DETECTION'
            : profile.capabilities.conditionAssessment
              ? 'OPERATIONAL_CONDITION_ASSESSMENT'
              : 'NO_AI_AVAILABLE'
    const limitations: string[] = []
    if (historical) limitations.push('Historical safety intelligence is not live telemetry and cannot produce operational failure alerts.')
    if (telemetry && !profile.capabilities.failurePrediction) limitations.push('Supervised failure prediction is unavailable because no valid binary operational failure label was detected.')
    if (telemetry && profile.capabilities.failurePrediction && !selected) limitations.push('No compatible completed model with an available artifact was found for this dataset.')
    if (mode === 'NO_AI_AVAILABLE') limitations.push('The dataset does not contain enough supported equipment, telemetry, maintenance, or historical safety evidence.')
    return {
      datasetId,
      compatibility: profile.compatibility,
      capabilities: profile.capabilities,
      recommendedMode: mode,
      selectedModel: selected ? serializeModelSelection(selected) : null,
      modelCompatibility: modelResults.map((result) => ({
        modelId: result.model.id,
        modelName: result.model.name,
        compatible: result.compatible,
        missingFeatures: result.missingFeatures,
        modeCompatible: result.modeCompatible,
        targetCompatible: result.targetCompatible,
        statusCompatible: result.statusCompatible,
        artifactAvailable: result.artifactAvailable,
      })),
      reason: selected
        ? `Selected ${selected.name} because it is compatible with the dataset mode and has the strongest deterministic priority/validation score.`
        : mode === 'OPERATIONAL_ANOMALY_DETECTION'
          ? 'Telemetry is available but no compatible supervised failure model is available.'
          : mode === 'HISTORICAL_SAFETY_INTELLIGENCE'
            ? 'Historical safety data is restricted to historical safety intelligence.'
            : 'No compatible AI model is available for this dataset.',
      limitations,
      warnings: profile.warnings,
    }
  },

  async listModels() {
    try {
      const records = await prisma.modelVersion.findMany({
        orderBy: { createdAt: 'desc' },
      })
      return records.map((m) => ({ ...m, disclaimer: m.disclaimer || 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED' }))
    } catch (error: any) {
      console.error(`[Model] PostgreSQL list failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }

  },

  async getModelById(id: string) {
    try {
      const item = await prisma.modelVersion.findUnique({
        where: { id },
      })
      return item ? { ...item, disclaimer: item.disclaimer || 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED' } : null
    } catch (error: any) {
      console.error(`[Model] PostgreSQL read failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async trainModel(
    data: {
      name: string
      version: string
      algorithm: string
      datasetId?: string
      targetColumn?: string
    },
    userId?: string,
    clientIp?: string,
  ) {
    try {
      if (!data.datasetId || !data.targetColumn) throw new Error('DATASET_AND_TARGET_REQUIRED')
      const dataset = await datasetService.getDatasetById(data.datasetId)
      if (!dataset) throw new Error('DATASET_NOT_FOUND')
      if (dataset.datasetType === 'HISTORICAL_SAFETY' || dataset.source === 'KAGGLE') {
        throw new Error('HISTORICAL_DATASET_NOT_FOR_TELEMETRY_TRAINING')
      }
      const rows = await datasetService.readParsedRows(data.datasetId)
      const profile = await datasetService.profileDataset(data.datasetId)
      const identifierColumns = new Set(profile.possibleIdColumns || [])
      const trainingRows = rows.map((row) => Object.fromEntries(
        Object.entries(row).filter(([column]) => column === data.targetColumn || !identifierColumns.has(column)),
      ))
      const response = await fetch(`${env.ML_SERVICE_URL}/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          rows: trainingRows,
          targetColumn: data.targetColumn,
          algorithm: data.algorithm,
          modelName: data.name,
          version: data.version,
          dataType: dataset.datasetType,
          datasetId: dataset.id,
          datasetName: dataset.name,
        }),
      })
      const result = await response.json() as any
      if (!response.ok || !result.success) throw new Error(result.message || 'ML training failed')
      const newModel = await prisma.modelVersion.create({
        data: {
          name: data.name,
          version: data.version,
          algorithm: result.algorithm || data.algorithm,
          datasetId: data.datasetId,
          datasetName: dataset.name,
          status: ModelStatus.EVALUATION,
          accuracy: result.metrics.accuracy,
          precision: result.metrics.precision,
          recall: result.metrics.recall,
          f1Score: result.metrics.f1Score,
          rocAuc: result.metrics.rocAuc,
          trainingDuration: result.trainingDuration,
          targetColumn: data.targetColumn,
          artifactPath: result.artifactPath,
          trainingSamples: result.trainingSamples,
          evaluationSamples: result.evaluationSamples,
          featureCount: result.featureCount,
          trainingDataType: dataset.datasetType,
          disclaimer: 'DEMO MODEL — NOT CLINICALLY VALIDATED',
          featureSchema: {
            originalFeatures: result.originalFeatures || result.featureColumns || [],
            transformedFeatures: result.transformedFeatures || [],
            targetColumn: data.targetColumn,
            preprocessing: result.preprocessing || 'sklearn Pipeline',
            featureTypes: result.featureTypes || {},
            targetNormalization: result.targetNormalization || null,
          },
          confusionMatrix: result.metrics.confusionMatrix,
          featureImportance: result.featureImportance,
          isActive: false,
          trainedAt: new Date(),
        },
      })

      await auditService.log({
        userId,
        action: 'MODEL_TRAINING_COMPLETED',
        entityType: 'MODEL_VERSION',
        entityId: newModel.id,
        details: { name: newModel.name, version: newModel.version, algorithm: newModel.algorithm },
        ipAddress: clientIp,
      })

      return { ...newModel, disclaimer: 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED' }
    } catch (error: any) {
      if (error instanceof Error && (
        ['DATASET_AND_TARGET_REQUIRED', 'DATASET_NOT_FOUND', 'DATASET_CONTENT_NOT_AVAILABLE'].includes(error.message) ||
        error.message === 'HISTORICAL_DATASET_NOT_FOR_TELEMETRY_TRAINING' ||
        error.message === 'ML training failed' ||
        error.message.startsWith('Target column') ||
        error.message.startsWith('Dataset must') ||
        error.message.startsWith('Training failed') ||
        error.message.startsWith('Unsupported model')
      )) throw error
      console.error(`[Model] PostgreSQL training persistence failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async checkCompatibility(id: string) {
    const model = await prisma.modelVersion.findUnique({ where: { id } })
    if (!model) throw new Error('MODEL_NOT_FOUND')
    const schema = model.featureSchema as { originalFeatures?: string[]; targetColumn?: string } | null
    const requiredFeatures = schema?.originalFeatures || []
    const dataset = model.datasetId ? await datasetService.getDatasetById(model.datasetId) : null
    const profile = dataset ? await datasetService.profileDataset(dataset.id) : null
    const availableFeatures = profile?.columnNames || []
    const missingFeatures = requiredFeatures.filter((feature) => !availableFeatures.includes(feature))
    const extraFeatures = availableFeatures.filter((feature) => !requiredFeatures.includes(feature))
    const compatible = Boolean(
      model.artifactPath &&
      dataset &&
      dataset.datasetType !== 'HISTORICAL_SAFETY' &&
      requiredFeatures.length > 0 &&
      missingFeatures.length === 0,
    )
    const reason = compatible
      ? 'Compatible with the source dataset feature schema.'
      : !dataset
        ? 'Model source dataset is unavailable.'
        : dataset.datasetType === 'HISTORICAL_SAFETY'
          ? 'Historical safety models cannot be used for operational equipment assessment.'
          : !model.artifactPath
            ? 'Model artifact is unavailable.'
            : 'Model feature schema requires columns that are not present in its source dataset.'
    await auditService.log({
      action: 'MODEL_COMPATIBILITY_CHECKED',
      entityType: 'MODEL_VERSION',
      entityId: id,
      details: { compatible, requiredFeatures, availableFeatures, missingFeatures, extraFeatures },
    })
    return { compatible, requiredFeatures, availableFeatures, missingFeatures, extraFeatures, targetColumn: schema?.targetColumn || null, reason }
  },

  async activateOperationalModel(id: string, userId?: string, clientIp?: string) {
    const compatibility = await this.checkCompatibility(id)
    if (!compatibility.compatible) {
      await auditService.log({
        userId,
        action: 'OPERATIONAL_MODEL_ACTIVATION_REJECTED',
        entityType: 'MODEL_VERSION',
        entityId: id,
        details: compatibility,
        ipAddress: clientIp,
      })
      throw new Error('MODEL_NOT_OPERATIONALLY_COMPATIBLE')
    }
    const candidate = await prisma.modelVersion.findUnique({ where: { id } })
    if (!candidate || !candidate.artifactPath) throw new Error('MODEL_ARTIFACT_NOT_AVAILABLE')
    if (candidate.status === ModelStatus.FAILED) throw new Error('MODEL_FAILED')
    await prisma.modelVersion.updateMany({ data: { isOperational: false } })
    const operational = await prisma.modelVersion.update({
      where: { id },
      data: { isOperational: true },
    })
    await auditService.log({
      userId,
      action: 'OPERATIONAL_MODEL_ACTIVATED',
      entityType: 'MODEL_VERSION',
      entityId: id,
      details: { version: operational.version },
      ipAddress: clientIp,
    })
    return { ...operational, compatibility }
  },

  async activateModel(id: string, userId?: string, clientIp?: string) {
    try {
      const candidate = await prisma.modelVersion.findUnique({ where: { id } })
      if (!candidate) throw new Error('MODEL_NOT_FOUND')
      if (candidate.recall !== null && candidate.recall < 0.9) {
        throw new Error('MODEL_BELOW_REVIEW_THRESHOLD')
      }
      await prisma.modelVersion.updateMany({
        data: { isActive: false, status: ModelStatus.INACTIVE, activatedAt: null },
      })

      const activated = await prisma.modelVersion.update({
        where: { id },
        data: { isActive: true, status: ModelStatus.ACTIVE, activatedAt: new Date() },
      })

      await auditService.log({
        userId,
        action: 'MODEL_ACTIVATED',
        entityType: 'MODEL_VERSION',
        entityId: id,
        details: { name: activated.name, version: activated.version },
        ipAddress: clientIp,
      })

      return { ...activated, disclaimer: 'AI-GENERATED PREDICTION — DEMO MODEL — NOT CLINICALLY VALIDATED' }
    } catch (error: any) {
      if (error instanceof Error && (error.message === 'MODEL_NOT_FOUND' || error.message === 'MODEL_BELOW_REVIEW_THRESHOLD')) {
        throw error
      }
      console.error(`[Model] PostgreSQL activation failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },
}

function canonicalForOperationalFeature(feature: string) {
  const names: Record<string, string> = {
    temp_current: 'temperature',
    temp_baseline_dev: 'temperature',
    temp_trend: 'temperature',
    vib_current: 'vibration',
    vib_baseline_dev: 'vibration',
    vib_trend: 'vibration',
    power_current: 'power',
    power_baseline_dev: 'power',
    operating_hours: 'operating_hours',
    error_count: 'error_count',
    days_since_maintenance: 'last_maintenance',
  }
  return names[feature]
}

function serializeModelSelection(model: Awaited<ReturnType<typeof prisma.modelVersion.findUnique>>) {
  if (!model) return null
  return {
    id: model.id,
    name: model.name,
    version: model.version,
    algorithm: model.algorithm,
    trainingDataType: model.trainingDataType,
    datasetId: model.datasetId,
    datasetName: model.datasetName,
    status: model.status,
    isOperational: model.isOperational,
    isActive: model.isActive,
    artifactAvailable: Boolean(model.artifactPath),
    targetColumn: model.targetColumn,
    featureSchema: model.featureSchema,
    reason: 'Compatible feature schema, data mode, model status, artifact availability, and validation metadata.',
  }
}
