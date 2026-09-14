import { Router, Request, Response } from 'express'
import { authenticateToken } from '../middleware/auth'
import { reportService } from '../services/report.service'
import { ApiResponse, AuthenticatedRequest } from '../types'

const router = Router()

router.use(authenticateToken)

router.get('/', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const authReq = req as AuthenticatedRequest
    let department = req.query.department as string | undefined

    const category = (req.query.category as any) || 'EQUIPMENT_HEALTH'
    const reportData = await reportService.generateReport(
      {
        category,
        department,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      },
      authReq.user?.id,
      req.ip,
    )

    return res.status(200).json({ success: true, data: reportData })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to generate report' })
  }
})

router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    let department = req.query.department as string | undefined

    const category = (req.query.category as any) || 'EQUIPMENT_HEALTH'
    const csvContent = await reportService.generateCSV(
      {
        category,
        department,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      },
      authReq.user?.id,
      req.ip,
    )

    const filename = `mediguard_${category.toLowerCase()}_report_${Date.now()}.csv`

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.status(200).send(csvContent)
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to export CSV report' })
  }
})

router.get('/export/pdf', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    let department = req.query.department as string | undefined

    const category = (req.query.category as any) || 'EQUIPMENT_HEALTH'
    const reportData = await reportService.generateReport(
      {
        category,
        department,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      },
      authReq.user?.id,
      req.ip,
    )

    const recordsHtml = (reportData.records || [])
      .map(
        (r: any) =>
          `<tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${r.id || r.equipmentCode || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${r.name || r.title || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${r.equipmentType || r.type || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${r.department || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${r.status || r.operationalStatus || '-'}</td>
          </tr>`,
      )
      .join('')

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>MediGuard AI Report - ${category}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
          h1 { color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
          .meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #f1f5f9; padding: 10px; border: 1px solid #cbd5e1; text-align: left; }
          .disclaimer { font-size: 11px; color: #94a3b8; margin-top: 30px; padding: 10px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <h1>MediGuard AI — ${category.replace(/_/g, ' ')} Report</h1>
        <div class="meta">
          <p><strong>Facility:</strong> ${reportData.header.facility}</p>
          <p><strong>Generated At:</strong> ${reportData.header.generatedAt}</p>
          <p><strong>Department Scope:</strong> ${department || 'All Departments'}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name / Title</th>
              <th>Type</th>
              <th>Department</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${recordsHtml || '<tr><td colspan="5">No records found.</td></tr>'}
          </tbody>
        </table>
        <div class="disclaimer">
          <p>${reportData.header.disclaimer}</p>
          <p>AI-GENERATED PREDICTION DISCLAIMER: DEMO MODEL — NOT CLINICALLY VALIDATED. Decision support tool requiring qualified personnel review.</p>
        </div>
      </body>
      </html>
    `

    res.setHeader('Content-Type', 'text/html')
    return res.status(200).send(htmlContent)
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to export PDF report' })
  }
})

export default router
