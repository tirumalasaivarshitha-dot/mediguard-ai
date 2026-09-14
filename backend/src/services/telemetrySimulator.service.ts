import { telemetryService } from './telemetry.service'
import { auditService } from './audit.service'

interface ActiveSimulation {
  equipmentId: string
  intervalId: NodeJS.Timeout
  stage: number
  startedAt: Date
  readingsCount: number
}

const activeSimulations: Map<string, ActiveSimulation> = new Map()

// Base parameters for progressive 7-stage equipment scenarios
const BASE_STAGE_CONFIGS: Record<number, { tempAdd: number; vibAdd: number; powerAdd: number; errAdd: number }> = {
  1: { tempAdd: 0.0, vibAdd: 0.0, powerAdd: 0.0, errAdd: 0 },   // Normal
  2: { tempAdd: 2.5, vibAdd: 0.2, powerAdd: 0.5, errAdd: 0 },   // Minor thermal fluctuation
  3: { tempAdd: 5.0, vibAdd: 0.6, powerAdd: 1.2, errAdd: 1 },   // Vibration & power ripple
  4: { tempAdd: 8.5, vibAdd: 1.2, powerAdd: 2.0, errAdd: 2 },   // Elevated temperature & errors
  5: { tempAdd: 14.0, vibAdd: 2.5, powerAdd: 3.5, errAdd: 4 },  // High abnormality
  6: { tempAdd: 4.0, vibAdd: 0.5, powerAdd: 0.5, errAdd: 0 },   // Under maintenance
  7: { tempAdd: 0.5, vibAdd: 0.1, powerAdd: 0.1, errAdd: 0 },   // Recovery to normal
}

export const telemetrySimulatorService = {
  async startSimulation(equipmentId: string, intervalMs = 2000, userId?: string) {
    if (activeSimulations.has(equipmentId)) {
      return { message: 'Simulation already active for this equipment', equipmentId }
    }

    let stage = 1
    let readingCounter = 0
    let tempBase = 42.0
    let vibBase = 1.2
    let powerBase = 14.0
    let opHours = 8420.0

    const intervalId = setInterval(async () => {
      readingCounter++
      // Advance stage every 5 readings
      if (readingCounter % 5 === 0) {
        stage = (stage % 7) + 1
      }

      const cfg = BASE_STAGE_CONFIGS[stage] || BASE_STAGE_CONFIGS[1]
      opHours += 0.1

      const currentTemp = Number((tempBase + cfg.tempAdd + (Math.random() - 0.45) * 0.5).toFixed(1))
      const currentVib = Number((Math.max(0.1, vibBase + cfg.vibAdd + (Math.random() - 0.45) * 0.1)).toFixed(2))
      const currentPower = Number((Math.max(0.1, powerBase + cfg.powerAdd + (Math.random() - 0.5) * 0.2)).toFixed(2))
      const currentErr = cfg.errAdd + (Math.random() > 0.85 ? 1 : 0)

      try {
        await telemetryService.createTelemetryReading({
          equipmentId,
          timestamp: new Date().toISOString(),
          temperature: currentTemp,
          vibration: currentVib,
          powerConsumption: currentPower,
          pressure: 4.5,
          voltage: 400,
          operatingHours: Number(opHours.toFixed(1)),
          errorCount: currentErr,
          dataSource: 'SIMULATED_TELEMETRY',
          additionalMeasurements: {
            simulationStage: stage,
            simulationStageName: this.getStageName(stage),
          },
        })
        console.log(`[TelemetrySimulator] Generated reading for ${equipmentId} at ${intervalMs}ms interval`)

        const activeSim = activeSimulations.get(equipmentId)
        if (activeSim) {
          activeSim.stage = stage
          activeSim.readingsCount++
        }
      } catch (err: any) {
        console.warn(`[Simulator] Failed to generate reading for ${equipmentId}: ${err?.message}`)
      }
    }, Math.max(1000, intervalMs))

    activeSimulations.set(equipmentId, {
      equipmentId,
      intervalId,
      stage: 1,
      startedAt: new Date(),
      readingsCount: 0,
    })

    await auditService.log({
      userId,
      action: 'SIMULATOR_STARTED',
      entityType: 'Equipment',
      entityId: equipmentId,
      details: { intervalMs },
    })

    return {
      status: 'active',
      equipmentId,
      message: 'Telemetry simulator started successfully (SIMULATED TELEMETRY)',
    }
  },

  async stopSimulation(equipmentId: string, userId?: string) {
    const active = activeSimulations.get(equipmentId)
    if (!active) {
      return { message: 'No active simulation found for this equipment', equipmentId }
    }

    clearInterval(active.intervalId)
    activeSimulations.delete(equipmentId)

    await auditService.log({
      userId,
      action: 'SIMULATOR_STOPPED',
      entityType: 'Equipment',
      entityId: equipmentId,
      details: { readingsGenerated: active.readingsCount },
    })

    return {
      status: 'stopped',
      equipmentId,
      message: 'Telemetry simulator stopped successfully',
    }
  },

  getSimulationStatus(equipmentId?: string) {
    if (equipmentId) {
      const active = activeSimulations.get(equipmentId)
      return {
        isActive: !!active,
        equipmentId,
        stage: active ? active.stage : 0,
        stageName: active ? this.getStageName(active.stage) : 'Inactive',
        readingsCount: active ? active.readingsCount : 0,
        startedAt: active ? active.startedAt.toISOString() : null,
      }
    }

    const activeList: any[] = []
    activeSimulations.forEach((val, key) => {
      activeList.push({
        equipmentId: key,
        stage: val.stage,
        stageName: this.getStageName(val.stage),
        readingsCount: val.readingsCount,
        startedAt: val.startedAt.toISOString(),
      })
    })

    return {
      activeCount: activeSimulations.size,
      simulations: activeList,
    }
  },

  getStageName(stage: number): string {
    const names: Record<number, string> = {
      1: 'Stage 1 — Normal Operation',
      2: 'Stage 2 — Minor Thermal Fluctuation',
      3: 'Stage 3 — Vibration & Power Ripple',
      4: 'Stage 4 — Temperature Elevation & Errors',
      5: 'Stage 5 — High Abnormality',
      6: 'Stage 6 — Maintenance In-Progress',
      7: 'Stage 7 — Serviced & Recovered',
    }
    return names[stage] || 'Stage 1 — Normal Operation'
  },
}
