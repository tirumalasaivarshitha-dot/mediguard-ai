import type { Tone } from '@/types'

export type HealthBand = {
  min: number
  max: number
  label: string
  tone: Tone
}

/** Configurable business interpretation — not a clinical standard. */
export const healthBands: HealthBand[] = [
  { min: 90, max: 100, label: 'Excellent', tone: 'healthy' },
  { min: 75, max: 89, label: 'Good', tone: 'healthy' },
  { min: 60, max: 74, label: 'Attention Required', tone: 'warning' },
  { min: 40, max: 59, label: 'Poor', tone: 'high' },
  { min: 0, max: 39, label: 'Critical', tone: 'critical' },
]

export type RiskBand = {
  min: number
  max: number
  label: 'Low' | 'Medium' | 'High' | 'Critical'
  tone: Tone
}

export const riskBands: RiskBand[] = [
  { min: 0, max: 24, label: 'Low', tone: 'healthy' },
  { min: 25, max: 49, label: 'Medium', tone: 'warning' },
  { min: 50, max: 74, label: 'High', tone: 'high' },
  { min: 75, max: 100, label: 'Critical', tone: 'critical' },
]

export type PriorityBand = {
  min: number
  max: number
  label: 'Low' | 'Routine' | 'Elevated' | 'Urgent'
  tone: Tone
}

export const priorityBands: PriorityBand[] = [
  { min: 0, max: 29, label: 'Low', tone: 'healthy' },
  { min: 30, max: 54, label: 'Routine', tone: 'info' },
  { min: 55, max: 74, label: 'Elevated', tone: 'warning' },
  { min: 75, max: 100, label: 'Urgent', tone: 'critical' },
]

export function bandFor<T extends { min: number; max: number }>(value: number, bands: T[]): T {
  return bands.find((b) => value >= b.min && value <= b.max) ?? bands[0]
}
