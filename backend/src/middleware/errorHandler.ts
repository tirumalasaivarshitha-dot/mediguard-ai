import { Request, Response, NextFunction } from 'express'
import { env } from '../config/env'
import { ApiResponse } from '../types'

export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500
  const message = env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal Server Error')

  if (env.NODE_ENV === 'development') {
    console.error(`[Error] ${statusCode} - ${message}`, err.stack)
  }

  res.status(statusCode).json({
    success: false,
    message,
  })
}

export function notFoundHandler(_req: Request, res: Response<ApiResponse>): void {
  res.status(404).json({
    success: false,
    message: 'Requested API endpoint not found',
  })
}
