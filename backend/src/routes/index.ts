import { Router } from 'express'
import healthRoutes from './health.routes'
import authRoutes from './auth.routes'
import userRoutes from './user.routes'
import equipmentRoutes from './equipment.routes'
import telemetryRoutes from './telemetry.routes'
import assessmentRoutes from './assessment.routes'
import maintenanceRoutes from './maintenance.routes'
import safetyRoutes from './safety.routes'
import techniciansRoutes from './technicians.routes'
import notificationsRoutes from './notifications.routes'
import datasetsRoutes from './datasets.routes'
import modelsRoutes from './models.routes'
import analyticsRoutes from './analytics.routes'
import reportsRoutes from './reports.routes'
import historicalSafetyRoutes from './historicalSafety.routes'
import simulationRoutes from './simulation.routes'
import historyRoutes from './history.routes'

const router = Router()

// API Route modules
router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/equipment', equipmentRoutes)
router.use('/telemetry', telemetryRoutes)
router.use('/assessment', assessmentRoutes)
router.use('/maintenance', maintenanceRoutes)
router.use('/safety', safetyRoutes)
router.use('/technicians', techniciansRoutes)
router.use('/notifications', notificationsRoutes)
router.use('/datasets', datasetsRoutes)
router.use('/models', modelsRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/reports', reportsRoutes)
router.use('/historical-safety', historicalSafetyRoutes)
router.use('/simulation', simulationRoutes)
router.use('/history', historyRoutes)


export { healthRoutes }
export default router
