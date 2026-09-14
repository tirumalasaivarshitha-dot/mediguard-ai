import dotenv from 'dotenv'
import path from 'path'
import { z } from 'zod'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)).refine((val) => val > 0 && val < 65536, 'PORT must be between 1 and 65535'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  ML_SERVICE_URL: z.string().default('http://localhost:8000'),
  ML_SERVICE_TOKEN: z.string().min(32).optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  DATASET_MAX_UPLOAD_MB: z.string().default('25').transform((val) => parseInt(val, 10)).refine((val) => val > 0, 'DATASET_MAX_UPLOAD_MB must be positive'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform((val) => parseInt(val, 10)).refine((val) => val > 0, 'RATE_LIMIT_WINDOW_MS must be positive'),
  RATE_LIMIT_MAX: z.string().default('300').transform((val) => parseInt(val, 10)).refine((val) => val > 0, 'RATE_LIMIT_MAX must be positive'),
  AUTH_RATE_LIMIT_MAX: z.string().default('10').transform((val) => parseInt(val, 10)).refine((val) => val > 0, 'AUTH_RATE_LIMIT_MAX must be positive'),
  HISTORICAL_SAFETY_DATA_PATH: z.string().default('../storage/uploads/historical-safety'),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.format())
  throw new Error('Environment configuration validation failed.')
}

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be explicitly configured with at least 32 characters in production.')
}

if (process.env.NODE_ENV === 'production' && (!process.env.ML_SERVICE_TOKEN || process.env.ML_SERVICE_TOKEN.length < 32)) {
  throw new Error('ML_SERVICE_TOKEN must be explicitly configured with at least 32 characters in production.')
}

export const env = parsedEnv.data
