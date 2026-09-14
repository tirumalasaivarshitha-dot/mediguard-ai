import { Router, Request, Response } from 'express'
import { authenticateToken, requireRole } from '../middleware/auth'
import { datasetService } from '../services/dataset.service'
import { modelService } from '../services/model.service'
import { assessmentService } from '../services/assessment.service'
import { getKaggleFileRole, ParsedKaggleFile } from '../services/dataset.service'
import { historicalSafetyService } from '../services/historicalSafety.service'
import { ApiResponse, AuthenticatedRequest } from '../types'
import multer from 'multer'
import path from 'path'
import { parse } from 'csv-parse/sync'
import XLSX from 'xlsx'
import { env } from '../config/env'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.DATASET_MAX_UPLOAD_MB * 1024 * 1024 },
})
const uploadDataset = (req: Request, res: Response, next: () => void) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 3 },
  ])(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: `Dataset exceeds the ${env.DATASET_MAX_UPLOAD_MB} MB upload limit.` })
    }
    if (error) return res.status(400).json({ success: false, message: 'Unable to receive the uploaded file.' })
    next()
  })
}

router.use(authenticateToken, requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'))

router.get('/', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { type, status, search } = req.query
    const datasets = await datasetService.listDatasets({
      type: type as any,
      status: status as any,
      search: search as string,
    })
    return res.status(200).json({ success: true, data: datasets })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to list datasets' })
  }
})

router.get('/:id', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const dataset = await datasetService.getDatasetById(String(req.params.id))
    if (!dataset) {
      return res.status(404).json({ success: false, message: 'Dataset not found' })
    }
    return res.status(200).json({ success: true, data: dataset })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch dataset details' })
  }
})

router.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    await datasetService.deleteDataset(String(req.params.id), authReq.user?.id, req.ip)
    return res.status(200).json({ success: true, message: 'Dataset deleted' })
  } catch (error: any) {
    const statusByError: Record<string, number> = {
      DATASET_NOT_FOUND: 404,
      ACTIVE_DATASET_MUST_BE_DEACTIVATED: 409,
      DATASET_HAS_DERIVED_EQUIPMENT: 409,
      DATASET_HAS_PREDICTION_RESULTS: 409,
      DATASET_HAS_ACTIVE_MODEL: 409,
      DATASET_HAS_MODELS: 409,
      DATASET_HAS_OPERATIONAL_DEPENDENCIES: 409,
    }
    const code = String(error?.message || '')
    const messages: Record<string, string> = {
      DATASET_NOT_FOUND: 'Dataset not found.',
      ACTIVE_DATASET_MUST_BE_DEACTIVATED: 'The active dataset cannot be deleted. Activate another dataset first.',
      DATASET_HAS_DERIVED_EQUIPMENT: 'This dataset has derived equipment records and cannot be deleted safely.',
      DATASET_HAS_PREDICTION_RESULTS: 'This dataset has prediction results and cannot be deleted safely.',
      DATASET_HAS_ACTIVE_MODEL: 'This dataset is linked to an active model and cannot be deleted.',
      DATASET_HAS_MODELS: 'This dataset is linked to trained models and cannot be deleted safely.',
      DATASET_HAS_OPERATIONAL_DEPENDENCIES: 'This dataset has operational assessments, alerts, or work orders and cannot be deleted safely.',
    }
    return res.status(statusByError[code] || 500).json({
      success: false,
      message: messages[code] || 'Failed to delete dataset',
    })
  }
})

