import { Router, Request, Response } from 'express'
import { authenticateToken, requireRole } from '../middleware/auth'
import { modelService } from '../services/model.service'
import { datasetPredictionService } from '../services/datasetPrediction.service'
import { historicalTrainingService } from '../services/historicalTraining.service'
import { ApiResponse, AuthenticatedRequest } from '../types'

const router = Router()

router.use(authenticateToken)

router.get('/', async (_req: Request, res: Response<ApiResponse>) => {
  try {
    const models = await modelService.listModels()
    return res.status(200).json({ success: true, data: models })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to list models' })
  }
})

router.get('/:id', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const model = await modelService.getModelById(String(req.params.id))
    if (!model) {
      return res.status(404).json({ success: false, message: 'Model version not found' })
    }
    return res.status(200).json({ success: true, data: model })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch model details' })
  }
})

router.get('/:id/compatibility', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const compatibility = await modelService.checkCompatibility(String(req.params.id))
    return res.status(200).json({ success: true, data: compatibility })
  } catch (error: any) {
    return res.status(error.message === 'MODEL_NOT_FOUND' ? 404 : 500).json({ success: false, message: error.message === 'MODEL_NOT_FOUND' ? error.message : 'Failed to check model compatibility' })
  }
})

router.post('/train', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { name, version, algorithm, datasetId, targetColumn } = req.body

    if (!name || !algorithm || !datasetId || !targetColumn) {
      return res.status(400).json({ success: false, message: 'Model name, algorithm, dataset, and target column are required' })
    }

    const newModel = await modelService.trainModel(
      {
        name,
        version: version || `v${Date.now()}`,
        algorithm,
        datasetId,
        targetColumn,
      },
      authReq.user?.id,
      req.ip,
    )

    return res.status(201).json({ success: true, message: 'Model training initiated', data: newModel })
  } catch (error: any) {
    if (error.message === 'MODEL_BELOW_REVIEW_THRESHOLD') return res.status(422).json({ success: false, message: error.message })
    if (['DATASET_AND_TARGET_REQUIRED', 'DATASET_NOT_FOUND', 'DATASET_CONTENT_NOT_AVAILABLE', 'HISTORICAL_DATASET_NOT_FOR_TELEMETRY_TRAINING'].includes(error.message) ||
      error.message === 'ML training failed' ||
      error.message.startsWith('Target column') ||
      error.message.startsWith('Dataset must') ||
      error.message.startsWith('Training failed') ||
      error.message.startsWith('Unsupported model')) {
      return res.status(422).json({ success: false, message: error.message })
    }
    return res.status(500).json({ success: false, message: 'Failed to train model' })
  }
})

// Dedicated route: historical Kaggle data is temporal safety intelligence and
// must never enter the operational telemetry training path above.
router.post('/train-historical-safety', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const result = await historicalTrainingService.train(req.body?.datasetId, authReq.user?.id, req.ip)
    return res.status(201).json({ success: true, message: result.reused ? 'Existing historical safety models returned' : 'Historical safety models trained', data: result })
  } catch (error: any) {
    const validationErrors = [
      'ACTIVE_KAGGLE_DATASET_NOT_FOUND',
      'HISTORICAL_TRAINING_REQUIRES_KAGGLE',
      'KAGGLE_DATASET_NOT_ACTIVE',
      'HISTORICAL_TRAINING_NO_DATED_QUALIFYING_EVENTS',
      'INSUFFICIENT_TEMPORAL_SAMPLES',
      'INSUFFICIENT_TEMPORAL_CLASSES',
      'HISTORICAL_TRAINING_INVALID',
    ]
    if (validationErrors.some((value) => String(error?.message || '').startsWith(value))) {
      return res.status(422).json({ success: false, message: error.message })
    }
    if (String(error?.message || '').includes('Historical ML training')) {
      return res.status(502).json({ success: false, message: error.message })
    }
    return res.status(500).json({ success: false, message: 'Historical safety training failed' })
  }
})

router.post('/:modelId/predict-dataset/:datasetId', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const result = await datasetPredictionService.predictDataset(
      String(req.params.datasetId),
      String(req.params.modelId),
    )
    return res.status(200).json({ success: true, message: 'Dataset predictions completed', data: result })
  } catch (error: any) {
    const validationErrors = [
      'DATASET_NOT_FOUND',
      'MODEL_NOT_FOUND',
      'MODEL_ARTIFACT_NOT_AVAILABLE',
      'MODEL_DATASET_MISMATCH',
      'DATASET_EMPTY',
      'MODEL_FEATURE_SCHEMA_UNAVAILABLE',
      'DATASET_FEATURES_INCOMPATIBLE',
    ]
    if (validationErrors.includes(error.message)) {
      return res.status(422).json({
        success: false,
        message: error.message === 'DATASET_FEATURES_INCOMPATIBLE'
          ? `Dataset is incompatible with the model. Missing features: ${(error.missingColumns || []).join(', ')}`
          : error.message,
      })
    }
    return res.status(500).json({ success: false, message: 'Failed to predict dataset rows' })
  }
})

router.post('/:modelId/process-dataset/:datasetId', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const result = await datasetPredictionService.processDataset(
      String(req.params.datasetId),
      String(req.params.modelId),
      authReq.user?.id,
    )
    return res.status(200).json({ success: true, message: 'Dataset predictions processed operationally', data: result })
  } catch (error: any) {
    const validationErrors = [
      'DATASET_NOT_FOUND',
      'MODEL_NOT_FOUND',
      'MODEL_DATASET_MISMATCH',
      'MODEL_ARTIFACT_NOT_AVAILABLE',
      'DATASET_TARGET_SEMANTICS_UNSUPPORTED',
      'DATASET_EQUIPMENT_IDENTIFIER_UNAVAILABLE',
    ]
    if (validationErrors.includes(error.message)) {
      return res.status(422).json({ success: false, message: error.message })
    }
    return res.status(500).json({ success: false, message: 'Failed to process dataset predictions operationally' })
  }
})

router.patch('/:id/activate', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const activated = await modelService.activateModel(String(req.params.id), authReq.user?.id, req.ip)
    return res.status(200).json({ success: true, message: 'Model activated as operational default', data: activated })
  } catch (error: any) {
    const validationErrors = ['MODEL_NOT_FOUND', 'MODEL_BELOW_REVIEW_THRESHOLD']
    return res.status(validationErrors.includes(error.message) ? 422 : 500).json({
      success: false,
      message: validationErrors.includes(error.message) ? error.message : 'Failed to activate model',
    })
  }
})

router.patch('/:id/activate-operational', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const activated = await modelService.activateOperationalModel(String(req.params.id), authReq.user?.id, req.ip)
    return res.status(200).json({ success: true, message: 'Operational assessment model activated', data: activated })
  } catch (error: any) {
    const validationErrors = ['MODEL_NOT_OPERATIONALLY_COMPATIBLE', 'MODEL_ARTIFACT_NOT_AVAILABLE', 'MODEL_FAILED']
    return res.status(validationErrors.includes(error.message) ? 422 : error.message === 'MODEL_NOT_FOUND' ? 404 : 500)
      .json({ success: false, message: validationErrors.includes(error.message) || error.message === 'MODEL_NOT_FOUND' ? error.message : 'Failed to activate operational model' })
  }
})

export default router
