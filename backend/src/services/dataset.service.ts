import { prisma } from '../config/database'
import { DatasetType, DatasetStatus, EquipmentStatus } from '@prisma/client'
import { auditService } from './audit.service'
import { socketManager } from '../sockets/socketManager'
import fs from 'fs/promises'
import path from 'path'

const DATASET_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'datasets')

function datasetStoragePath(id: string) {
  return path.join(DATASET_STORAGE_DIR, `${id}.json`)
}

export type ParsedDataset = {
  fileName: string
  fileType: string
  fileSize: number
  rows: Record<string, unknown>[]
  columns: string[]
}

export type KaggleFileRole = 'manufacturers' | 'devices' | 'events'

export type ParsedKaggleFile = ParsedDataset & {
  role: KaggleFileRole
}

export const KAGGLE_CSV_COLUMNS: Record<KaggleFileRole, string[]> = {
  manufacturers: ['id', 'address', 'comment', 'name', 'parent_company', 'representative', 'slug', 'source', 'created_at', 'updated_at'],
  devices: ['id', 'classification', 'code', 'description', 'distributed_to', 'implanted', 'name', 'number', 'quantity_in_commerce', 'risk_class', 'slug', 'country', 'manufacturer_id', 'created_at', 'updated_at'],
  events: ['id', 'action', 'action_classification', 'action_level', 'action_summary', 'authorities_link', 'country', 'create_date', 'data_notes', 'date', 'date_initiated_by_firm', 'date_posted', 'date_terminated', 'date_updated', 'determined_cause', 'documents', 'icij_notes', 'number', 'reason', 'source', 'status', 'target_audience', 'type', 'uid', 'uid_hash', 'url', 'slug', 'device_id', 'created_at', 'updated_at'],
}

export function getKaggleFileRole(fileName: string): KaggleFileRole | null {
  const name = fileName.toLowerCase()
  if (name.startsWith('manufacturers')) return 'manufacturers'
  if (name.startsWith('devices')) return 'devices'
  if (name.startsWith('events')) return 'events'
  return null
}

export function validateKaggleFiles(files: ParsedKaggleFile[]) {
  const errors: Array<{ file: string; row?: number; message: string }> = []
  if (files.length !== 3) {
    errors.push({ file: 'dataset', message: 'Kaggle historical datasets require exactly manufacturers.csv, devices.csv, and events.csv.' })
  }
  const seenRoles = new Set<KaggleFileRole>()
  files.forEach((file) => {
    if (seenRoles.has(file.role)) errors.push({ file: file.fileName, message: `Duplicate Kaggle ${file.role}.csv file.` })
    seenRoles.add(file.role)
  })
  const byRole = new Map(files.map((file) => [file.role, file]))
  for (const role of ['manufacturers', 'devices', 'events'] as KaggleFileRole[]) {
    const file = byRole.get(role)
    if (!file) {
      errors.push({ file: role, message: `Kaggle dataset is missing the ${role}.csv file.` })
      continue
    }
    const expected = KAGGLE_CSV_COLUMNS[role]
    const actual = file.columns
    const sameColumns = actual.length === expected.length && expected.every((column) => actual.includes(column))
    if (!sameColumns) {
      errors.push({
        file: file.fileName,
        message: `Columns must exactly match the Kaggle ${role}.csv schema. Expected: ${expected.join(', ')}.`,
      })
    }
  }

  const manufacturers = byRole.get('manufacturers')
  const devices = byRole.get('devices')
  const events = byRole.get('events')
  if (manufacturers && devices && events && errors.length === 0) {
    const manufacturerIds = new Set(manufacturers.rows.map((row) => String(row.id ?? '').trim()).filter(Boolean))
    const deviceIds = new Set(devices.rows.map((row) => String(row.id ?? '').trim()).filter(Boolean))
    devices.rows.forEach((row, index) => {
      const id = String(row.id ?? '').trim()
      const manufacturerId = String(row.manufacturer_id ?? '').trim()
      if (!id) errors.push({ file: devices.fileName, row: index + 2, message: 'device id is required.' })
      if (!manufacturerId || !manufacturerIds.has(manufacturerId)) {
        errors.push({ file: devices.fileName, row: index + 2, message: `manufacturer_id "${manufacturerId}" does not reference manufacturers.id.` })
      }
    })
    events.rows.forEach((row, index) => {
      const deviceId = String(row.device_id ?? '').trim()
      if (!String(row.id ?? '').trim()) errors.push({ file: events.fileName, row: index + 2, message: 'event id is required.' })
      if (!deviceId || !deviceIds.has(deviceId)) {
        errors.push({ file: events.fileName, row: index + 2, message: `device_id "${deviceId}" does not reference devices.id.` })
      }
    })
  }
  return { valid: errors.length === 0, errors }
}