router.post('/', requireRole('ADMIN'), uploadDataset, async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const uploaded = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const files = [...(uploaded?.file || []), ...(uploaded?.files || [])]
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'A CSV file is required.' })
    }
    const originalName = path.basename(files[0].originalname).replace(/[^\w.-]/g, '_')
    const extension = path.extname(originalName).toLowerCase()
    const allowedMimeTypes = new Set([
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ])
    const mimeValid = allowedMimeTypes.has(files[0].mimetype) &&
      (extension !== '.csv' || ['text/csv', 'application/csv', 'application/octet-stream'].includes(files[0].mimetype)) &&
      (extension === '.csv' || ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'].includes(files[0].mimetype))
    if (!['.csv', '.xlsx', '.xls'].includes(extension) || !mimeValid) {
      return res.status(415).json({ success: false, message: 'Only CSV and Excel files with a valid file type are supported.' })
    }

    const parsedFiles: ParsedKaggleFile[] = []
    let rows: Record<string, unknown>[] = []
    let columns: string[] = []
    try {
      for (const file of files) {
        const safeName = path.basename(file.originalname).replace(/[^\w.-]/g, '_')
        const fileExtension = path.extname(safeName).toLowerCase()
        let parsedRows: Record<string, unknown>[]
        let parsedColumns: string[]
        if (fileExtension === '.csv') {
          parsedRows = parse(file.buffer.toString('utf8'), {
            columns: true,
            skip_empty_lines: true,
            bom: true,
            relax_column_count: false,
            trim: true,
          }) as Record<string, unknown>[]
          parsedColumns = parsedRows.length ? Object.keys(parsedRows[0]) : []
        } else if (files.length === 1 && (fileExtension === '.xlsx' || fileExtension === '.xls')) {
          const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true, dense: true })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          if (!sheet) throw new Error('Excel workbook contains no worksheets.')
          parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true })
          parsedColumns = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })[0] as unknown[] || []).map(String)
        } else {
          throw new Error('Kaggle multipart uploads must contain CSV files.')
        }
        const role = getKaggleFileRole(safeName)
        if (files.length === 3 && role) {
          parsedFiles.push({ fileName: safeName, fileType: file.mimetype, fileSize: file.size, rows: parsedRows, columns: parsedColumns, role })
        } else if (files.length === 1) {
          rows = parsedRows
          columns = parsedColumns
        }
      }
    } catch {
      return res.status(400).json({ success: false, message: 'Unable to parse uploaded CSV files. Check that each file is valid and has consistent columns.' })
    }

    const isKaggle = files.length === 3 && parsedFiles.length === 3 && parsedFiles.every((file) => file.role)
    const profile = isKaggle
      ? datasetService.profileKaggleDataset(parsedFiles)
      : datasetService.profileParsedDataset({
        fileName: originalName,
        fileType: files[0].mimetype,
        fileSize: files[0].size,
        rows: rows || [],
        columns: columns || [],
      })
    const { name, description, datasetType } = req.body
    if (profile.errors.length) {
      return res.status(422).json({ success: false, message: profile.errors.join(' '), data: profile })
    }
    if (isKaggle && datasetType && datasetType !== 'HISTORICAL_SAFETY') {
      return res.status(422).json({ success: false, message: 'The three-file Kaggle historical dataset must use datasetType HISTORICAL_SAFETY.' })
    }
    if (isKaggle) {
      const relationshipValidation = datasetService.profileKaggleDataset(parsedFiles)
      if (relationshipValidation.errors.length) {
        return res.status(422).json({ success: false, message: relationshipValidation.errors.join(' '), data: relationshipValidation })
      }
    }
    const provenance = isKaggle ? (profile as DatasetProfileResultWithProvenance).provenance : undefined
    const storedRows = isKaggle
      ? parsedFiles.flatMap((file) => file.rows.map((row) => ({ __sourceFile: file.fileName, __sourceRole: file.role, ...row })))
      : rows || []
    const created = await datasetService.createDataset(
      {
        name: name || originalName,
        description,
        source: isKaggle ? 'KAGGLE' : 'USER_UPLOADED',
        fileName: isKaggle ? parsedFiles.map((file) => file.fileName).join(',') : originalName,
        fileType: isKaggle ? 'multipart/csv' : files[0].mimetype,
        fileSize: files.reduce((sum, file) => sum + file.size, 0),
        rowCount: profile.rowCount,
        columnCount: profile.columnCount,
        datasetType: isKaggle ? 'HISTORICAL_SAFETY' : datasetType,
        uploadedById: authReq.user?.id,
        provenance,
      },
      req.ip,
    )

    const dataset = await datasetService.storeProfile(created.id, profile)
    await datasetService.storeParsedRows(created.id, storedRows)
    if (isKaggle) {
      const synchronization = await historicalSafetyService.ingestKaggleFiles(parsedFiles)
      await datasetService.storeProfile(created.id, {
        ...profile,
        provenance: {
          ...((profile as DatasetProfileResultWithProvenance).provenance as Record<string, unknown>),
          synchronization,
        },
      })
      const historicalDataset = await datasetService.getDatasetById(created.id)
      return res.status(201).json({ success: true, message: 'Kaggle historical dataset validated and synchronized for historical safety analysis.', data: historicalDataset })
    }
    return res.status(201).json({ success: true, message: 'Dataset created successfully', data: dataset })
  } catch (error: any) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: `Dataset exceeds the ${env.DATASET_MAX_UPLOAD_MB} MB upload limit.` })
    }
    return res.status(500).json({ success: false, message: 'Failed to create dataset' })
  }
})

type DatasetProfileResultWithProvenance = { provenance?: unknown }

router.get('/:id/profile', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const profile = await datasetService.profileDataset(String(req.params.id))
    return res.status(200).json({ success: true, data: profile })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to profile dataset' })
  }
})

