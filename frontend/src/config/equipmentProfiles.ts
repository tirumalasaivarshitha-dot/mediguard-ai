export type MetricRange = { min: number; max: number; unit: string }

export type EquipmentProfile = {
  temperature: MetricRange
  vibration: MetricRange
  powerKw: MetricRange
  pressure?: MetricRange
  voltage?: MetricRange
}

const defaultProfile: EquipmentProfile = {
  temperature: { min: 18, max: 42, unit: '°C' },
  vibration: { min: 0, max: 2.2, unit: 'mm/s' },
  powerKw: { min: 0.2, max: 12, unit: 'kW' },
  pressure: { min: 0, max: 8, unit: 'bar' },
  voltage: { min: 110, max: 240, unit: 'V' },
}

export const expectedRanges: Record<string, EquipmentProfile> = {
  'MRI Scanner': {
    temperature: { min: 16, max: 28, unit: '°C' },
    vibration: { min: 0, max: 1.6, unit: 'mm/s' },
    powerKw: { min: 8, max: 18, unit: 'kW' },
    voltage: { min: 380, max: 420, unit: 'V' },
  },
  'CT Scanner': {
    temperature: { min: 18, max: 32, unit: '°C' },
    vibration: { min: 0, max: 2.0, unit: 'mm/s' },
    powerKw: { min: 6, max: 16, unit: 'kW' },
    voltage: { min: 380, max: 420, unit: 'V' },
  },
  Ventilator: {
    temperature: { min: 18, max: 35, unit: '°C' },
    vibration: { min: 0, max: 1.2, unit: 'mm/s' },
    powerKw: { min: 0.1, max: 0.8, unit: 'kW' },
    pressure: { min: 5, max: 40, unit: 'cmH2O' },
    voltage: { min: 110, max: 240, unit: 'V' },
  },
  'Patient Monitor': {
    temperature: { min: 15, max: 40, unit: '°C' },
    vibration: { min: 0, max: 0.8, unit: 'mm/s' },
    powerKw: { min: 0.05, max: 0.25, unit: 'kW' },
    voltage: { min: 110, max: 240, unit: 'V' },
  },
  Defibrillator: {
    temperature: { min: 15, max: 40, unit: '°C' },
    vibration: { min: 0, max: 1.0, unit: 'mm/s' },
    powerKw: { min: 0.05, max: 1.5, unit: 'kW' },
    voltage: { min: 110, max: 240, unit: 'V' },
  },
  'Ultrasound System': {
    temperature: { min: 16, max: 38, unit: '°C' },
    vibration: { min: 0, max: 0.9, unit: 'mm/s' },
    powerKw: { min: 0.3, max: 1.2, unit: 'kW' },
    voltage: { min: 110, max: 240, unit: 'V' },
  },
  'Anesthesia Machine': {
    temperature: { min: 16, max: 36, unit: '°C' },
    vibration: { min: 0, max: 1.4, unit: 'mm/s' },
    powerKw: { min: 0.2, max: 1.0, unit: 'kW' },
    pressure: { min: 20, max: 55, unit: 'psi' },
    voltage: { min: 110, max: 240, unit: 'V' },
  },
  'Dialysis Machine': {
    temperature: { min: 18, max: 40, unit: '°C' },
    vibration: { min: 0, max: 1.8, unit: 'mm/s' },
    powerKw: { min: 0.4, max: 1.6, unit: 'kW' },
    pressure: { min: 50, max: 250, unit: 'mmHg' },
    voltage: { min: 110, max: 240, unit: 'V' },
  },
}

export function profileFor(equipmentType: string): EquipmentProfile {
  return expectedRanges[equipmentType] ?? defaultProfile
}

export function deviation(value: number, range: MetricRange) {
  if (value < range.min) return (range.min - value) / Math.max(range.min, 1)
  if (value > range.max) return (value - range.max) / Math.max(range.max, 1)
  return 0
}