export interface DatasetProfileResult {
  rowCount: number
  columnCount: number
  columns: { name: string; type: string; missingCount: number; uniqueCount: number }[]
  numericColumns: string[]
  categoricalColumns: string[]
  datetimeColumns: string[]
  duplicateRows: number
  missingTotal: number
  missingValuePercent: number
  columnNames: string[]
  previewRows: Record<string, unknown>[]
  possibleIdColumns: string[]
  detectedTargetCandidate?: string
  detectedMapping: DetectedColumnMapping[]
  capabilities: DatasetCapabilities
  compatibility: 'COMPATIBLE' | 'COMPATIBLE_WITH_LIMITATIONS' | 'REJECTED'
  unmappedColumns: string[]
  suspiciousColumns: string[]
  warnings: string[]
  errors: string[]
}

export type CanonicalDatasetField =
  | 'equipment_id' | 'equipment_name' | 'equipment_type' | 'model' | 'manufacturer'
  | 'location' | 'department' | 'facility'
  | 'temperature' | 'vibration' | 'pressure' | 'power' | 'humidity' | 'operating_hours' | 'error_count'
  | 'last_maintenance' | 'maintenance_count' | 'maintenance_status'
  | 'failure_indicator' | 'fault_status' | 'failure_type' | 'condition_status'
  | 'timestamp'

export interface DetectedColumnMapping {
  sourceColumn: string
  detectedType: string
  canonicalField?: CanonicalDatasetField
  confidence: number | null
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNMAPPED'
  status: 'MAPPED' | 'UNMAPPED'
  reason: string
  sampleValues: unknown[]
}

export interface DatasetCapabilities {
  equipmentIdentification: boolean
  telemetryAnalysis: boolean
  failurePrediction: boolean
  anomalyDetection: boolean
  maintenanceAnalysis: boolean
  conditionAssessment: boolean
  historicalSafetyIntelligence: boolean
  operationalTelemetry: boolean
  failureTarget?: {
    column: string
    distinctValues: number
    valid: boolean
    reason: string
  }
}

export interface DatasetValidationResult {
  isValid: boolean
  status: 'VALIDATED' | 'WARNINGS' | 'REJECTED'
  warnings: string[]
  errors: string[]
}

const CANONICAL_ALIASES: Record<CanonicalDatasetField, string[]> = {
  equipment_id: ['equipmentid', 'equipmentcode', 'deviceid', 'devicecode', 'machineid', 'assetid', 'unitid', 'serialnumber', 'assetcode'],
  equipment_name: ['equipmentname', 'devicename', 'machinename', 'assetname', 'unitname', 'device'],
  equipment_type: ['equipmenttype', 'devicetype', 'machinetype', 'assettype', 'category'],
  model: ['model', 'modelnumber', 'modelname'],
  manufacturer: ['manufacturer', 'manufacturername', 'maker', 'brand'],
  location: ['location', 'site', 'room', 'ward'],
  department: ['department', 'service', 'unit', 'clinicaldepartment'],
  facility: ['facility', 'hospital', 'hospitalname', 'organization'],
  temperature: ['temperature', 'temp', 'tempreading', 'temperaturec', 'temperaturef', 'bodytemperature'],
  vibration: ['vibration', 'vib', 'vibrationlevel', 'viblevel'],
  pressure: ['pressure', 'pressurereading'],
  power: ['power', 'powerconsumption', 'powerkw', 'voltage'],
  humidity: ['humidity', 'humidityreading'],
  operating_hours: ['operatinghours', 'runtimehours', 'runninghours', 'hoursoperated', 'usagehours'],
  error_count: ['errorcount', 'errors', 'faultcount', 'alarmcount'],
  last_maintenance: ['lastmaintenance', 'lastservice', 'servicedate', 'maintenance date', 'maintenance_date'],
  maintenance_count: ['maintenancecount', 'servicecount', 'numberofservices'],
  maintenance_status: ['maintenancestatus', 'servicestatus', 'maintenance_state'],
  failure_indicator: ['failure', 'failureindicator', 'failureflag', 'machinefailure', 'failed', 'failurelabel'],
  fault_status: ['fault', 'faultstatus', 'faultstate', 'alarm', 'alarmstatus'],
  failure_type: ['failuretype', 'faulttype', 'failuremode'],
  condition_status: ['condition', 'conditionstatus', 'healthstatus', 'operationalstatus'],
  timestamp: ['timestamp', 'datetime', 'date', 'eventdate', 'recordedat', 'createdat'],
}