router.patch('/:id/activate', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const dataset = await datasetService.activateDataset(String(req.params.id), authReq.user?.id, req.ip)
    return res.status(200).json({ success: true, message: 'Dataset activated as the operational equipment source.', data: dataset })
  } catch (error: any) {
    if (error?.message === 'DATASET_NOT_FOUND') return res.status(404).json({ success: false, message: 'Dataset not found' })
    if (error?.message === 'HISTORICAL_DATASET_NOT_OPERATIONAL') return res.status(422).json({ success: false, message: 'Historical safety datasets cannot be activated as operational datasets.' })
    if (error?.message === 'DATASET_NOT_OPERATIONALLY_ELIGIBLE') return res.status(422).json({ success: false, message: 'This dataset is not eligible for operational use. Resolve its validation errors before activation.' })
    return res.status(500).json({ success: false, message: 'Failed to activate dataset' })
  }
})

router.get('/:id/validate', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const validation = await datasetService.validateDataset(String(req.params.id))
    await datasetService.storeProfile(String(req.params.id), {
      ...(await datasetService.profileDataset(String(req.params.id))),
      validationStatus: validation.status,
      warnings: validation.warnings,
      errors: validation.errors,
    })
    return res.status(200).json({ success: true, data: validation })
  } catch (error: any) {
    if (error?.message === 'DATASET_NOT_FOUND') return res.status(404).json({ success: false, message: 'Dataset not found' })
    return res.status(500).json({ success: false, message: 'Failed to validate dataset' })
  }
})

router.get('/:id/capabilities', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const profile = await datasetService.profileDataset(String(req.params.id))
    return res.status(200).json({
      success: true,
      data: {
        compatibility: profile.compatibility,
        capabilities: profile.capabilities,
        detectedMapping: profile.detectedMapping,
        warnings: profile.warnings,
        errors: profile.errors,
      },
    })
  } catch (error: any) {
    if (error?.message === 'DATASET_NOT_FOUND') return res.status(404).json({ success: false, message: 'Dataset not found' })
    return res.status(500).json({ success: false, message: 'Failed to assess dataset capabilities' })
  }
})

router.get('/:id/ai-capabilities', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const result = await modelService.assessDatasetCapabilities(String(req.params.id))
    return res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    if (error?.message === 'DATASET_NOT_FOUND') return res.status(404).json({ success: false, message: 'Dataset not found' })
    return res.status(500).json({ success: false, message: 'Failed to assess AI capabilities' })
  }
})

router.post('/:id/assess', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const rowIndex = req.body?.rowIndex === undefined ? 0 : Number(req.body.rowIndex)
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      return res.status(400).json({ success: false, message: 'rowIndex must be a non-negative integer.' })
    }
    const result = await assessmentService.runDatasetAssessment({
      datasetId: String(req.params.id),
      rowIndex,
      equipmentId: typeof req.body?.equipmentId === 'string' ? req.body.equipmentId : undefined,
      userScope: req.user ? {
        userId: req.user.id,
        role: req.user.role,
        department: req.user.department,
      } : undefined,
    })
    return res.status(200).json({ success: true, message: 'Dataset-aware AI assessment completed.', data: result })
  } catch (error: any) {
    if (error?.message === 'DATASET_NOT_FOUND') return res.status(404).json({ success: false, message: 'Dataset not found' })
    if (error?.message === 'DATASET_ROW_NOT_FOUND') return res.status(404).json({ success: false, message: 'Dataset row not found' })
    if (error?.message === 'HISTORICAL_DEVICE_REQUIRED') return res.status(422).json({ success: false, message: 'A provenance-linked historical device is required for historical safety assessment.' })
    if (error?.message === 'DATASET_NOT_ACTIVE') return res.status(422).json({ success: false, message: 'This dataset is not the active operational dataset.' })
    if (error?.message === 'MODEL_NOT_FOUND') return res.status(422).json({ success: false, message: 'No compatible operational model is available for this dataset.' })
    if (error?.message === 'MODEL_ARTIFACT_NOT_AVAILABLE') return res.status(422).json({ success: false, message: 'The selected operational model artifact is not available.' })
    return res.status(500).json({ success: false, message: error?.message || 'Dataset-aware assessment failed' })
  }
})

router.post('/:id/map', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { mapping, targetColumn } = req.body

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({ success: false, message: 'Mapping object is required' })
    }

    const updated = await datasetService.mapColumns(String(req.params.id), mapping, targetColumn, authReq.user?.id, req.ip)
    return res.status(200).json({ success: true, message: 'Dataset column mapping updated', data: updated })
  } catch (error: any) {
    if (error?.message === 'DATASET_NOT_FOUND') return res.status(404).json({ success: false, message: 'Dataset not found' })
    if (error?.message === 'INVALID_COLUMN_MAPPING') return res.status(422).json({ success: false, message: 'Mapping contains a source column that is not present in the uploaded dataset.' })
    return res.status(500).json({ success: false, message: 'Failed to update dataset mapping' })
  }
})

export default router
