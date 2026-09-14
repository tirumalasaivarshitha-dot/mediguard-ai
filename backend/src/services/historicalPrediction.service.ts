import { DatasetType, ModelStatus } from '@prisma/client'
import { prisma } from '../config/database'
import { env } from '../config/env'
import { equipmentService, UserScope } from './equipment.service'
import { HISTORICAL_DISCLAIMER, HISTORICAL_TARGET } from './historicalTraining.service'

const QUALIFYING_TYPES = new Set(['RECALL', 'FIELD_SAFETY_NOTICE', 'SAFETY_ALERT', 'MIXED'])

function isType(eventType: string, type: string) {
  return eventType === type || (type !== 'MIXED' && eventType === 'MIXED')
}

function featureLabel(feature: string) {
  const name = feature.replace(/^(numeric|categorical)__/, '')
  if (name.startsWith('prior_event_count')) return 'Previous safety-event history increases recurrence risk.'
  if (name.startsWith('prior_recall_count')) return 'Previous recall history contributes to the historical recurrence estimate.'
  if (name.startsWith('prior_field_notice_count')) return 'Previous field safety notice history contributes to the historical recurrence estimate.'
  if (name.startsWith('prior_safety_alert_count')) return 'Previous safety alert history contributes to the historical recurrence estimate.'
  if (name.startsWith('prior_days_since_event')) return 'The time since the previous recorded event contributes to the estimate.'
  if (name.startsWith('device_risk_class')) return 'Device risk classification contributes to the historical estimate.'
  if (name.startsWith('device_classification') || name.startsWith('device_code_category') || name.startsWith('device_name_category')) return 'Device characteristics are associated with historical recurrence patterns.'
  if (name.startsWith('manufacturer_')) return 'Manufacturer characteristics are associated with historical recurrence patterns.'
  return null
}

