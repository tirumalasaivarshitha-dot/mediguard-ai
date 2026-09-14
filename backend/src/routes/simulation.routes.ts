import { Router, Request, Response } from 'express'
import { ApiResponse } from '../types'

const router = Router()

router.post('/what-if', (_req: Request, res: Response<ApiResponse>) => {
  res.status(200).json({
    success: true,
    message: 'Simulation what-if endpoint placeholder available.',
  })
})

export default router
