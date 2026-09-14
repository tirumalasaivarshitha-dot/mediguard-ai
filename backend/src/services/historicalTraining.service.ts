import { DatasetType, ModelStatus } from '@prisma/client'
import { prisma } from '../config/database'
import { env } from '../config/env'
import { auditService } from './audit.service'

export const HISTORICAL_TARGET = 'future_qualifying_safety_event_365d'
export const HISTORICAL_DISCLAIMER =
  'Historical Kaggle safety archive only; predicts another qualifying safety event within 365 days after an event cutoff. This is not real-time telemetry, clinical advice, or an operational model.'

const QUALIFYING_TYPES = new Set(['RECALL', 'FIELD_SAFETY_NOTICE', 'SAFETY_ALERT', 'MIXED'])
const MODEL_DEFINITIONS = [
  { algorithm: 'Logistic Regression', suffix: 'logistic-regression' },
  { algorithm: 'Random Forest', suffix: 'random-forest' },
]

function isQualifying(eventType: string) {
  return QUALIFYING_TYPES.has(eventType.toUpperCase().replace(/\s+/g, '_'))
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value))
}

type TemporalSample = {
  cutoffDate: string
  target: number
  features: Record<string, string | number | null>
}

export const historicalTrainingService = {
  async prepareTemporalTraining(datasetId?: string) {
    const dataset = datasetId
      ? await prisma.dataset.findUnique({ where: { id: datasetId } })
      : await prisma.dataset.findFirst({
        where: { datasetType: DatasetType.HISTORICAL_SAFETY, source: 'KAGGLE', isOperational: true },
        orderBy: { createdAt: 'desc' },
      })
    if (!dataset) throw new Error('ACTIVE_KAGGLE_DATASET_NOT_FOUND')
    if (dataset.datasetType !== DatasetType.HISTORICAL_SAFETY || dataset.source !== 'KAGGLE') {
      throw new Error('HISTORICAL_TRAINING_REQUIRES_KAGGLE')
    }
    if (!dataset.isOperational) throw new Error('KAGGLE_DATASET_NOT_ACTIVE')

    const [sourceCounts, events] = await Promise.all([
      Promise.all([
        prisma.historicalManufacturer.count(),
        prisma.historicalDevice.count(),
        prisma.historicalSafetyEvent.count(),
      ]).then(([manufacturers, devices, events]) => ({ manufacturers, devices, events })),
      prisma.historicalSafetyEvent.findMany({
        where: { eventDate: { not: null }, dateQuality: 'EXACT' },
        include: { device: { include: { manufacturer: true } } },
        orderBy: [{ eventDate: 'asc' }, { id: 'asc' }],
      }),
    ])
    const provenanceFiles = Array.isArray((dataset.provenance as any)?.files) ? (dataset.provenance as any).files : []
    const provenanceCounts = Object.fromEntries(provenanceFiles.map((file: any) => [file.role, Number(file.rowCount) || 0]))

    const datedEvents = events
    .filter((event) => event.eventDate && event.eventDate.getUTCFullYear() >= 1900 && event.eventDate.getUTCFullYear() <= 2100)
      .map((event) => ({ ...event, eventDate: event.eventDate! }))
    const qualifying = datedEvents.filter((event) => isQualifying(event.eventType))
    if (!qualifying.length) throw new Error('HISTORICAL_TRAINING_NO_DATED_QUALIFYING_EVENTS')

    const maxDate = Math.max(...qualifying.map((event) => event.eventDate.getTime()))
    const samples: TemporalSample[] = []
    const byDevice = new Map<string, typeof datedEvents>()
    datedEvents.forEach((event) => {
      const list = byDevice.get(event.deviceId) || []
      list.push(event)
      byDevice.set(event.deviceId, list)
    })
    const qualifyingByDevice = new Map<string, typeof qualifying>()
    qualifying.forEach((event) => {
      const list = qualifyingByDevice.get(event.deviceId) || []
      list.push(event)
      qualifyingByDevice.set(event.deviceId, list)
    })

    for (const deviceEvents of byDevice.values()) {
      for (const event of deviceEvents) {
        const cutoff = event.eventDate.getTime()
        // A complete 365-day observation window is required; otherwise the
        // target would incorrectly treat right-censored history as a negative.
        if (cutoff + 365 * 24 * 60 * 60 * 1000 > maxDate) continue
        const prior = deviceEvents.filter((candidate) => candidate.eventDate.getTime() < cutoff)
        const future = (qualifyingByDevice.get(event.deviceId) || []).some((candidate) => {
          const delta = candidate.eventDate.getTime() - cutoff
          return delta > 0 && delta <= 365 * 24 * 60 * 60 * 1000
        })
        const previous = prior[prior.length - 1]
        const device = event.device
        const manufacturer = device.manufacturer
        samples.push({
          cutoffDate: event.eventDate.toISOString(),
          target: future ? 1 : 0,
          features: {
            device_classification: device.classification,
            device_code_category: device.deviceCode ? device.deviceCode.slice(0, 3).toUpperCase() : null,
            device_name_category: device.normalizedName ? device.normalizedName.split(/[\s,]+/)[0].slice(0, 40) : null,
            device_country: device.country,
            device_implanted: device.implanted,
            device_quantity_in_commerce: device.quantityInCommerce,
            device_risk_class: device.riskClass,
            manufacturer_name_category: manufacturer.normalizedName.split(/[\s,]+/)[0].slice(0, 60),
            manufacturer_country: manufacturer.country,
            manufacturer_parent_company: manufacturer.parentCompany,
            prior_event_count: prior.length,
            prior_recall_count: prior.filter((item) => item.eventType === 'RECALL' || item.eventType === 'MIXED').length,
            prior_field_notice_count: prior.filter((item) => item.eventType === 'FIELD_SAFETY_NOTICE' || item.eventType === 'MIXED').length,
            prior_safety_alert_count: prior.filter((item) => item.eventType === 'SAFETY_ALERT' || item.eventType === 'MIXED').length,
            prior_days_since_event: previous ? Math.max(0, (cutoff - previous.eventDate.getTime()) / (24 * 60 * 60 * 1000)) : null,
          },
        })
      }
    }

    const labels = new Set(samples.map((sample) => sample.target))
    const cutoffDates = samples.map((sample) => new Date(sample.cutoffDate).getTime()).sort((a, b) => a - b)
    if (samples.length < 20 || labels.size < 2 || cutoffDates.length < 2) {
      throw new Error(`INSUFFICIENT_TEMPORAL_SAMPLES: need at least 20 complete samples and both classes; found ${samples.length} samples and ${labels.size} classes`)
    }
    const splitIndex = Math.max(1, Math.floor(cutoffDates.length * 0.75))
    const splitCutoff = new Date(cutoffDates[splitIndex]).toISOString()
    const trainSamples = samples.filter((sample) => sample.cutoffDate < splitCutoff)
    const evaluationSamples = samples.filter((sample) => sample.cutoffDate >= splitCutoff)
    if (!trainSamples.length || !evaluationSamples.length ||
      new Set(trainSamples.map((sample) => sample.target)).size < 2 ||
      new Set(evaluationSamples.map((sample) => sample.target)).size < 2) {
      throw new Error('INSUFFICIENT_TEMPORAL_CLASSES: chronological train and evaluation partitions must each contain both classes')
    }

    return {
      dataset,
      samples,
      sourceCounts,
      provenanceCounts,
      trainSamples,
      evaluationSamples,
      splitCutoff,
      featureSchema: Object.keys(samples[0].features),
      targetDefinition: 'At each device event cutoff, 1 iff another qualifying recall, field safety notice, safety alert, or mixed safety event occurs strictly after the cutoff and within the next 365 days; otherwise 0. Samples without a complete 365-day observation window are excluded.',
    }
  },

  async train(datasetId: string | undefined, userId?: string, clientIp?: string) {
    const prepared = await this.prepareTemporalTraining(datasetId)
    const names = MODEL_DEFINITIONS.map((definition) => ({
      ...definition,
      name: 'Kaggle Historical Safety Temporal Recurrence',
      version: `v1-temporal-365-${definition.suffix}`,
    }))
    const existing = await prisma.modelVersion.findMany({
      where: { datasetId: prepared.dataset.id, name: names[0].name, version: { in: names.map((item) => item.version) }, status: ModelStatus.EVALUATION },
    })
    if (existing.length === names.length && existing.every((model) => Boolean(model.artifactPath))) {
      return { datasetId: prepared.dataset.id, reused: true, sourceCounts: prepared.sourceCounts, provenanceCounts: prepared.provenanceCounts, models: existing, disclaimer: HISTORICAL_DISCLAIMER }
    }

    const response = await fetch(`${env.ML_SERVICE_URL}/train-historical-safety`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        // Keep the complete DB-derived sample count in metadata while using a
        // deterministic chronological thinning cap for bounded request/training
        // time on the large Kaggle archive.
        samples: prepared.samples.length > 30000
          ? prepared.samples.filter((_sample, index) => index % Math.ceil(prepared.samples.length / 30000) === 0)
          : prepared.samples,
        totalTemporalSamples: prepared.samples.length,
        algorithms: names.map((item) => item.algorithm),
        targetDefinition: prepared.targetDefinition,
        featureSchema: prepared.featureSchema,
        sourceCounts: prepared.sourceCounts,
        provenanceCounts: prepared.provenanceCounts,
        splitCutoff: prepared.splitCutoff,
        datasetId: prepared.dataset.id,
      }),
    })
    const result = await response.json() as any
    if (!response.ok || !result.success) {
      throw new Error(`HISTORICAL_TRAINING_INVALID: ${result.message || result.detail || 'Historical ML training failed'}`)
    }

    const models = []
    for (const definition of names) {
      const trained = result.models?.[definition.algorithm]
      if (!trained) throw new Error(`Historical ML training did not return ${definition.algorithm}`)
      const model = await prisma.modelVersion.upsert({
        where: { id: existing.find((item) => item.version === definition.version)?.id || '__missing__' },
        create: {
          name: definition.name,
          version: definition.version,
          algorithm: definition.algorithm,
          datasetId: prepared.dataset.id,
          datasetName: prepared.dataset.name,
          status: ModelStatus.EVALUATION,
          accuracy: trained.metrics.accuracy,
          precision: trained.metrics.precision,
          recall: trained.metrics.recall,
          f1Score: trained.metrics.f1Score,
          rocAuc: trained.metrics.rocAuc,
          trainingDuration: trained.trainingDuration,
          targetColumn: HISTORICAL_TARGET,
          artifactPath: trained.artifactPath,
          trainingSamples: trained.trainingSamples,
          evaluationSamples: trained.evaluationSamples,
          featureCount: trained.featureCount,
          trainingDataType: 'HISTORICAL_SAFETY',
          disclaimer: HISTORICAL_DISCLAIMER,
          featureSchema: jsonValue({ originalFeatures: prepared.featureSchema, targetColumn: HISTORICAL_TARGET, targetDefinition: prepared.targetDefinition, preprocessing: trained.preprocessing, split: { strategy: 'chronological', cutoff: prepared.splitCutoff }, sourceCounts: prepared.sourceCounts, provenanceCounts: prepared.provenanceCounts, totalTemporalSamples: prepared.samples.length }),
          confusionMatrix: trained.metrics.confusionMatrix,
          featureImportance: trained.featureImportance,
          isActive: false,
          isOperational: false,
          trainedAt: new Date(),
        },
        update: {
          accuracy: trained.metrics.accuracy, precision: trained.metrics.precision, recall: trained.metrics.recall,
          f1Score: trained.metrics.f1Score, rocAuc: trained.metrics.rocAuc, trainingDuration: trained.trainingDuration,
          artifactPath: trained.artifactPath, trainingSamples: trained.trainingSamples, evaluationSamples: trained.evaluationSamples,
          featureCount: trained.featureCount, confusionMatrix: trained.metrics.confusionMatrix, featureImportance: trained.featureImportance,
          status: ModelStatus.EVALUATION, isActive: false, isOperational: false, trainedAt: new Date(),
        },
      })
      models.push(model)
      await auditService.log({
        userId, action: 'HISTORICAL_MODEL_TRAINING_COMPLETED', entityType: 'MODEL_VERSION', entityId: model.id,
        details: { datasetId: prepared.dataset.id, algorithm: definition.algorithm, sourceCounts: prepared.sourceCounts, provenanceCounts: prepared.provenanceCounts },
        ipAddress: clientIp,
      })
    }
    return { datasetId: prepared.dataset.id, reused: false, sourceCounts: prepared.sourceCounts, provenanceCounts: prepared.provenanceCounts, trainSamples: prepared.trainSamples.length, evaluationSamples: prepared.evaluationSamples.length, models, disclaimer: HISTORICAL_DISCLAIMER }
  },
}