const NUMERIC_FIELDS = new Set<CanonicalDatasetField>([
  'temperature', 'vibration', 'pressure', 'power', 'humidity', 'operating_hours', 'error_count', 'maintenance_count',
])
const DATE_FIELDS = new Set<CanonicalDatasetField>(['last_maintenance', 'timestamp'])
const EQUIPMENT_TERMS = /\b(equipment|device|machine|asset|unit|medical|instrument|implant)\b/i
const HISTORICAL_TERMS = /\b(recall|event|classification|risk.?class|action|cause|outcome|incident|safety)\b/i
const LEGACY_MAPPING_FIELDS: Record<string, CanonicalDatasetField> = {
  equipmentId: 'equipment_id',
  equipmentName: 'equipment_name',
  equipmentType: 'equipment_type',
  model: 'model',
  manufacturer: 'manufacturer',
  location: 'location',
  department: 'department',
  facility: 'facility',
  temperature: 'temperature',
  vibration: 'vibration',
  pressure: 'pressure',
  power: 'power',
  humidity: 'humidity',
  operatingHours: 'operating_hours',
  errorCount: 'error_count',
  lastMaintenance: 'last_maintenance',
  maintenanceCount: 'maintenance_count',
  maintenanceStatus: 'maintenance_status',
  maintenance: 'maintenance_status',
  failureTarget: 'failure_indicator',
  failureIndicator: 'failure_indicator',
  faultStatus: 'fault_status',
  failureType: 'failure_type',
  conditionStatus: 'condition_status',
  timestamp: 'timestamp',
}

function normalizeColumnName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function sampleValues(rows: Record<string, unknown>[], column: string) {
  return rows.map((row) => row[column]).filter((value) => value !== null && value !== undefined && String(value).trim() !== '').slice(0, 3)
}

function isBinaryLike(values: unknown[]) {
  const normalized = new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))
  return normalized.size > 0 && normalized.size <= 2 && Array.from(normalized).every((value) => ['0', '1', 'true', 'false', 'yes', 'no', 'y', 'n', 'pass', 'fail', 'normal', 'abnormal'].includes(value))
}

function detectDatasetIntelligence(
  columns: string[],
  rows: Record<string, unknown>[],
  profiles: { name: string; type: string }[],
) {
  const profileByName = new Map(profiles.map((profile) => [profile.name, profile]))
  const candidates: Array<DetectedColumnMapping & { score: number }> = []
  const usedFields = new Set<CanonicalDatasetField>()
  const mapping: DetectedColumnMapping[] = []

  for (const sourceColumn of columns) {
    const normalized = normalizeColumnName(sourceColumn)
    const values = sampleValues(rows, sourceColumn)
    let best: { field: CanonicalDatasetField; score: number; reason: string } | null = null
    let secondBest = 0

    for (const [field, aliases] of Object.entries(CANONICAL_ALIASES) as [CanonicalDatasetField, string[]][]) {
      if (usedFields.has(field)) continue
      let score = 0
      let reason = ''
      if (aliases.includes(normalized)) {
        score = 0.96
        reason = 'Column name exactly matches a recognized equipment-data alias.'
      } else if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
        score = 0.72
        reason = 'Column name contains a recognized equipment-data synonym.'
      }
      const columnProfile = profileByName.get(sourceColumn)
      if (score && NUMERIC_FIELDS.has(field) && columnProfile?.type === 'number') score += 0.03
      if (score && DATE_FIELDS.has(field) && columnProfile?.type === 'datetime') score += 0.03
      if (score && (field === 'failure_indicator') && isBinaryLike(values)) {
        score += 0.03
        reason = 'Column name and binary sample values strongly match a failure indicator.'
      }
      if (score && (!best || score > best.score)) {
        secondBest = best?.score || 0
        best = { field, score: Math.min(score, 0.99), reason }
      } else if (score > secondBest) {
        secondBest = score
      }
    }

    if (best && best.score >= 0.65 && best.score - secondBest >= 0.08) {
      usedFields.add(best.field)
      candidates.push({
        sourceColumn,
        detectedType: profileByName.get(sourceColumn)?.type || 'unknown',
        canonicalField: best.field,
        confidence: Number(best.score.toFixed(2)),
        confidenceLevel: best.score >= 0.85 ? 'HIGH' : best.score >= 0.7 ? 'MEDIUM' : 'LOW',
        status: 'MAPPED',
        reason: best.reason,
        sampleValues: values,
        score: best.score,
      })
    } else {
      mapping.push({
        sourceColumn,
        detectedType: profileByName.get(sourceColumn)?.type || 'unknown',
        confidence: null,
        confidenceLevel: 'UNMAPPED',
        status: 'UNMAPPED',
        reason: best ? 'Ambiguous or weak match; review this column before using it.' : 'No supported canonical equipment meaning detected.',
        sampleValues: values,
      })
    }
  }

  mapping.push(...candidates)
  const mappedFields = new Set(candidates.map((item) => item.canonicalField))
  const mappedColumn = (field: CanonicalDatasetField) => mappedFields.has(field)
  const equipmentIdentity = ['equipment_id', 'equipment_name', 'equipment_type', 'model', 'manufacturer'] as CanonicalDatasetField[]
  const hasEquipmentEvidence = equipmentIdentity.some(mappedColumn) || columns.some((column) => EQUIPMENT_TERMS.test(column))
  const telemetryFields: CanonicalDatasetField[] = ['temperature', 'vibration', 'pressure', 'power', 'humidity', 'operating_hours', 'error_count']
  const hasTelemetry = telemetryFields.some(mappedColumn)
  const failureFields: CanonicalDatasetField[] = ['failure_indicator', 'fault_status', 'failure_type', 'condition_status']
  const failureField = failureFields.find(mappedColumn)
  const failureSource = candidates.find((item) => item.canonicalField === failureField)?.sourceColumn
  const historical = columns.some((column) => HISTORICAL_TERMS.test(column))
  const maintenanceFields: CanonicalDatasetField[] = ['last_maintenance', 'maintenance_count', 'maintenance_status']
  const maintenance = maintenanceFields.some(mappedColumn)
  const historicalSafety = historical && (mappedColumn('equipment_id') || mappedColumn('equipment_name') || columns.some((column) => /\bdevice\b/i.test(column)))
  const capabilities: DatasetCapabilities = {
    equipmentIdentification: hasEquipmentEvidence,
    telemetryAnalysis: hasTelemetry && !historicalSafety,
    failurePrediction: hasTelemetry && Boolean(failureField) && !historicalSafety && Boolean(failureSource) && (failureSource ? isBinaryLike(sampleValues(rows, failureSource)) : false),
    anomalyDetection: hasTelemetry && !historicalSafety,
    maintenanceAnalysis: maintenance,
    conditionAssessment: hasTelemetry && !historicalSafety,
    historicalSafetyIntelligence: historicalSafety,
    operationalTelemetry: hasTelemetry && !historicalSafety,
  }
  const suspiciousColumns = columns.filter((column) => /\b(password|ssn|social.?security|token|secret)\b/i.test(column))
  return {
    mapping: [...mapping].sort((a, b) => columns.indexOf(a.sourceColumn) - columns.indexOf(b.sourceColumn)),
    capabilities,
    suspiciousColumns,
  }
}

