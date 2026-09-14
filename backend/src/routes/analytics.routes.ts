import { Router, Request, Response } from 'express'
import { authenticateToken } from '../middleware/auth'
import { analyticsService } from '../services/analytics.service'
import { ApiResponse, AuthenticatedRequest } from '../types'

const router = Router()

router.use(authenticateToken)

function getFilterParams(req: Request) {
  const timeframe = req.query.timeframe as string | undefined
  const startDate = req.query.startDate as string | undefined
  const endDate = req.query.endDate as string | undefined
  return { timeframe, startDate, endDate }
}

router.get('/overview', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req), scopeRole: authReq.user?.role, userId: authReq.user?.id }
    const data = await analyticsService.getOverview(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to calculate analytics overview' })
  }
})

router.get('/equipment-health', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req) }
    const data = await analyticsService.getEquipmentHealthAnalytics(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch equipment health analytics' })
  }
})

router.get('/risk', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req) }
    const data = await analyticsService.getFailureRiskAnalytics(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch failure risk analytics' })
  }
})

router.get('/maintenance', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req) }
    const data = await analyticsService.getMaintenanceAnalytics(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch maintenance analytics' })
  }
})

router.get('/safety', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req) }
    const data = await analyticsService.getSafetyAnalytics(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch safety analytics' })
  }
})

router.get('/technicians', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req) }
    const data = await analyticsService.getTechnicianAnalytics(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch technician analytics' })
  }
})

router.get('/cost', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req) }
    const data = await analyticsService.getCostAnalytics(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch cost analytics' })
  }
})

router.get('/downtime', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let dept = req.query.department as string | undefined
    const filters = { department: dept, ...getFilterParams(req) }
    const data = await analyticsService.getDowntimeAnalytics(filters)
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch downtime analytics' })
  }
})

export default router
