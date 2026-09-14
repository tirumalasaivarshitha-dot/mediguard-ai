import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { connectRealtime, joinEquipmentRoom, leaveEquipmentRoom, onRealtime } from '@/services/realtime'
import type { AnomalyLevel, OperationalStatus, RiskAssessment, TelemetryPoint, TelemetrySeries } from '@/types'

export function useTelemetryStream(equipmentId: string | undefined, simulate: boolean, enabled = true) {
  const [series, setSeries] = useState<TelemetrySeries | null>(null)
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveTelemetry, setLiveTelemetry] = useState(false)

  useEffect(() => {
    if (!equipmentId || !enabled) {
      setSeries(null)
      setAssessment(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setAssessment(null)
    setLiveTelemetry(false)
    let cleanupRealtime: (() => void) | undefined

    Promise.all([api.getTelemetry(equipmentId), api.getLatestAssessment(equipmentId)])
      .then(([telemetry, latestAssessment]) => {
        if (cancelled) return
        setSeries(telemetry)
        setAssessment(latestAssessment)
        setLoading(false)

        const unsubscribeTelemetry = onRealtime('telemetry:update', (payload: any) => {
          if (!payload || (payload.equipmentId && payload.equipmentId !== equipmentId)) return
          const reading = payload.reading
          if (!reading || typeof reading !== 'object') return

          const point: TelemetryPoint = {
            timestamp: reading.timestamp ? new Date(reading.timestamp).toISOString() : new Date().toISOString(),
            temperature: reading.temperature ?? 0,
            vibration: reading.vibration ?? 0,
            powerKw: reading.powerConsumption ?? 0,
            pressure: reading.pressure ?? 0,
            voltage: reading.voltage ?? 0,
            errorCount: reading.errorCount ?? 0,
            operatingHours: reading.operatingHours ?? 0,
          }
          const isSimulated = reading.dataSource === 'SIMULATED_TELEMETRY'

          setLiveTelemetry(true)
          setSeries((current) => {
            if (!current) return current
            return {
              ...current,
              points: [...current.points, point].slice(-60),
              current: point,
              lastUpdate: point.timestamp,
              simulated: isSimulated,
              source: isSimulated ? 'SIMULATED_TELEMETRY' : 'realtime',
              connectionState: 'connected',
            }
          })
        })

        const unsubscribePrediction = onRealtime('prediction:update', (payload: any) => {
          if (!payload || payload.equipmentId !== equipmentId) return
          setAssessment((current) => mergePrediction(current, payload, equipmentId))
        })

        const unsubscribeRisk = onRealtime('risk:changed', (payload: any) => {
          if (!payload || payload.equipmentId !== equipmentId) return
          setAssessment((current) => {
            if (!current) return current
            return {
              ...current,
              failureRisk: payload.failureRisk ?? current.failureRisk,
              riskLevel: mapRiskLevel(payload.riskLevel) ?? current.riskLevel,
              assessedAt: new Date().toISOString(),
            }
          })
        })

        connectRealtime()
        joinEquipmentRoom(equipmentId)

        cleanupRealtime = () => {
          unsubscribeTelemetry()
          unsubscribePrediction()
          unsubscribeRisk()
          leaveEquipmentRoom(equipmentId)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to load telemetry or latest assessment.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      cleanupRealtime?.()
    }
  }, [equipmentId, enabled])

  useEffect(() => {
    if (!equipmentId || !simulate || !enabled) return
    let cancelled = false
    api.startSimulator(equipmentId).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to start backend telemetry simulator.')
    })

    return () => {
      cancelled = true
      void api.stopSimulator(equipmentId).catch(() => undefined)
    }
  }, [equipmentId, simulate, enabled])

  return { series, assessment, liveTelemetry, loading, error }
}

function mergePrediction(current: RiskAssessment | null, payload: any, equipmentId: string): RiskAssessment {
  return {
    ...(current ?? defaultAssessment(equipmentId)),
    equipmentId,
    healthScore: payload.healthScore ?? current?.healthScore ?? 0,
    healthLabel: payload.healthLabel ?? current?.healthLabel ?? 'Good',
    failureRisk: payload.failureRisk ?? current?.failureRisk ?? 0,
    riskLevel: mapRiskLevel(payload.riskLevel) ?? current?.riskLevel ?? 'Low',
    operationalStatus: mapOperationalStatus(payload.operationalStatus) ?? current?.operationalStatus ?? 'operational',
    safetyStatus: payload.safetyStatus ?? current?.safetyStatus ?? 'Normal',
    anomalyLevel: mapAnomalyLevel(payload.anomalyStatus) ?? current?.anomalyLevel ?? 'Normal',
    maintenancePriority: payload.maintenancePriority ?? current?.maintenancePriority ?? 50,
    priorityLabel: payload.priorityLabel ?? current?.priorityLabel ?? 'Routine',
    recommendedAction: payload.recommendedAction ?? current?.recommendedAction ?? 'Continue routine monitoring.',
    anomalies: payload.anomalies ?? current?.anomalies ?? [],
    explanations: payload.explanations ?? current?.explanations ?? [],
    contributions: payload.contributions ?? current?.contributions ?? [],
    modelId: payload.modelVersion ?? current?.modelId ?? 'v1.0.0-rf-isolationforest',
    assessedAt: payload.assessedAt ?? new Date().toISOString(),
    source: 'realtime',
  }
}

function defaultAssessment(equipmentId: string): RiskAssessment {
  return {
    equipmentId,
    healthScore: 0,
    healthLabel: 'Good',
    failureRisk: 0,
    riskLevel: 'Low',
    operationalStatus: 'operational',
    safetyStatus: 'Normal',
    maintenancePriority: 50,
    priorityLabel: 'Routine',
    recommendedAction: 'Continue routine monitoring.',
    anomalyLevel: 'Normal',
    anomalies: [],
    explanations: [],
    contributions: [],
    modelId: 'v1.0.0-rf-isolationforest',
    assessedAt: new Date().toISOString(),
    source: 'realtime',
  }
}

function mapOperationalStatus(value: string | undefined): OperationalStatus | undefined {
  const values: Record<string, OperationalStatus> = {
    OPERATIONAL: 'operational',
    ATTENTION_REQUIRED: 'attention',
    DEGRADED: 'degraded',
    MAINTENANCE: 'maintenance',
    DECOMMISSIONED: 'offline',
  }
  return value ? values[value] || (value.toLowerCase() as OperationalStatus) : undefined
}

function mapRiskLevel(value: string | undefined): RiskAssessment['riskLevel'] | undefined {
  const values: Record<string, RiskAssessment['riskLevel']> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' }
  return value ? values[value] || (value as RiskAssessment['riskLevel']) : undefined
}

function mapAnomalyLevel(value: string | undefined): AnomalyLevel | undefined {
  const values: Record<string, AnomalyLevel> = { NORMAL: 'Normal', ANOMALY_DETECTED: 'Anomaly Detected', SEVERE_ANOMALY: 'Severe Anomaly' }
  return value ? values[value] || (value as AnomalyLevel) : undefined
}
