import { profileFor, deviation } from '@/config/equipmentProfiles'
import { healthInterpretation, priorityInterpretation, riskInterpretation } from '@/utils/format'
import type {
  AnomalyFinding,
  AnomalyLevel,
  Criticality,
  FeatureContribution,
  ManualAssessmentInput,
  OperationalStatus,
  RiskAssessment,
  SafetyStatus,
  TelemetryPoint,
} from '@/types'

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n))
}

function criticalityWeight(c: Criticality) {
  switch (c) {
    case 'Life-supporting':
      return 1.35
    case 'High':
      return 1.2
    case 'Medium':
      return 1
    default:
      return 0.85
  }
}

function overdueDays(lastMaintenanceDaysAgo: number) {
  return Math.max(0, lastMaintenanceDaysAgo - 90)
}

export function assessFromReadings(input: ManualAssessmentInput & {
  criticality?: Criticality
  pressure?: number
  modelId?: string
  source?: RiskAssessment['source']
}): RiskAssessment {
  const profile = profileFor(input.equipmentType)
  const tempDev = deviation(input.temperature, profile.temperature)
  const vibDev = deviation(input.vibration, profile.vibration)
  const powerDev = deviation(input.powerKw, profile.powerKw)
  const pressureDev = input.pressure != null && profile.pressure ? deviation(input.pressure, profile.pressure) : 0
  const errorPenalty = Math.min(input.errorCount * 3.5, 28)
  const hoursPenalty = Math.min(input.operatingHours / 900, 12)
  const maintPenalty = Math.min(input.lastMaintenanceDaysAgo / 8, 18)

  const stress = tempDev * 40 + vibDev * 45 + powerDev * 25 + pressureDev * 35 + errorPenalty + hoursPenalty + maintPenalty
  const healthScore = Math.round(clamp(100 - stress))
  const health = healthInterpretation(healthScore)

  const rawRisk = stress * 0.9 + (input.errorCount > 5 ? 8 : 0)
  const failureRisk = Math.round(clamp(rawRisk))
  const risk = riskInterpretation(failureRisk)

  const anomalies: AnomalyFinding[] = []
  if (tempDev > 0.08) {
    anomalies.push({
      metric: 'Temperature',
      level: tempDev > 0.25 ? 'Severe Anomaly' : 'Anomaly Detected',
      summary: `Temperature is ${Math.round(tempDev * 100)}% outside the expected operating range for this equipment type.`,
    })
  }
  if (vibDev > 0.08) {
    anomalies.push({
      metric: 'Vibration',
      level: vibDev > 0.3 ? 'Severe Anomaly' : 'Anomaly Detected',
      summary: 'Vibration is above the expected baseline for this equipment type.',
    })
  }
  if (input.errorCount >= 6) {
    anomalies.push({
      metric: 'Error count',
      level: input.errorCount >= 12 ? 'Severe Anomaly' : 'Anomaly Detected',
      summary: `Error frequency is elevated (${input.errorCount} recorded events in the current window).`,
    })
  }
  if (pressureDev > 0.12) {
    anomalies.push({
      metric: 'Pressure',
      level: pressureDev > 0.3 ? 'Severe Anomaly' : 'Anomaly Detected',
      summary: 'Pressure is outside the expected operating range.',
    })
  }

  const anomalyLevel: AnomalyLevel = anomalies.some((a) => a.level === 'Severe Anomaly')
    ? 'Severe Anomaly'
    : anomalies.length
      ? 'Anomaly Detected'
      : 'Normal'

  let operationalStatus: OperationalStatus = 'operational'
  if (healthScore < 40) operationalStatus = 'degraded'
  else if (healthScore < 75) operationalStatus = 'attention'

  let safetyStatus: SafetyStatus = 'Normal'
  if (anomalyLevel === 'Severe Anomaly' || failureRisk >= 75) safetyStatus = 'Safety Event'
  else if (anomalyLevel !== 'Normal' || failureRisk >= 50) safetyStatus = 'Review Required'

  const crit = input.criticality ?? 'Medium'
  const overdue = overdueDays(input.lastMaintenanceDaysAgo)
  const safetyBoost = safetyStatus === 'Safety Event' ? 18 : safetyStatus === 'Review Required' ? 8 : 0
  const priorityScore = Math.round(
    clamp(failureRisk * 0.55 + (crit === 'Life-supporting' ? 22 : crit === 'High' ? 14 : 4) + overdue * 0.4 + safetyBoost),
  )
  const priority = priorityInterpretation(priorityScore)

  const explanations: string[] = []
  if (tempDev === 0) explanations.push('Temperature is within the expected range for this equipment type.')
  else explanations.push('Temperature is contributing to elevated equipment stress.')
  if (vibDev === 0) explanations.push('Vibration is stable within expected limits.')
  else explanations.push('Vibration is outside the expected baseline.')
  if (input.errorCount < 4) explanations.push('Error frequency is low.')
  else explanations.push('Error frequency is higher than the typical quiet baseline.')
  if (input.lastMaintenanceDaysAgo <= 60) explanations.push('Recent maintenance is within the planned interval.')
  else explanations.push('Time since last maintenance is extended and increases priority.')

  const rawContributions: FeatureContribution[] = [
    {
      feature: 'Temperature',
      contribution: clamp(tempDev * 100),
      direction: tempDev > 0 ? 'increases_risk' : 'neutral',
      note: tempDev > 0 ? 'High contribution' : 'Low contribution',
    },
    {
      feature: 'Vibration',
      contribution: clamp(vibDev * 110),
      direction: vibDev > 0 ? 'increases_risk' : 'neutral',
      note: vibDev > 0.15 ? 'High contribution' : vibDev > 0 ? 'Moderate contribution' : 'Low contribution',
    },
    {
      feature: 'Error count',
      contribution: clamp(input.errorCount * 8),
      direction: input.errorCount >= 4 ? 'increases_risk' : 'neutral',
      note: input.errorCount >= 6 ? 'High contribution' : input.errorCount >= 3 ? 'Moderate contribution' : 'Low contribution',
    },
    {
      feature: 'Operating hours',
      contribution: clamp(hoursPenalty * 4),
      direction: hoursPenalty > 6 ? 'increases_risk' : 'neutral',
      note: hoursPenalty > 6 ? 'Moderate contribution' : 'Low contribution',
    },
    {
      feature: 'Power',
      contribution: clamp(powerDev * 90),
      direction: powerDev > 0 ? 'increases_risk' : 'neutral',
      note: powerDev > 0.1 ? 'Moderate contribution' : 'Low contribution',
    },
  ]

  const contributions = rawContributions.sort((a, b) => b.contribution - a.contribution)

  const recommendedAction =
    priority.label === 'Urgent'
      ? 'Immediate inspection required.'
      : priority.label === 'Elevated'
        ? 'Schedule inspection and review telemetry with the assigned biomedical engineer.'
        : priority.label === 'Routine'
          ? 'Continue planned preventive maintenance.'
          : 'No additional maintenance action indicated beyond the existing plan.'

  return {
    equipmentId: input.equipmentId ?? 'MANUAL',
    healthScore,
    healthLabel: health.label,
    failureRisk,
    riskLevel: risk.label,
    operationalStatus,
    safetyStatus,
    maintenancePriority: priorityScore,
    priorityLabel: priority.label,
    recommendedAction,
    anomalyLevel,
    anomalies,
    explanations,
    contributions,
    modelId: input.modelId ?? 'rf-v2.1',
    assessedAt: new Date().toISOString(),
    source: input.source ?? 'manual',
  }
}