export const datasetService = {
  profileParsedDataset(parsed: ParsedDataset): DatasetProfileResult & { validationStatus: string } {
    const { rows, columns } = parsed
    const missing = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
    const normalized = (value: unknown) => typeof value === 'string' ? value.trim() : value
    const isNumber = (value: unknown) => {
      if (typeof value === 'number') return Number.isFinite(value)
      if (typeof value !== 'string' || value.trim() === '') return false
      return Number.isFinite(Number(value))
    }
    const isDate = (value: unknown) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return true
      if (typeof value !== 'string' || value.trim() === '') return false
      return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value.trim()) && !Number.isNaN(Date.parse(value))
    }

    const columnProfiles = columns.map((name) => {
      const values = rows.map((row) => normalized(row[name])).filter((value) => !missing(value))
      const numeric = values.length > 0 && values.every(isNumber)
      const datetime = !numeric && values.length > 0 && values.every(isDate)
      const type = numeric ? 'number' : datetime ? 'datetime' : 'string'
      return {
        name,
        type,
        missingCount: rows.length - values.length,
        uniqueCount: new Set(values.map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value))).size,
      }
    })

    const rowKeys = rows.map((row) => JSON.stringify(columns.map((column) => normalized(row[column]) ?? null)))
    const frequencies = new Map<string, number>()
    rowKeys.forEach((key) => frequencies.set(key, (frequencies.get(key) || 0) + 1))
    const duplicateRows = rowKeys.reduce((count, key) => count + (frequencies.get(key)! > 1 ? 1 : 0), 0) - Array.from(frequencies.values()).filter((count) => count > 1).length
    const numericColumns = columnProfiles.filter((column) => column.type === 'number').map((column) => column.name)
    const datetimeColumns = columnProfiles.filter((column) => column.type === 'datetime').map((column) => column.name)
    const categoricalColumns = columnProfiles.filter((column) => column.type === 'string').map((column) => column.name)
    const possibleIdColumns = columns.filter((column) => /(^|[_\s-])(id|code|uuid|serial|identifier)($|[_\s-])/i.test(column) || /^(id|code|uuid|serial|identifier)$/i.test(column))
    const target = columns.find((column) => /(^|[_\s-])(failure|failed|fault|target|outcome|label|alarm|alert)($|[_\s-])/i.test(column))
    const warnings: string[] = []
    const errors: string[] = []
    if (rows.length === 0) errors.push('The uploaded file contains no data rows.')
    if (columns.length === 0) errors.push('The uploaded file has no columns.')
    if (rows.length < 50 && rows.length > 0) warnings.push('Dataset contains fewer than 50 rows. Models trained on small datasets may overfit.')
    if (columnProfiles.some((column) => column.missingCount > 0)) warnings.push('Dataset contains missing values requiring review before training.')
    if (duplicateRows > 0) warnings.push(`Dataset contains ${duplicateRows} duplicate rows.`)
    if (!target) warnings.push('No obvious failure or target column was detected from the uploaded column names.')
    const missingTotal = columnProfiles.reduce((total, column) => total + column.missingCount, 0)
    const intelligence = detectDatasetIntelligence(columns, rows, columnProfiles)
    const targetValues = target ? new Set(rows.map((row) => String(row[target]).trim()).filter(Boolean)) : new Set<string>()
    const targetValid = Boolean(target && targetValues.size >= 2 && targetValues.size <= 2 && !possibleIdColumns.includes(target))
    if (target && !targetValid) {
      warnings.push(targetValues.size < 2
        ? `Failure target "${target}" does not contain meaningful class variation.`
        : `Failure target "${target}" is not a valid binary operational classification target.`)
    }
    intelligence.capabilities.failurePrediction = intelligence.capabilities.failurePrediction && targetValid
    intelligence.capabilities.failureTarget = target
      ? {
        column: target,
        distinctValues: targetValues.size,
        valid: targetValid,
        reason: targetValid ? 'Binary target with meaningful class variation.' : 'Target is missing, constant, identifier-like, or has more than two classes.',
      }
      : undefined
    if (!intelligence.capabilities.equipmentIdentification && !intelligence.capabilities.historicalSafetyIntelligence) {
      errors.push('Dataset rejected: no equipment/device identity or equipment-related attributes were detected.')
    }
    if (intelligence.capabilities.telemetryAnalysis && !intelligence.capabilities.failurePrediction) {
      warnings.push('Telemetry fields were detected, but no valid failure label was found. Supervised failure prediction is not available.')
    }
    if (intelligence.capabilities.historicalSafetyIntelligence) {
      warnings.push('Historical safety data is analytical context, not live telemetry or physical equipment failure prediction.')
    }

    return {
      rowCount: rows.length,
      columnCount: columns.length,
      columns: columnProfiles,
      numericColumns,
      categoricalColumns,
      datetimeColumns,
      duplicateRows,
      missingTotal,
      missingValuePercent: rows.length * columns.length ? Number(((missingTotal / (rows.length * columns.length)) * 100).toFixed(2)) : 0,
      columnNames: columns,
      previewRows: rows.slice(0, 10),
      possibleIdColumns,
      detectedTargetCandidate: target,
      detectedMapping: intelligence.mapping,
      capabilities: intelligence.capabilities,
      compatibility: errors.length ? 'REJECTED' : warnings.length ? 'COMPATIBLE_WITH_LIMITATIONS' : 'COMPATIBLE',
      unmappedColumns: intelligence.mapping.filter((item) => item.status === 'UNMAPPED').map((item) => item.sourceColumn),
      suspiciousColumns: intelligence.suspiciousColumns,
      warnings,
      errors,
      validationStatus: errors.length ? 'REJECTED' : warnings.length ? 'WARNINGS' : 'VALIDATED',
    }
  },

  profileKaggleDataset(files: ParsedKaggleFile[]) {
    const validation = validateKaggleFiles(files)
    const allRows = files.flatMap((file) => file.rows)
    const allColumns = Array.from(new Set(files.flatMap((file) => file.columns)))
    const profiles = files.flatMap((file) => {
      const profile = this.profileParsedDataset(file)
      return profile.columns.map((column) => ({
        ...column,
        name: `${file.role}.${column.name}`,
      }))
    })
    const profile: DatasetProfileResult & {
      validationStatus: string
      provenance: Record<string, unknown>
    } = {
      rowCount: allRows.length,
      columnCount: allColumns.length,
      columns: profiles,
      numericColumns: [],
      categoricalColumns: allColumns,
      datetimeColumns: [],
      duplicateRows: 0,
      missingTotal: profiles.reduce((sum, column) => sum + column.missingCount, 0),
      missingValuePercent: profiles.length && allRows.length
        ? Number(((profiles.reduce((sum, column) => sum + column.missingCount, 0) / profiles.length / allRows.length) * 100).toFixed(2))
        : 0,
      columnNames: allColumns,
      previewRows: files.flatMap((file) => file.rows.slice(0, 3).map((row) => ({ __file: file.fileName, ...row }))),
      possibleIdColumns: ['manufacturers.id', 'devices.id', 'events.id'],
      detectedTargetCandidate: undefined,
      warnings: [
        'Kaggle historical safety data is an analytical archive and does not contain future telemetry measurements.',
        'This dataset must not be used to train or present future telemetry failure prediction.',
      ],
      errors: validation.errors.map((error) => `${error.file}${error.row ? ` row ${error.row}` : ''}: ${error.message}`),
      validationStatus: validation.valid ? 'VALIDATED' : 'REJECTED',
      detectedMapping: [],
      capabilities: {
        equipmentIdentification: true,
        telemetryAnalysis: false,
        failurePrediction: false,
        anomalyDetection: false,
        maintenanceAnalysis: false,
        conditionAssessment: false,
        historicalSafetyIntelligence: true,
        operationalTelemetry: false,
      },
      compatibility: validation.valid ? 'COMPATIBLE_WITH_LIMITATIONS' : 'REJECTED',
      unmappedColumns: allColumns,
      suspiciousColumns: [],
      provenance: {
        source: 'KAGGLE',
        datasetKey: 'medical-device-safety',
        files: files.map((file) => ({
          role: file.role,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          rowCount: file.rows.length,
          columns: file.columns,
        })),
        relationships: {
          'devices.manufacturer_id': 'manufacturers.id',
          'events.device_id': 'devices.id',
        },
        validation: {
          exactColumns: validation.errors.filter((error) => error.message.startsWith('Columns must')).length === 0,
          foreignKeys: validation.errors.filter((error) => error.message.includes('does not reference')).length === 0,
        },
      },
    }
    return profile
  },

  async listDatasets(filters?: { type?: DatasetType; status?: DatasetStatus; search?: string }) {
    try {
      const where: any = {}
      if (filters?.type) where.datasetType = filters.type
      if (filters?.status) where.status = filters.status
      if (filters?.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { fileName: { contains: filters.search, mode: 'insensitive' } },
        ]
      }

      const records = await prisma.dataset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      return records
    } catch (error: any) {
      console.error(`[Dataset] PostgreSQL list failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async getDatasetById(id: string) {
    try {
      const item = await prisma.dataset.findUnique({
        where: { id },
      })
      return item
    } catch (error: any) {
      console.error(`[Dataset] PostgreSQL read failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async deleteDataset(id: string, userId?: string, clientIp?: string) {
    const dataset = await prisma.dataset.findUnique({
      where: { id },
      include: {
        sourceEquipment: { select: { id: true } },
        predictionResults: { select: { id: true } },
        models: { select: { id: true, isOperational: true, isActive: true } },
      },
    })
    if (!dataset) throw new Error('DATASET_NOT_FOUND')
    if (dataset.isOperational) throw new Error('ACTIVE_DATASET_MUST_BE_DEACTIVATED')
    if (dataset.sourceEquipment.length) throw new Error('DATASET_HAS_DERIVED_EQUIPMENT')
    if (dataset.predictionResults.length) throw new Error('DATASET_HAS_PREDICTION_RESULTS')
    if (dataset.models.some((model) => model.isOperational || model.isActive)) {
      throw new Error('DATASET_HAS_ACTIVE_MODEL')
    }
    if (dataset.models.length) throw new Error('DATASET_HAS_MODELS')

    const [assessmentCount, alertCount, workOrderCount] = await prisma.$transaction([
      prisma.assessment.count({
        where: { datasetPredictionResult: { datasetId: id } },
      }),
      prisma.safetyAlert.count({
        where: { assessment: { datasetPredictionResult: { datasetId: id } } },
      }),
      prisma.maintenanceWorkOrder.count({
        where: { assessment: { datasetPredictionResult: { datasetId: id } } },
      }),
    ])
    if (assessmentCount || alertCount || workOrderCount) {
      throw new Error('DATASET_HAS_OPERATIONAL_DEPENDENCIES')
    }

    await prisma.dataset.delete({ where: { id } })
    if (dataset.storagePath) {
      try {
        await fs.unlink(dataset.storagePath)
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          console.error(`[Dataset] Storage cleanup failed for ${id}: ${error?.message || error}`)
        }
      }
    }
    await auditService.log({
      userId,
      action: 'DATASET_DELETED',
      entityType: 'DATASET',
      entityId: id,
      details: { name: dataset.name, fileName: dataset.fileName, datasetType: dataset.datasetType },
      ipAddress: clientIp,
    })
  },

  async createDataset(
    data: {
      name: string
      description?: string
      source: string
      fileName: string
      fileType?: string
      fileSize?: number
      rowCount?: number
      columnCount?: number
      datasetType?: DatasetType
      uploadedById?: string
      provenance?: unknown
    },
    clientIp?: string,
  ) {
    try {
      const dataset = await prisma.dataset.create({
        data: {
          name: data.name,
          description: data.description,
          source: data.source || 'USER_UPLOADED',
          fileName: data.fileName,
          fileType: data.fileType || 'text/csv',
          fileSize: data.fileSize ?? 0,
          rowCount: data.rowCount ?? 0,
          columnCount: data.columnCount ?? 0,
          datasetType: data.datasetType || DatasetType.TELEMETRY,
          provenance: data.provenance === undefined ? undefined : JSON.parse(JSON.stringify(data.provenance)),
          uploadedById: data.uploadedById,
          status: DatasetStatus.READY,
          validationStatus: 'VALIDATED',
        },
      })

      await auditService.log({
        userId: data.uploadedById,
        action: 'DATASET_UPLOADED',
        entityType: 'DATASET',
        entityId: dataset.id,
        details: { name: dataset.name, fileName: dataset.fileName, datasetType: dataset.datasetType },
        ipAddress: clientIp,
      })

      return dataset
    } catch (error: any) {
      console.error(`[Dataset] PostgreSQL create failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async storeProfile(id: string, profile: DatasetProfileResult & { validationStatus?: string; provenance?: unknown }) {
    try {
      return await prisma.dataset.update({
        where: { id },
        data: {
          profileSummary: JSON.parse(JSON.stringify(profile)),
          validationWarnings: profile.warnings,
          validationStatus: profile.validationStatus || (profile.errors.length ? 'REJECTED' : profile.warnings.length ? 'WARNINGS' : 'VALIDATED'),
          targetColumn: profile.detectedTargetCandidate || null,
        },
      })
    } catch (error: any) {
      console.error(`[Dataset] PostgreSQL profile update failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async storeParsedRows(id: string, rows: Record<string, unknown>[]) {
    await fs.mkdir(DATASET_STORAGE_DIR, { recursive: true })
    const storagePath = datasetStoragePath(id)
    await fs.writeFile(storagePath, JSON.stringify(rows), 'utf8')
    try {
      await prisma.dataset.update({ where: { id }, data: { storagePath } })
    } catch (error: any) {
      console.error(`[Dataset] PostgreSQL storage reference failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async activateDataset(id: string, userId?: string, clientIp?: string) {
    const dataset = await this.getDatasetById(id)
    if (!dataset) throw new Error('DATASET_NOT_FOUND')
    if (dataset.datasetType === DatasetType.HISTORICAL_SAFETY) {
      throw new Error('HISTORICAL_DATASET_NOT_OPERATIONAL')
    }
    const profile = dataset.profileSummary as { compatibility?: string; errors?: string[] } | null
    if (dataset.status === DatasetStatus.FAILED || profile?.compatibility === 'REJECTED' || profile?.errors?.length) {
      throw new Error('DATASET_NOT_OPERATIONALLY_ELIGIBLE')
    }

    const activated = await prisma.$transaction(async (tx) => {
      await tx.dataset.updateMany({ data: { isOperational: false } })
      return tx.dataset.update({ where: { id }, data: { isOperational: true, status: DatasetStatus.READY } })
    })

    await auditService.log({
      userId,
      action: 'DATASET_ACTIVATED',
      entityType: 'DATASET',
      entityId: id,
      details: { name: activated.name, datasetType: activated.datasetType, isOperational: activated.isOperational },
      ipAddress: clientIp,
    })
    let processing: { status: 'PROCESSED' | 'NOT_READY'; modelVersionId?: string; safetyAlertsCreated?: number; safetyAlertsSkipped?: number } = {
      status: 'NOT_READY',
    }
    if (activated.datasetType !== DatasetType.HISTORICAL_SAFETY) {
      const operationalModel = await prisma.modelVersion.findFirst({
        where: {
          datasetId: activated.id,
          isOperational: true,
          status: { in: ['ACTIVE', 'EVALUATION'] },
          artifactPath: { not: null },
        },
        select: { id: true },
      })
      if (operationalModel) {
        const completedPredictions = await prisma.datasetPredictionResult.count({
          where: { datasetId: activated.id, modelVersionId: operationalModel.id, status: 'COMPLETED' },
        })
        if (completedPredictions > 0) {
          const { datasetPredictionService } = await import('./datasetPrediction.service')
          const result = await datasetPredictionService.processDataset(activated.id, operationalModel.id, userId)
          processing = {
            status: 'PROCESSED',
            modelVersionId: operationalModel.id,
            safetyAlertsCreated: result.safetyAlertsCreated,
            safetyAlertsSkipped: result.safetyAlertsSkipped,
          }
        }
      }
    }
    socketManager.emit('dataset:activated', {
      datasetId: activated.id,
      datasetName: activated.name,
      datasetType: activated.datasetType,
      processing,
    })
    return activated
  },

  async readParsedRows(id: string): Promise<Record<string, unknown>[]> {
    const dataset = await this.getDatasetById(id)
    if (!dataset?.storagePath) throw new Error('DATASET_CONTENT_NOT_AVAILABLE')
    try {
      const resolved = path.resolve(dataset.storagePath)
      if (resolved !== datasetStoragePath(id)) throw new Error('DATASET_CONTENT_NOT_AVAILABLE')
      return JSON.parse(await fs.readFile(resolved, 'utf8')) as Record<string, unknown>[]
    } catch {
      throw new Error('DATASET_CONTENT_NOT_AVAILABLE')
    }
  },

  async profileDataset(id: string): Promise<DatasetProfileResult> {
    const ds = await this.getDatasetById(id)
    if (!ds) throw new Error('DATASET_NOT_FOUND')
    if (ds.profileSummary && typeof ds.profileSummary === 'object') {
      const stored = ds.profileSummary as unknown as Partial<DatasetProfileResult>
      if (stored.capabilities && stored.detectedMapping) {
        return stored as DatasetProfileResult
      }

      if (ds.datasetType === DatasetType.HISTORICAL_SAFETY) {
        return {
          ...(stored as DatasetProfileResult),
          detectedMapping: stored.detectedMapping || [],
          capabilities: {
            equipmentIdentification: false,
            telemetryAnalysis: false,
            failurePrediction: false,
            anomalyDetection: false,
            maintenanceAnalysis: false,
            conditionAssessment: false,
            historicalSafetyIntelligence: true,
            operationalTelemetry: false,
          },
          compatibility: 'COMPATIBLE_WITH_LIMITATIONS',
          unmappedColumns: stored.unmappedColumns || [],
          suspiciousColumns: stored.suspiciousColumns || [],
          warnings: stored.warnings || [],
          errors: stored.errors || [],
        }
      }

      // Re-profile datasets stored before the intelligence fields were added.
      const rows = await this.readParsedRows(id)
      const refreshed = this.profileParsedDataset({
        fileName: ds.fileName,
        fileType: ds.fileType,
        fileSize: ds.fileSize,
        rows,
        columns: stored.columnNames || Object.keys(rows[0] || {}),
      })
      await prisma.dataset.update({
        where: { id },
        data: { profileSummary: JSON.parse(JSON.stringify(refreshed)) },
      })
      return refreshed
    }
    return {
      rowCount: ds.rowCount || 0,
      columnCount: ds.columnCount || 0,
      columns: [],
      numericColumns: [],
      categoricalColumns: [],
      datetimeColumns: [],
      duplicateRows: 0,
      missingTotal: 0,
      missingValuePercent: 0,
      columnNames: [],
      previewRows: [],
      possibleIdColumns: [],
      detectedMapping: [],
      capabilities: {
        equipmentIdentification: false,
        telemetryAnalysis: false,
        failurePrediction: false,
        anomalyDetection: false,
        maintenanceAnalysis: false,
        conditionAssessment: false,
        historicalSafetyIntelligence: false,
        operationalTelemetry: false,
      },
      compatibility: 'REJECTED',
      unmappedColumns: [],
      suspiciousColumns: [],
      warnings: [],
      errors: [],
    }
  },

  async validateDataset(id: string): Promise<DatasetValidationResult> {
    const ds = await this.getDatasetById(id)
    if (!ds) throw new Error('DATASET_NOT_FOUND')
    const profile = await this.profileDataset(id)
    const warnings: string[] = [...profile.warnings]
    const errors: string[] = []

    if (profile.rowCount < 50) {
      warnings.push('Dataset contains fewer than 50 rows. Models trained on small datasets may overfit.')
    }

    if (profile.missingTotal > 0) {
      warnings.push(`Dataset contains ${profile.missingTotal} missing values requiring imputation prior to training.`)
    }

    if (ds.datasetType === 'HISTORICAL_SAFETY') {
      warnings.push('Dataset contains historical safety events rather than live telemetry. Suitable for safety intelligence, not direct time-series failure prediction.')
    }

    if (!profile.detectedTargetCandidate && ds.datasetType !== 'HISTORICAL_SAFETY') {
      warnings.push('No obvious binary failure target column detected. Target column must be manually configured before supervised training.')
    }
    if (profile.compatibility === 'REJECTED') errors.push(...profile.errors)
    if (profile.capabilities.historicalSafetyIntelligence) {
      warnings.push('HISTORICAL SAFETY DATA remains separate from operational telemetry and cannot be used for live failure prediction.')
    }

    const status = errors.length > 0 ? 'REJECTED' : warnings.length > 0 ? 'WARNINGS' : 'VALIDATED'

    return {
      isValid: errors.length === 0,
      status,
      warnings,
      errors,
    }
  },

  async mapColumns(id: string, mapping: Record<string, string>, targetColumn?: string, userId?: string, clientIp?: string) {
    try {
      const dataset = await prisma.dataset.findUnique({ where: { id } })
      if (!dataset) throw new Error('DATASET_NOT_FOUND')
      const profile = dataset.profileSummary && typeof dataset.profileSummary === 'object'
        ? dataset.profileSummary as unknown as DatasetProfileResult
        : null
      const sourceColumns = new Set(profile?.columnNames || [])
      const invalid = Object.values(mapping).filter((column) => typeof column === 'string' && column && !sourceColumns.has(column))
      if (invalid.length) throw new Error('INVALID_COLUMN_MAPPING')
      const updated = await prisma.dataset.update({
        where: { id },
        data: {
          mappingConfig: mapping,
          targetColumn: targetColumn || null,
          profileSummary: profile ? JSON.parse(JSON.stringify({
            ...profile,
            detectedMapping: profile.detectedMapping?.map((item) => {
              const manualField = Object.entries(mapping).find(([, sourceColumn]) => sourceColumn === item.sourceColumn)?.[0]
              const canonicalField = manualField ? LEGACY_MAPPING_FIELDS[manualField] : item.canonicalField
              return manualField && canonicalField
                ? {
                  ...item,
                  canonicalField,
                  confidence: 1,
                  confidenceLevel: 'HIGH',
                  status: 'MAPPED',
                  reason: 'User-confirmed mapping.',
                }
                : item
            }),
          })) : undefined,
          status: DatasetStatus.READY,
        },
      })

      await auditService.log({
        userId,
        action: 'DATASET_MAPPED',
        entityType: 'DATASET',
        entityId: id,
        details: { mapping, targetColumn },
        ipAddress: clientIp,
      })

      return updated
    } catch (error: any) {
      console.error(`[Dataset] PostgreSQL mapping failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },
}
