import { prisma } from '../config/database'
import { equipmentService, UserScope } from './equipment.service'
import { socketManager } from '../sockets/socketManager'
import { auditService } from './audit.service'
import { assessmentService } from './assessment.service'

export interface TelemetryDataInput {
  equipmentId: string
  timestamp?: string | Date
  temperature?: number
  vibration?: number
  powerConsumption?: number
  pressure?: number
  voltage?: number
  operatingHours?: number
  errorCount?: number
  additionalMeasurements?: Record<string, any>
  dataSource?: string
}

export const telemetryService = {
  async createTelemetryReading(data: TelemetryDataInput, scope?: UserScope) {
    const eq = await equipmentService.getEquipmentById(data.equipmentId, scope)
    if (!eq || eq === 'FORBIDDEN') {
      throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
    }

    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date()
    const recordPayload = {
      equipmentId: data.equipmentId,
      timestamp,
      temperature: data.temperature ?? null,
      vibration: data.vibration ?? null,
      powerConsumption: data.powerConsumption ?? null,
      pressure: data.pressure ?? null,
      voltage: data.voltage ?? null,
      operatingHours: data.operatingHours ?? null,
      errorCount: data.errorCount ?? 0,
      additionalData: data.additionalMeasurements ? JSON.parse(JSON.stringify(data.additionalMeasurements)) : null,
      dataSource: data.dataSource || 'REALTIME_TELEMETRY',
    }

    let savedRecord
    try {
      savedRecord = await prisma.telemetryReading.create({
        data: {
          equipmentId: recordPayload.equipmentId,
          timestamp: recordPayload.timestamp,
          temperature: recordPayload.temperature,
          vibration: recordPayload.vibration,
          powerConsumption: recordPayload.powerConsumption,
          pressure: recordPayload.pressure,
          voltage: recordPayload.voltage,
          operatingHours: recordPayload.operatingHours,
          errorCount: recordPayload.errorCount,
          additionalData: recordPayload.additionalData,
        },
      })
    } catch (error: any) {
      console.error(`[Telemetry] PostgreSQL persistence failed for ${data.equipmentId}: ${error?.message || error}`)
      throw new Error('TELEMETRY_PERSISTENCE_FAILED')
    }

    console.log(`[Telemetry] Persisted reading ${savedRecord.id} for ${data.equipmentId} to PostgreSQL`)

    // Format socket update payload
    const socketPayload = {
      equipmentId: data.equipmentId,
      reading: {
        id: savedRecord.id,
        timestamp: savedRecord.timestamp.toISOString(),
        temperature: savedRecord.temperature,
        vibration: savedRecord.vibration,
        powerConsumption: savedRecord.powerConsumption,
        pressure: savedRecord.pressure,
        voltage: savedRecord.voltage,
        operatingHours: savedRecord.operatingHours,
        errorCount: savedRecord.errorCount,
        additionalData: savedRecord.additionalData,
        dataSource: data.dataSource || 'REALTIME_TELEMETRY',
      },
    }

    // Emit real-time updates to global socket listeners & equipment room
    socketManager.emit('telemetry:update', socketPayload)
    socketManager.emitToRoom(`equipment:${data.equipmentId}`, 'telemetry:update', socketPayload)
    console.log(`[Socket.IO] telemetry:update emitted for ${data.equipmentId}`)

    console.log(`[AI Assessment] Triggered for persisted telemetry on ${data.equipmentId}`)
    try {
      await assessmentService.runAssessment({
        equipmentId: data.equipmentId,
        source: 'telemetry',
        userId: scope?.userId,
        userScope: scope,
        manualReadings: {
          temperature: savedRecord.temperature ?? undefined,
          vibration: savedRecord.vibration ?? undefined,
          powerKw: savedRecord.powerConsumption ?? undefined,
          pressure: savedRecord.pressure ?? undefined,
          voltage: savedRecord.voltage ?? undefined,
          operatingHours: savedRecord.operatingHours ?? undefined,
          errorCount: savedRecord.errorCount ?? undefined,
        },
      })
    } catch (error: any) {
      console.error(`[AI Assessment] Failed for ${data.equipmentId}: ${error?.message || error}`)
    }

    return savedRecord
  },

  async createTelemetryBatch(readings: TelemetryDataInput[], scope?: UserScope) {
    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      throw new Error('INVALID_BATCH_DATA')
    }
    if (readings.length > 500) {
      throw new Error('BATCH_SIZE_EXCEEDED')
    }

    // Validate equipment permission for all items
    const equipmentIds = Array.from(new Set(readings.map((r) => r.equipmentId)))
    for (const eqId of equipmentIds) {
      const eq = await equipmentService.getEquipmentById(eqId, scope)
      if (!eq || eq === 'FORBIDDEN') {
        throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
      }
    }

    const recordsToInsert = readings.map((r) => ({
      equipmentId: r.equipmentId,
      timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
      temperature: r.temperature ?? null,
      vibration: r.vibration ?? null,
      powerConsumption: r.powerConsumption ?? null,
      pressure: r.pressure ?? null,
      voltage: r.voltage ?? null,
      operatingHours: r.operatingHours ?? null,
      errorCount: r.errorCount ?? 0,
      additionalData: r.additionalMeasurements ? JSON.parse(JSON.stringify(r.additionalMeasurements)) : null,
    }))

    try {
      const result = await prisma.$transaction(
        recordsToInsert.map((rec) => prisma.telemetryReading.create({ data: rec }))
      )

      // Emit latest update for each equipment
      for (const item of result) {
        const socketPayload = {
          equipmentId: item.equipmentId,
          reading: item,
        }
        socketManager.emit('telemetry:update', socketPayload)
        socketManager.emitToRoom(`equipment:${item.equipmentId}`, 'telemetry:update', socketPayload)
        console.log(`[Telemetry] Persisted batch reading ${item.id} for ${item.equipmentId} to PostgreSQL`)
        console.log(`[Socket.IO] telemetry:update emitted for ${item.equipmentId}`)

        console.log(`[AI Assessment] Triggered for persisted telemetry on ${item.equipmentId}`)
        try {
          await assessmentService.runAssessment({
            equipmentId: item.equipmentId,
            source: 'telemetry',
            userId: scope?.userId,
            userScope: scope,
            manualReadings: {
              temperature: item.temperature ?? undefined,
              vibration: item.vibration ?? undefined,
              powerKw: item.powerConsumption ?? undefined,
              pressure: item.pressure ?? undefined,
              voltage: item.voltage ?? undefined,
              operatingHours: item.operatingHours ?? undefined,
              errorCount: item.errorCount ?? undefined,
            },
          })
        } catch (error: any) {
          console.error(`[AI Assessment] Failed for ${item.equipmentId}: ${error?.message || error}`)
        }
      }

      await auditService.log({
        userId: scope?.userId,
        action: 'TELEMETRY_BATCH_INGESTED',
        entityType: 'Equipment',
        entityId: equipmentIds.join(','),
        details: { count: result.length },
      })

      return { count: result.length }
    } catch (error: any) {
      console.error(`[Telemetry] PostgreSQL batch persistence failed: ${error?.message || error}`)
      throw new Error('TELEMETRY_PERSISTENCE_FAILED')
    }
  },

  async getLatestTelemetry(equipmentId: string, scope?: UserScope) {
    const eq = await equipmentService.getEquipmentById(equipmentId, scope)
    if (!eq || eq === 'FORBIDDEN') {
      throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
    }

    try {
      const item = await prisma.telemetryReading.findFirst({
        where: { equipmentId },
        orderBy: { timestamp: 'desc' },
      })
      return item
    } catch (error: any) {
      console.error(`[Telemetry] PostgreSQL read failed for ${equipmentId}: ${error?.message || error}`)
      throw new Error('TELEMETRY_DATABASE_UNAVAILABLE')
    }
  },

  async getTelemetryHistory(
    equipmentId: string,
    scope?: UserScope,
    params?: { start?: string; end?: string; page?: number; limit?: number }
  ) {
    const eq = await equipmentService.getEquipmentById(equipmentId, scope)
    if (!eq || eq === 'FORBIDDEN') {
      throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
    }

    const page = params?.page || 1
    const limit = Math.min(params?.limit || 100, 500)
    const skip = (page - 1) * limit

    const where: any = { equipmentId }
    if (params?.start || params?.end) {
      where.timestamp = {
        ...(params?.start ? { gte: new Date(params.start) } : {}),
        ...(params?.end ? { lte: new Date(params.end) } : {}),
      }
    }

    try {
      const [total, records] = await Promise.all([
        prisma.telemetryReading.count({ where }),
        prisma.telemetryReading.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take: limit,
        }),
      ])

      return {
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      }
    } catch (error: any) {
      console.error(`[Telemetry] PostgreSQL history read failed for ${equipmentId}: ${error?.message || error}`)
      throw new Error('TELEMETRY_DATABASE_UNAVAILABLE')
    }
  },

  async getTelemetryStats(
    equipmentId: string,
    scope?: UserScope,
    params?: { start?: string; end?: string }
  ) {
    const eq = await equipmentService.getEquipmentById(equipmentId, scope)
    if (!eq || eq === 'FORBIDDEN') {
      throw new Error(eq === 'FORBIDDEN' ? 'FORBIDDEN' : 'EQUIPMENT_NOT_FOUND')
    }

    const history = await this.getTelemetryHistory(equipmentId, scope, {
      start: params?.start,
      end: params?.end,
      page: 1,
      limit: 500,
    })

    const records = history.records || []
    if (records.length === 0) {
      return {
        equipmentId,
        readingCount: 0,
        stats: null,
      }
    }

    const calc = (key: string) => {
      const vals = records.map((r: any) => r[key]).filter((v: any) => typeof v === 'number' && !isNaN(v))
      if (vals.length === 0) return null
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      const avg = Number((vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(2))
      return { min, max, avg }
    }

    return {
      equipmentId,
      readingCount: records.length,
      stats: {
        temperature: calc('temperature'),
        vibration: calc('vibration'),
        powerConsumption: calc('powerConsumption'),
        pressure: calc('pressure'),
        voltage: calc('voltage'),
        operatingHours: records[0]?.operatingHours ?? 0,
        errorCountTotal: records.reduce((acc: number, r: any) => acc + (r.errorCount || 0), 0),
      },
    }
  },
}