export function assessTelemetry(
  equipmentId: string,
  equipmentType: string,
  criticality: Criticality,
  point: TelemetryPoint,
  lastMaintenanceDaysAgo: number,
  department: string,
  source: RiskAssessment['source'],
) {
  return assessFromReadings({
    equipmentId,
    equipmentType,
    temperature: point.temperature,
    vibration: point.vibration,
    powerKw: point.powerKw,
    operatingHours: point.operatingHours,
    errorCount: point.errorCount,
    lastMaintenanceDaysAgo,
    department,
    pressure: point.pressure,
    criticality,
    source,
  })
}

export function maintenancePriorityFactors(opts: {
  failureRisk: number
  criticality: Criticality
  safetyStatus: SafetyStatus
  overdue: boolean
  downtimeImpact: number
}) {
  return {
    failureRisk: opts.failureRisk,
    criticalityWeight: criticalityWeight(opts.criticality),
    safetyStatus: opts.safetyStatus,
    overdue: opts.overdue,
    downtimeImpact: opts.downtimeImpact,
  }
}

export function simulateMaintenance(currentHealth: number, currentRisk: number): {
  estimatedHealth: number
  estimatedRisk: number
  potentialDowntimeReductionHours: number
} {
  const estimatedHealth = Math.round(clamp(currentHealth + 28 + (100 - currentHealth) * 0.18))
  const estimatedRisk = Math.round(clamp(currentRisk - 32 - currentRisk * 0.12))
  const potentialDowntimeReductionHours = Math.round((currentRisk - estimatedRisk) * 0.18)
  return { estimatedHealth, estimatedRisk, potentialDowntimeReductionHours }
}