export const historicalPredictionService = {
  async assessEquipment(equipmentId: string, scope?: UserScope) {
    const equipment = await equipmentService.getEquipmentById(equipmentId, scope)
    if (!equipment || equipment === 'FORBIDDEN') throw new Error(equipment === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')

    const activeDataset = await prisma.dataset.findFirst({
      where: { datasetType: DatasetType.HISTORICAL_SAFETY, source: 'KAGGLE', isOperational: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true },
    })
    if (!activeDataset || equipment.sourceDatasetId !== activeDataset.id || !equipment.sourceIdentifier) {
      throw new Error('HISTORICAL_DEVICE_REQUIRED')
    }

    const device = await prisma.historicalDevice.findUnique({
      where: { sourceId: equipment.sourceIdentifier },
      include: {
        manufacturer: true,
        events: {
          where: { eventDate: { not: null }, dateQuality: 'EXACT' },
          orderBy: { eventDate: 'asc' },
        },
      },
    })
    if (!device) throw new Error('HISTORICAL_DEVICE_NOT_FOUND')

    const datedEvents = device.events.filter((event) => event.eventDate)
    const cutoffEvent = datedEvents[datedEvents.length - 1]
    if (!cutoffEvent?.eventDate) throw new Error('HISTORICAL_CUTOFF_UNAVAILABLE')
    const prior = datedEvents.filter((event) => event.eventDate!.getTime() < cutoffEvent.eventDate!.getTime())
    const previous = prior[prior.length - 1]
    const features = {
      device_classification: device.classification,
      device_code_category: device.deviceCode ? device.deviceCode.slice(0, 3).toUpperCase() : null,
      device_name_category: device.normalizedName ? device.normalizedName.split(/[\s,]+/)[0].slice(0, 40) : null,
      device_country: device.country,
      device_implanted: device.implanted,
      device_quantity_in_commerce: device.quantityInCommerce,
      device_risk_class: device.riskClass,
      manufacturer_name_category: device.manufacturer.normalizedName.split(/[\s,]+/)[0].slice(0, 60),
      manufacturer_country: device.manufacturer.country,
      manufacturer_parent_company: device.manufacturer.parentCompany,
      prior_event_count: prior.length,
      prior_recall_count: prior.filter((event) => isType(event.eventType, 'RECALL')).length,
      prior_field_notice_count: prior.filter((event) => isType(event.eventType, 'FIELD_SAFETY_NOTICE')).length,
      prior_safety_alert_count: prior.filter((event) => isType(event.eventType, 'SAFETY_ALERT')).length,
      prior_days_since_event: previous ? Math.max(0, (cutoffEvent.eventDate.getTime() - previous.eventDate!.getTime()) / 86400000) : null,
    }

    const model = await prisma.modelVersion.findFirst({
      where: {
        datasetId: activeDataset.id,
        status: ModelStatus.EVALUATION,
        trainingDataType: 'HISTORICAL_SAFETY',
        artifactPath: { startsWith: 'trained/historical_' },
        targetColumn: HISTORICAL_TARGET,
      },
      orderBy: [{ rocAuc: 'desc' }, { f1Score: 'desc' }, { createdAt: 'desc' }],
    })
    if (!model?.artifactPath) throw new Error('HISTORICAL_MODEL_NOT_AVAILABLE')

    const response = await fetch(`${env.ML_SERVICE_URL}/predict-historical-safety`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ML_SERVICE_TOKEN ? { Authorization: 'Bearer ' + env.ML_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify({
        artifactPath: model.artifactPath,
        modelVersion: model.version,
        features,
      }),
    })
    const result = await response.json() as any
    if (!response.ok || !result.success) throw new Error(result.detail?.message || result.detail || 'Historical prediction failed')

    const probability = typeof result.recurrenceProbability === 'number' ? result.recurrenceProbability : null
    const contributions = Array.isArray(result.contributions) ? result.contributions : []
    const explanations = contributions
      .filter((item: any) => Math.abs(Number(item.contribution) || 0) > 0)
      .map((item: any) => featureLabel(String(item.feature)))
      .filter((item: string | null): item is string => Boolean(item))
      .filter((item: string, index: number, items: string[]) => items.indexOf(item) === index)
      .slice(0, 3)

    return {
      equipmentId: equipment.id,
      equipment: {
        equipmentCode: equipment.equipmentCode,
        name: equipment.name,
        manufacturer: equipment.manufacturer,
        model: equipment.model,
        sourceIdentifier: equipment.sourceIdentifier,
      },
      dataLabel: 'HISTORICAL SAFETY DATA',
      disclaimer: HISTORICAL_DISCLAIMER,
      cutoffDate: cutoffEvent.eventDate.toISOString(),
      model: {
        id: model.id,
        name: model.name,
        version: model.version,
        algorithm: model.algorithm,
        datasetName: activeDataset.name,
        trainingDataType: model.trainingDataType,
        status: 'COMPLETED / NON-OPERATIONAL',
        target: HISTORICAL_TARGET,
        targetDefinition: 'Predicted likelihood of another qualifying safety event within 365 days after the historical event cutoff.',
      },
      prediction: {
        predictedClass: result.predictedClass,
        recurrenceProbability: probability,
        riskLevel: probability === null ? 'UNKNOWN' : probability >= 0.5 ? 'HIGH' : probability >= 0.2 ? 'MEDIUM' : 'LOW',
        explanation: explanations.length ? explanations : ['The estimate is based on the trained historical safety feature schema.'],
        contributions,
      },
      operationalAction: probability !== null && probability >= 0.2
        ? 'Historical recurrence risk warrants Biomedical Engineer review. This estimate is based on historical safety-event patterns and does not indicate an active equipment failure. No operational safety alert or maintenance work order is created.'
        : 'Historical recurrence risk is low. No immediate operational action is indicated by this historical model. Biomedical Engineer review may be performed according to hospital policy. No operational safety alert or maintenance work order is created.',
    }
  },
}
