import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { ApiResponse } from '../types'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      })
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation Error',
          meta: {
            issues: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        })
        return
      }
      next(error)
    }
  }
}
