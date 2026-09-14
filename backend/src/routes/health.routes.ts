import { Router, Request, Response } from 'express'
import { checkDatabaseConnection } from '../config/database'
import { env } from '../config/env'
import { ApiResponse } from '../types'

const router = Router()

async function checkMLServiceConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

router.get('/health', async (_req: Request, res: Response<ApiResponse>) => {
  const isDbConnected = await checkDatabaseConnection()
  const isMlConnected = await checkMLServiceConnection()
  const isHealthy = isDbConnected && isMlConnected

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    data: {
      service: 'MediGuard AI API',
      status: isHealthy ? 'healthy' : 'degraded',
      database: isDbConnected ? 'connected' : 'disconnected',
      mlService: isMlConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    },
  })
})

export default router
