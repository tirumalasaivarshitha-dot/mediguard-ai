import { prisma } from '../config/database'
import { env } from '../config/env'
import { datasetService } from './dataset.service'
import { safetyService } from './safety.service'
import { auditService } from './audit.service'
import { socketManager } from '../sockets/socketManager'
import { AlertSeverity, EquipmentStatus } from '@prisma/client'

const PREDICTION_BATCH_SIZE = 500

export const datasetPredictionService = {
  async predictDataset(datasetId: string, modelVersionId: string) {
    const [dataset, model] = await Promise.all([
      datasetService.getDatasetById(datasetId),
      prisma.modelVersion.findUnique({ where: { id: modelVersionId } }),
    ])

    if (!dataset) throw new Error('DATASET_NOT_FOUND')
    if (!model) throw new Error('MODEL_NOT_FOUND')
    if (!model.artifactPath) throw new Error('MODEL_ARTIFACT_NOT_AVAILABLE')
    if (model.datasetId !== datasetId) throw new Error('MODEL_DATASET_MISMATCH')

    const rows = await datasetService.readParsedRows(datasetId)
    if (!rows.length) throw new Error('DATASET_EMPTY')

    const schema = model.featureSchema as { originalFeatures?: string[]; targetColumn?: string } | null
    const expectedColumns = schema?.originalFeatures || []
    if (!expectedColumns.length) throw new Error('MODEL_FEATURE_SCHEMA_UNAVAILABLE')
    const missingColumns = expectedColumns.filter((column) => !Object.prototype.hasOwnProperty.call(rows[0], column))
    if (missingColumns.length) {
      const error = new Error('DATASET_FEATURES_INCOMPATIBLE')
      ;(error as Error & { missingColumns?: string[] }).missingColumns = missingColumns
      throw error
    }

    const predictionRows: Array<{
      rowIndex: number
      rowIdentifier?: string
      prediction: string
      predictedClass?: string
      failureRisk?: number | null
    }> = []

    for (let start = 0; start < rows.length; start += PREDICTION_BATCH_SIZE) {
      const batch = rows.slice(start, start + PREDICTION_BATCH_SIZE)
      const response = await fetch(`${env.ML_SERVICE_URL}/predict-dataset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          artifactPath: model.artifactPath,
          rows: batch,
          targetColumn: schema?.targetColumn || model.targetColumn,
          positiveClass: 1,
          datasetId,
          modelVersion: model.version,
        }),
      })
      const result = await response.json() as {
        results?: Array<{ rowIndex: number; prediction: unknown; failureRisk?: number | null; predictedClass?: unknown; predictionStatus?: string }>
        detail?: string
      }
      if (!response.ok || !Array.isArray(result.results)) {
        throw new Error(result.detail || 'Dataset prediction failed')
      }
      for (const item of result.results) {
        const sourceRow = rows[start + item.rowIndex]
        const profile = dataset.profileSummary as { possibleIdColumns?: string[] } | null
        const identifierColumn = profile?.possibleIdColumns?.find((column) => Object.prototype.hasOwnProperty.call(sourceRow, column))
        predictionRows.push({
          rowIndex: start + item.rowIndex,
          rowIdentifier: identifierColumn && sourceRow[identifierColumn] !== null && sourceRow[identifierColumn] !== undefined
            ? String(sourceRow[identifierColumn])
            : undefined,
          prediction: String(item.prediction),
          predictedClass: item.predictedClass === undefined ? undefined : String(item.predictedClass),
          failureRisk: item.failureRisk ?? null,
        })
      }
    }

    for (let start = 0; start < predictionRows.length; start += PREDICTION_BATCH_SIZE) {
      const batch = predictionRows.slice(start, start + PREDICTION_BATCH_SIZE)
      await prisma.$transaction(
        batch.map((item) => prisma.datasetPredictionResult.upsert({
          where: {
            datasetId_modelVersionId_rowIndex: {
              datasetId,
              modelVersionId,
              rowIndex: item.rowIndex,
            },
          },
          create: {
            datasetId,
            modelVersionId,
            rowIndex: item.rowIndex,
            rowIdentifier: item.rowIdentifier,
            prediction: item.prediction,
            predictedClass: item.predictedClass,
            failureRisk: item.failureRisk,
            status: 'COMPLETED',
            predictedAt: new Date(),
          },
          update: {
            rowIdentifier: item.rowIdentifier,
            prediction: item.prediction,
            predictedClass: item.predictedClass,
            failureRisk: item.failureRisk,
            status: 'COMPLETED',
            errorMessage: null,
            predictedAt: new Date(),
          },
        })),
      )
    }

    const persisted = await prisma.datasetPredictionResult.findMany({
      where: { datasetId, modelVersionId },
      orderBy: { rowIndex: 'asc' },
    })
    const failureResults = persisted.filter((item) => item.prediction === '1' || item.prediction.toLowerCase() === 'failure')

    return {
      datasetId,
      datasetName: dataset.name,
      modelVersionId,
      modelName: model.name,
      modelVersion: model.version,
      algorithm: model.algorithm,
      totalRows: rows.length,
      successfulPredictions: persisted.filter((item) => item.status === 'COMPLETED').length,
      failedPredictions: persisted.filter((item) => item.status !== 'COMPLETED').length,
      failurePredictions: failureResults.length,
      normalPredictions: persisted.length - failureResults.length,
      failureRate: persisted.length ? failureResults.length / persisted.length : 0,
      predictionResults: persisted,
    }
  },

  async processDataset(datasetId: string, modelVersionId: string, userId?: string) {
    const dataset = await datasetService.getDatasetById(datasetId)
    const model = await prisma.modelVersion.findUnique({ where: { id: modelVersionId } })
    if (!dataset) throw new Error('DATASET_NOT_FOUND')
    const activeDataset = await prisma.dataset.findFirst({
      where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } },
      select: { id: true },
    })
    if (!activeDataset || activeDataset.id !== datasetId) throw new Error('DATASET_NOT_ACTIVE')
    if (!model) throw new Error('MODEL_NOT_FOUND')
    if (model.datasetId !== datasetId) throw new Error('MODEL_DATASET_MISMATCH')
    if (!model.artifactPath) throw new Error('MODEL_ARTIFACT_NOT_AVAILABLE')
    const targetSemantics = String(model.targetColumn || '').toLowerCase()
    if (!/(failure|fault|fail|defect|breakdown|malfunction|anomaly)/i.test(targetSemantics)) {
      throw new Error('DATASET_TARGET_SEMANTICS_UNSUPPORTED')
    }

    const predictions = await prisma.datasetPredictionResult.findMany({
      where: { datasetId, modelVersionId, status: 'COMPLETED' },
      orderBy: { rowIndex: 'asc' },
    })
    const rows = await datasetService.readParsedRows(datasetId)
    const mapping = (dataset.mappingConfig || {}) as Record<string, string>
    const profile = (dataset.profileSummary || {}) as { possibleIdColumns?: string[] }
    const identifierColumn = mapping.equipmentId ||
      profile.possibleIdColumns?.find((column) => rows.some((row) => row[column] !== undefined && row[column] !== null && String(row[column]).trim() !== '')) ||
      ['UDI', 'Product ID'].find((column) => rows.some((row) => row[column] !== undefined && row[column] !== null && String(row[column]).trim() !== ''))
    if (!identifierColumn) throw new Error('DATASET_EQUIPMENT_IDENTIFIER_UNAVAILABLE')

    const summary = {
      totalPredictionRows: predictions.length,
      eligibleRows: 0,
      equipmentMatched: 0,
      equipmentCreated: 0,
      unmatchedEquipment: 0,
      assessmentsCreated: 0,
      assessmentsSkipped: 0,
      safetyAlertsCreated: 0,
      safetyAlertsSkipped: 0,
      errors: [] as Array<{ rowIndex: number; message: string }>,
    }

    for (let start = 0; start < predictions.length; start += PREDICTION_BATCH_SIZE) {
      const batch = predictions.slice(start, start + PREDICTION_BATCH_SIZE)
      for (const prediction of batch) {
        try {
          const row = rows[prediction.rowIndex]
          const identifier = row ? String(row[identifierColumn] ?? '').trim() : ''
          if (!identifier) {
            summary.unmatchedEquipment += 1
            continue
          }
          summary.eligibleRows += 1
          let equipment = await prisma.equipment.findFirst({
            where: { sourceDatasetId: datasetId, sourceRowIndex: prediction.rowIndex },
          })
          if (!equipment) {
            equipment = await prisma.equipment.findFirst({
              where: { OR: [{ equipmentCode: identifier }, { serialNumber: identifier }] },
            })
          }
          if (equipment) {
            summary.equipmentMatched += 1
          } else {
            const equipmentCode = `DS-${datasetId.slice(0, 8)}-${identifier}`
            equipment = await prisma.equipment.create({
              data: {
                equipmentCode,
                name: String(row['Product ID'] || row['name'] || `Dataset equipment ${identifier}`),
                equipmentType: String(row[mapping.equipmentType || 'Type'] || 'Dataset equipment'),
                manufacturer: 'Dataset-derived source',
                model: String(row['Product ID'] || 'Dataset model'),
                serialNumber: `DS-${datasetId.slice(0, 8)}-${identifier}`,
                department: 'Dataset-derived',
                location: 'Dataset import',
                operatingHours: Number(row[mapping.operatingHours || 'Tool wear [min]']) || 0,
                status: EquipmentStatus.OPERATIONAL,
                sourceDatasetId: datasetId,
                sourceDatasetName: dataset.name,
                sourceRowIndex: prediction.rowIndex,
                sourceIdentifier: identifier,
              },
            })
            summary.equipmentCreated += 1
          }

          const risk = prediction.failureRisk === null || prediction.failureRisk === undefined
            ? null
            : Math.round(prediction.failureRisk * 100)
          if (risk === null) {
            summary.errors.push({ rowIndex: prediction.rowIndex, message: 'Prediction probability unavailable.' })
            continue
          }
          const healthScore = Math.max(0, Math.min(100, Math.round(100 - risk * 0.65)))
          const status = risk >= 75 || healthScore < 40
            ? EquipmentStatus.CRITICAL
            : risk >= 50 || healthScore < 75
              ? EquipmentStatus.ATTENTION_REQUIRED
              : EquipmentStatus.OPERATIONAL
          await prisma.equipment.update({
            where: { id: equipment.id },
            data: {
              healthScore,
              failureRisk: risk,
              status,
              sourceDatasetId: equipment.sourceDatasetId || datasetId,
              sourceDatasetName: equipment.sourceDatasetName || dataset.name,
              sourceRowIndex: equipment.sourceRowIndex ?? prediction.rowIndex,
              sourceIdentifier: equipment.sourceIdentifier || identifier,
            },
          })

          const existingAssessment = await prisma.assessment.findUnique({
            where: { datasetPredictionResultId: prediction.id },
          })
          const assessment = await prisma.assessment.upsert({
            where: { datasetPredictionResultId: prediction.id },
            create: {
              equipmentId: equipment.id,
              healthScore,
              failureRisk: risk,
              operationalStatus: status,
              safetyStatus: risk >= 75 ? 'Safety Event' : risk >= 50 ? 'Review Required' : 'Normal',
              anomalyStatus: 'DATASET_DERIVED',
              maintenancePriority: risk >= 75 ? 'Urgent' : risk >= 50 ? 'Elevated' : 'Routine',
              explanation: JSON.stringify([`Dataset-derived prediction from ${dataset.name}.`]),
              modelVersionId,
              datasetPredictionResultId: prediction.id,
            },
            update: {
              equipmentId: equipment.id,
              healthScore,
              failureRisk: risk,
              operationalStatus: status,
              safetyStatus: risk >= 75 ? 'Safety Event' : risk >= 50 ? 'Review Required' : 'Normal',
              explanation: JSON.stringify([`Dataset-derived prediction from ${dataset.name}.`]),
              modelVersionId,
            },
          })
          if (existingAssessment) summary.assessmentsSkipped += 1
          else summary.assessmentsCreated += 1
          await prisma.datasetPredictionResult.update({
            where: { id: prediction.id },
            data: { equipmentId: equipment.id },
          })

          if (risk >= 50 || healthScore < 40) {
            const existingAlert = await prisma.safetyAlert.findFirst({ where: { assessmentId: assessment.id } })
            if (existingAlert) {
              summary.safetyAlertsSkipped += 1
            } else {
              await safetyService.createAlert({
                equipmentId: equipment.id,
                assessmentId: assessment.id,
                title: `Dataset-derived equipment risk (${risk}%)`,
                description: `DATASET-DERIVED PREDICTION from ${dataset.name}. Review the predicted equipment condition; this is not live telemetry.`,
                severity: risk >= 75 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
                riskScore: risk,
                source: 'DATASET_PREDICTION',
              }, userId)
              summary.safetyAlertsCreated += 1
            }
          }
        } catch (error: any) {
          summary.errors.push({ rowIndex: prediction.rowIndex, message: error?.message || 'Processing failed.' })
        }
      }
    }

    await auditService.log({
      userId,
      action: 'DATASET_OPERATIONAL_PROCESSING_COMPLETED',
      entityType: 'Dataset',
      entityId: datasetId,
      details: { modelVersionId, ...summary },
    })
    socketManager.emit('dataset:processed', { datasetId, modelVersionId, ...summary })
    return { datasetId, modelVersionId, datasetName: dataset.name, ...summary }
  },
}
