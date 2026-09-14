import http from 'http'
import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import { checkDatabaseConnection, disconnectDatabase } from './config/database'
import { socketManager } from './sockets/socketManager'
import apiRoutes, { healthRoutes } from './routes'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import rateLimit from 'express-rate-limit'

const app: Express = express()
const server = http.createServer(app)

// Initialize Socket.IO
socketManager.init(server)

// Security & Parsing Middleware
app.use(helmet())
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
// Keep mutation traffic protected by the base limit while giving authenticated
// read-heavy screens their own bounded request budget.
app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  skip: (req) => req.method === 'GET' && (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}))
app.use('/api', rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX * 2,
  skip: (req) => req.method !== 'GET' || req.path.startsWith('/auth'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}))
app.use('/api/auth', rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skip: (req) => req.method === 'GET',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}))
app.use('/api/auth', rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: Math.max(env.AUTH_RATE_LIMIT_MAX * 6, 60),
  skip: (req) => req.method !== 'GET',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}))

// Health Check Endpoint (GET /health)
app.use(healthRoutes)

// API Sub-routes (/api/*)
app.use('/api', apiRoutes)

// 404 & Centralized Error Handlers
app.use(notFoundHandler)
app.use(errorHandler)

// Server Start & Lifecycle Management
const PORT = env.PORT || 5000

server.listen(PORT, async () => {
  console.log(`[MediGuard Backend] Server running in ${env.NODE_ENV} mode on port ${PORT}`)
  console.log(`[MediGuard Backend] Health check: http://localhost:${PORT}/health`)

  const isDbConnected = await checkDatabaseConnection()
  if (isDbConnected) {
    console.log('[MediGuard Backend] Database connection: CONNECTED')
  } else {
    console.warn('[MediGuard Backend] Database connection: DISCONNECTED (Operational data APIs unavailable)')
  }
})

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`[MediGuard Backend] Received ${signal}. Initiating graceful shutdown...`)
  server.close(async () => {
    await disconnectDatabase()
    console.log('[MediGuard Backend] Shutdown complete.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

export { app, server }
