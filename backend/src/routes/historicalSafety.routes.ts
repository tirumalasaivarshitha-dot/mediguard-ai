import { Router, Request, Response } from 'express'
import { authenticateToken, requireRole } from '../middleware/auth'
import { historicalSafetyService } from '../services/historicalSafety.service'
import { historicalTrainingService } from '../services/historicalTraining.service'
import { ApiResponse } from '../types'

const router = Router()

router.use(authenticateToken)

async function list(req: Request, res: Response<ApiResponse>) {
  try {
    const { search, manufacturer, recallClass, country, year, page, limit } = req.query
    const result = await historicalSafetyService.listRecords({
      search: search as string,
      manufacturer: manufacturer as string,
      recallClass: recallClass as string,
      country: country as string,
      year: year ? Number(year) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
    return res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    if (error?.code === 'P2021' || error?.message === 'DATABASE_UNAVAILABLE') return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' })
    return res.status(500).json({ success: false, message: 'Failed to fetch historical safety records' })
  }
}

router.get('/', list)
router.get('/search', list)

router.get('/metrics', async (_req: Request, res: Response<ApiResponse>) => {
  try {
    const metrics = await historicalSafetyService.getSummaryMetrics()
    return res.status(200).json({ success: true, data: metrics })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch historical safety metrics' })
  }
})

router.get('/overview', async (_req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.getSummaryMetrics(_req.query as any) }) }
  catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})

router.get('/analytics', async (_req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.getSummaryMetrics() }) }
  catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})

router.get('/event-trends', async (_req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.getEventTrends(_req.query as any) }) } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})
router.get('/event-types', async (_req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.getEventTypes(_req.query as any) }) } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})
router.get('/devices', async (req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.listDevices(req.query) }) } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})
router.get('/manufacturers', async (req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.listManufacturers(req.query) }) } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})
router.get('/countries', async (_req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.listCountries() }) } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})
router.get('/events', async (req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.listEvents(req.query as any) }) }
  catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})
router.get('/devices/:id', async (req: Request, res: Response<ApiResponse>) => {
  const item = await historicalSafetyService.getDevice(String(req.params.id)); return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Device not found' })
})
router.get('/manufacturers/:id', async (req: Request, res: Response<ApiResponse>) => {
  const item = await historicalSafetyService.getManufacturer(String(req.params.id)); return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Manufacturer not found' })
})
router.get('/devices/:id/events', async (req: Request, res: Response<ApiResponse>) => {
  try { return res.json({ success: true, data: await historicalSafetyService.listEvents({ ...req.query, deviceId: String(req.params.id) }) }) } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})
router.get('/manufacturers/:id/events', async (req: Request, res: Response<ApiResponse>) => {
  try { return res.json({ success: true, data: await historicalSafetyService.listEvents({ ...req.query, manufacturerId: String(req.params.id) }) }) } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})

router.get('/events/:id', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const event = await historicalSafetyService.getEvent(String(req.params.id))
    if (!event) return res.status(404).json({ success: false, message: 'Historical safety event not found' })
    return res.status(200).json({ success: true, data: event })
  } catch { return res.status(503).json({ success: false, message: 'Historical safety data is unavailable' }) }
})

router.post('/train', requireRole('ADMIN', 'BIOMEDICAL_ENGINEER'), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const result = await historicalTrainingService.train(req.body?.datasetId, (req as any).user?.id, req.ip)
    return res.status(201).json({ success: true, message: result.reused ? 'Existing historical safety models returned' : 'Historical safety models trained', data: result })
  } catch (error: any) {
    if (String(error?.message || '').startsWith('INSUFFICIENT_') || String(error?.message || '').startsWith('HISTORICAL_TRAINING_INVALID') || [
      'ACTIVE_KAGGLE_DATASET_NOT_FOUND',
      'HISTORICAL_TRAINING_REQUIRES_KAGGLE',
      'KAGGLE_DATASET_NOT_ACTIVE',
      'HISTORICAL_TRAINING_NO_DATED_QUALIFYING_EVENTS',
    ].includes(error?.message)) {
      return res.status(422).json({ success: false, message: error.message })
    }
    return res.status(500).json({ success: false, message: 'Historical safety training failed' })
  }
})

router.post('/ingest', requireRole('ADMIN'), async (req: Request, res: Response<ApiResponse>) => {
  try { return res.status(200).json({ success: true, data: await historicalSafetyService.ingestCsv(req.body?.path) }) }
  catch { return res.status(400).json({ success: false, message: 'Historical safety CSV ingestion failed' }) }
})

export default router
