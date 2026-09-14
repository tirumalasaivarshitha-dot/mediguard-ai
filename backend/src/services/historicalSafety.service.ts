import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { prisma } from '../config/database'
import { env } from '../config/env'
import { ParsedKaggleFile, validateKaggleFiles } from './dataset.service'

const DISCLAIMER = 'Historical safety information is provided for analytical context and is not a real-time equipment status feed.'
const rowSchema = z.record(z.string()).transform((row) => {
  const get = (...names: string[]) => names.map((n) => row[n] ?? row[Object.keys(row).find((k) => k.toLowerCase() === n.toLowerCase()) || '']).find((v) => v != null)?.trim() || ''
  return {
    manufacturer: get('manufacturer', 'maker'),
    manufacturerCountry: get('manufacturer_country'),
    deviceCode: get('device_code', 'device_id'),
    deviceName: get('device_name', 'device'),
    modelNumber: get('model_number', 'model'),
    country: get('country', 'market'),
    date: get('event_date', 'date'),
    year: get('event_year', 'year'),
    recallClass: get('recall_class', 'class'),
    eventType: get('event_type', 'type'),
    description: get('description', 'problem', 'issue'),
    actionTaken: get('action_taken', 'action'),
    sourceUrl: get('source_url', 'url'),
  }
}).superRefine((row, ctx) => {
  if (!row.manufacturer) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'manufacturer is required' })
  if (!row.deviceName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'device_name is required' })
  if (!row.description) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'description is required' })
})

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase().slice(0, 180)
}

function parseDate(dateValue: string, yearValue: string): { date: Date | null; year: number | null; quality: 'EXACT' | 'YEAR_ONLY' | 'UNKNOWN' } {
  const value = dateValue.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`)
    const parsedYear = date.getUTCFullYear()
    if (!Number.isNaN(date.getTime()) && parsedYear >= 1900 && parsedYear <= 2100) return { date, year: parsedYear, quality: 'EXACT' }
  }

  const year = Number((value.match(/\b(19|20)\d{2}\b/) || [])[0] || yearValue)
  if (Number.isInteger(year) && year >= 1900 && year <= 2100) return { date: null, year, quality: 'YEAR_ONLY' }
  return { date: null, year: null, quality: 'UNKNOWN' }
}

function normalizeEventType(value: string) {
  const normalized = normalize(value)
  const hasRecall = normalized.includes('recall')
  const hasFieldNotice = normalized.includes('field safety notice')
  const hasSafetyAlert = normalized.includes('safety alert')
  if ((hasRecall && (hasFieldNotice || hasSafetyAlert)) || (hasFieldNotice && hasSafetyAlert)) return 'MIXED'
  if (hasRecall) return 'RECALL'
  if (hasFieldNotice) return 'FIELD_SAFETY_NOTICE'
  if (hasSafetyAlert) return 'SAFETY_ALERT'
  return 'UNKNOWN'
}

type HistoricalFilters = {
  eventType?: string
  country?: string
  deviceSearch?: string
  manufacturerSearch?: string
  manufacturerId?: string
  deviceId?: string
  from?: string
  to?: string
}

function buildEventWhere(filters: HistoricalFilters = {}) {
  const where: any = {}
  if (filters.eventType && filters.eventType !== 'ALL') where.eventType = filters.eventType
  if (filters.country && filters.country !== 'ALL') where.country = filters.country
  if (filters.manufacturerId) where.manufacturerId = filters.manufacturerId
  if (filters.deviceId) where.deviceId = filters.deviceId
  if (filters.deviceSearch) {
    where.device = {
      OR: [
        { name: { contains: filters.deviceSearch, mode: 'insensitive' } },
        { deviceCode: { contains: filters.deviceSearch, mode: 'insensitive' } },
      ],
    }
  }
  if (filters.manufacturerSearch) {
    where.manufacturer = { name: { contains: filters.manufacturerSearch, mode: 'insensitive' } }
  }
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined
  if (from && !Number.isNaN(from.getTime())) where.eventDate = { ...(where.eventDate ?? {}), gte: from }
  if (to && !Number.isNaN(to.getTime())) where.eventDate = { ...(where.eventDate ?? {}), lte: to }
  return where
}

export interface HistoricalSafetyRecordItem {
  id: string
  deviceCode?: string | null
  deviceName: string
  manufacturer: string
  modelNumber?: string | null
  country: string
  eventYear?: number | null
  recallClass: string
  eventType: string
  description: string
  actionTaken?: string | null
  sourceUrl?: string | null
  dateQuality?: string
  dataLabel: string
}

function eventItem(event: any): HistoricalSafetyRecordItem {
  return {
    id: event.id, deviceCode: event.deviceCode, deviceName: event.device.name,
    manufacturer: event.manufacturer.name, modelNumber: event.device.modelNumber,
    country: event.country, eventYear: event.eventYear, recallClass: event.recallClass,
    eventType: event.eventType, description: event.description, actionTaken: event.actionTaken,
    sourceUrl: event.sourceUrl, dateQuality: event.dateQuality, dataLabel: 'HISTORICAL SAFETY DATA',
  }
}

export const historicalSafetyService = {
  async ingestKaggleFiles(files: ParsedKaggleFile[]) {
    const validation = validateKaggleFiles(files)
    if (!validation.valid) {
      const error = new Error(validation.errors.map((item) => `${item.file}${item.row ? ` row ${item.row}` : ''}: ${item.message}`).join(' '))
      error.name = 'KAGGLE_DATASET_INVALID'
      throw error
    }

    const byRole = new Map(files.map((file) => [file.role, file]))
    const manufacturers = new Map<string, string>()
    const devices = new Map<string, { id: string; manufacturerId: string; deviceCode: string | null }>()
    let upsertedManufacturers = 0
    let upsertedDevices = 0
    let upsertedEvents = 0
    let rejected = 0
    const errors: Array<{ row: number; message: string }> = []

    // Remove fallback rows from older permissive imports. Valid Kaggle rows are
    // reloaded below; no synthetic manufacturer/device values are retained.
    await prisma.historicalManufacturer.deleteMany({ where: { name: { startsWith: 'Unknown manufacturer' } } })
    await prisma.historicalDevice.deleteMany({ where: { name: { startsWith: 'Unknown device' } } })

    const chunk = async <T>(items: T[], fn: (batch: T[]) => Promise<void>) => {
      for (let index = 0; index < items.length; index += 1000) await fn(items.slice(index, index + 1000))
    }
    const manufacturerRows = byRole.get('manufacturers')!.rows.map((row) => ({
      sourceId: String(row.id).trim(),
      sourceKey: `manufacturers:${String(row.id).trim()}`,
      name: String(row.name ?? '').trim(),
      normalizedName: normalize(String(row.name ?? '')),
      country: String(row.source ?? '').trim() || null,
      parentCompany: String(row.parent_company ?? '').trim() || null,
    }))
    await chunk(manufacturerRows, async (batch) => {
      const result = await prisma.historicalManufacturer.createMany({ data: batch, skipDuplicates: true })
      upsertedManufacturers += result.count
    })
    for (const row of manufacturerRows) {
      await prisma.historicalManufacturer.updateMany({
        where: { sourceId: row.sourceId },
        data: { name: row.name, normalizedName: row.normalizedName, country: row.country, parentCompany: row.parentCompany },
      })
    }
    const manufacturerRecords = await prisma.historicalManufacturer.findMany({
      where: { sourceId: { in: manufacturerRows.map((row) => row.sourceId) } },
      select: { id: true, sourceId: true },
    })
    manufacturerRecords.forEach((record) => manufacturers.set(record.sourceId, record.id))

    const deviceRows = byRole.get('devices')!.rows.flatMap((row) => {
      const sourceId = String(row.id).trim()
      const name = String(row.name ?? '').trim()
      const manufacturerId = manufacturers.get(String(row.manufacturer_id).trim())
      if (!name || !manufacturerId) {
        rejected += 1
        return []
      }
      return [{
        sourceId,
        sourceKey: `devices:${sourceId}`,
        name,
        normalizedName: normalize(name),
        modelNumber: String(row.number ?? '').trim().slice(0, 180),
        deviceCode: String(row.code ?? '').trim() || null,
        classification: String(row.classification ?? '').trim() || null,
        country: String(row.country ?? '').trim() || null,
        implanted: String(row.implanted ?? '').trim() || null,
        quantityInCommerce: Number.isFinite(Number(row.quantity_in_commerce)) ? Number(row.quantity_in_commerce) : null,
        riskClass: String(row.risk_class ?? '').trim() || null,
        manufacturerId,
      }]
    })
    await chunk(deviceRows, async (batch) => {
      const result = await prisma.historicalDevice.createMany({ data: batch, skipDuplicates: true })
      upsertedDevices += result.count
    })
    const deviceRecords = await prisma.historicalDevice.findMany({
      where: { sourceId: { in: deviceRows.map((row) => row.sourceId) } },
      select: { id: true, sourceId: true, manufacturerId: true, deviceCode: true },
    })
    deviceRecords.forEach((record) => devices.set(record.sourceId, record))
    // createMany intentionally preserves source identities on re-ingest. Refresh
    // the non-identity Kaggle fields so the temporal trainer uses current source data.
    for (const row of deviceRows) {
      await prisma.historicalDevice.updateMany({
        where: { sourceId: row.sourceId },
        data: {
          name: row.name,
          normalizedName: row.normalizedName,
          modelNumber: row.modelNumber,
          deviceCode: row.deviceCode,
          classification: row.classification,
          country: row.country,
          implanted: row.implanted,
          quantityInCommerce: row.quantityInCommerce,
          riskClass: row.riskClass,
          manufacturerId: row.manufacturerId,
        },
      })
    }

    const eventRows = byRole.get('events')!.rows.flatMap((row, index) => {
      const rawId = String(row.id).trim()
      const device = devices.get(String(row.device_id).trim())
      if (!device) {
        rejected += 1
        errors.push({ row: index + 2, message: `event references a device row without a usable name: ${String(row.device_id).trim()}` })
        return []
      }
      const date = parseDate(String(row.date ?? ''), '')
      return [{
        sourceId: crypto.createHash('sha256').update(`events:${rawId}`).digest('hex'),
        deviceCode: device.deviceCode,
        manufacturerId: device.manufacturerId,
        deviceId: device.id,
        country: String(row.country ?? '').trim() || 'Global',
        eventDate: date.date,
        eventYear: date.year,
        dateQuality: date.quality,
        recallClass: String(row.action_classification ?? row.action_level ?? '').trim() || 'Unknown',
        eventType: normalizeEventType(String(row.type ?? row.action_summary ?? 'Safety event')),
        description: String(row.reason ?? row.action_summary ?? row.icij_notes ?? 'Historical safety event').trim(),
        actionTaken: String(row.action ?? row.action_summary ?? '').trim() || null,
        sourceUrl: String(row.url ?? row.authorities_link ?? '').trim() || null,
        rawData: JSON.parse(JSON.stringify(row)),
      }]
    })
    await chunk(eventRows, async (batch) => {
      const result = await prisma.historicalSafetyEvent.createMany({ data: batch, skipDuplicates: true })
      upsertedEvents += result.count
    })

    return {
      processed: files.reduce((total, file) => total + file.rows.length, 0),
      upserted: upsertedManufacturers + upsertedDevices + upsertedEvents,
      manufacturers: upsertedManufacturers,
      devices: upsertedDevices,
      events: upsertedEvents,
      rejected,
      errors,
    }
  },

  async ingestCsv(filePath = env.HISTORICAL_SAFETY_DATA_PATH) {
    const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
    const stat = await fs.stat(absolute)
    const files = stat.isDirectory()
      ? (await fs.readdir(absolute)).filter((name) => /^(manufacturers|devices|events).*\.csv$/i.test(name)).sort()
      : [path.basename(absolute)]
    const base = stat.isDirectory() ? absolute : path.dirname(absolute)
    const allRows: Array<{ kind: 'manufacturers' | 'devices' | 'events'; row: Record<string, string> }> = []
    const parsedKaggleFiles: ParsedKaggleFile[] = []
    for (const file of files) {
      const kind: 'manufacturers' | 'devices' | 'events' = file.toLowerCase().startsWith('manufacturers') ? 'manufacturers' : file.toLowerCase().startsWith('devices') ? 'devices' : 'events'
      const text = await fs.readFile(path.join(base, file), 'utf8')
      const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[]
      allRows.push(...rows.map((row) => ({ kind, row })))
      parsedKaggleFiles.push({
        fileName: file,
        fileType: 'text/csv',
        fileSize: Buffer.byteLength(text),
        rows,
        columns: rows.length ? Object.keys(rows[0]) : [],
        role: kind,
      })
    }
    if (files.length === 3 && parsedKaggleFiles.length === 3) {
      return this.ingestKaggleFiles(parsedKaggleFiles)
    }
    const rows = allRows
    let inserted = 0; let rejected = 0
    const errors: Array<{ row: number; message: string }> = []
    const manufacturers = new Map<string, any>()
    const devices = new Map<string, any>()
    {
      const tx = prisma
      for (const item of rows.filter((entry) => entry.kind === 'manufacturers')) {
        const sourceId = (item.row.id || '').trim()
        const name = (item.row.name || '').trim() || `Unknown manufacturer ${sourceId}`
        if (!sourceId) { rejected += 1; continue }
        const manufacturer = await tx.historicalManufacturer.upsert({
          where: { sourceId },
          create: { sourceId, sourceKey: `manufacturers:${sourceId}`, name, normalizedName: normalize(name), country: item.row.source || null },
          update: { name, country: item.row.source || undefined },
        })
        manufacturers.set(sourceId, manufacturer)
      }
      for (const item of rows.filter((entry) => entry.kind === 'devices')) {
        const modelNumber = (item.row.number || '').trim().slice(0, 180)
        const sourceId = (item.row.id || '').trim()
        const name = (item.row.name || item.row.description || '').trim() || `Unknown device ${sourceId}`
        const manufacturerSourceId = (item.row.manufacturer_id || '').trim()
        let manufacturerId = manufacturers.get(manufacturerSourceId)?.id
        if (!manufacturerId && manufacturerSourceId) {
          const manufacturer = await tx.historicalManufacturer.upsert({
            where: { sourceId: manufacturerSourceId },
            create: { sourceId: manufacturerSourceId, sourceKey: `manufacturers:${manufacturerSourceId}`, name: `Unknown manufacturer ${manufacturerSourceId}`, normalizedName: normalize(`Unknown manufacturer ${manufacturerSourceId}`) },
            update: {},
          })
          manufacturerId = manufacturer.id
          manufacturers.set(manufacturerSourceId, manufacturer)
        }
        if (!name || !manufacturerId || !sourceId) { rejected += 1; continue }
        const device = await tx.historicalDevice.upsert({
          where: { sourceId },
          create: { sourceId, sourceKey: `devices:${sourceId}`, name, normalizedName: normalize(name), modelNumber, deviceCode: item.row.code || sourceId, manufacturerId },
          update: { deviceCode: item.row.code || item.row.id },
        })
        devices.set(sourceId, device)
      }
      for (const item of rows.filter((entry) => entry.kind === 'events')) {
        const raw = item.row
        const device = devices.get((raw.device_id || '').trim())
        const manufacturer = device ? manufacturers.get((raw.manufacturer_id || '').trim()) || manufacturers.get(device.manufacturerId) : undefined
        const description = (raw.reason || raw.action_summary || raw.action || raw.icij_notes || 'Historical safety event').trim()
        if (!raw.id || !device) { rejected += 1; errors.push({ row: rows.indexOf(item) + 2, message: 'event references an unknown device' }); continue }
        const date = parseDate(raw.date || raw.create_date || raw.date_posted, '')
        const sourceId = crypto.createHash('sha256').update(`events:${raw.id}`).digest('hex')
        await tx.historicalSafetyEvent.upsert({
          where: { sourceId },
          create: { sourceId, deviceCode: device.deviceCode, manufacturerId: device.manufacturerId, deviceId: device.id, country: raw.country || 'Global', eventDate: date.date, eventYear: date.year, dateQuality: date.quality, recallClass: raw.action_classification || raw.action_level || 'Unknown', eventType: normalizeEventType(raw.type || raw.action_summary || 'Safety event'), description, actionTaken: raw.action || raw.action_summary || null, sourceUrl: raw.url || raw.authorities_link || null, rawData: raw },
          update: { deviceId: device.id, manufacturerId: device.manufacturerId, country: raw.country || 'Global', eventDate: date.date, eventYear: date.year, dateQuality: date.quality, recallClass: raw.action_classification || raw.action_level || 'Unknown', eventType: normalizeEventType(raw.type || raw.action_summary || 'Safety event'), description, actionTaken: raw.action || raw.action_summary || null, sourceUrl: raw.url || raw.authorities_link || null, rawData: raw, updatedAt: new Date() },
        })
        inserted += 1
      }
    }
    /* A single transaction makes a partial three-file load impossible. */
    /*
    for (let i = 0; i < rows.length; i += 1) {
      const parsed = rowSchema.safeParse(rows[i])
      if (!parsed.success) { rejected += 1; errors.push({ row: i + 2, message: parsed.error.issues.map((x) => x.message).join(', ') }); continue }
      const row = parsed.data
      const date = parseDate(row.date, row.year)
      const sourceId = crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex')
      await prisma.$transaction(async (tx) => {
        const manufacturer = await tx.historicalManufacturer.upsert({
          where: { normalizedName: normalize(row.manufacturer) },
          create: { name: row.manufacturer, normalizedName: normalize(row.manufacturer), country: row.manufacturerCountry || null },
          update: { name: row.manufacturer, country: row.manufacturerCountry || undefined },
        })
        const device = await tx.historicalDevice.upsert({
          where: { manufacturerId_normalizedName_modelNumber: { manufacturerId: manufacturer.id, normalizedName: normalize(row.deviceName), modelNumber: row.modelNumber } },
          create: { name: row.deviceName, normalizedName: normalize(row.deviceName), modelNumber: row.modelNumber, deviceCode: row.deviceCode || null, manufacturerId: manufacturer.id },
          update: { deviceCode: row.deviceCode || undefined },
        })
        await tx.historicalSafetyEvent.upsert({
          where: { sourceId },
          create: { sourceId, deviceCode: row.deviceCode || null, manufacturerId: manufacturer.id, deviceId: device.id, country: row.country || 'Global', eventDate: date.date, eventYear: date.year, dateQuality: date.quality, recallClass: row.recallClass || 'Unknown', eventType: row.eventType || 'Safety event', description: row.description, actionTaken: row.actionTaken || null, sourceUrl: row.sourceUrl || null, rawData: rows[i] },
          update: { deviceId: device.id, manufacturerId: manufacturer.id, updatedAt: new Date(), description: row.description, actionTaken: row.actionTaken || null },
        })
        inserted += 1
      })
    }*/
    return { processed: rows.length, upserted: inserted, rejected, errors }
  },

  async listRecords(filters: { search?: string; manufacturer?: string; recallClass?: string; country?: string; year?: number; page?: number; limit?: number } = {}) {
    if (await prisma.historicalSafetyEvent.count() === 0) {
      try { await this.ingestCsv() } catch { /* Data remains an explicit empty state when source files are unavailable. */ }
    }
    const page = Math.max(1, Number(filters.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20))
    const where: any = {}
    if (filters.manufacturer && filters.manufacturer !== 'ALL') where.manufacturer = { normalizedName: normalize(filters.manufacturer) }
    if (filters.recallClass && filters.recallClass !== 'ALL') where.recallClass = filters.recallClass
    if (filters.country && filters.country !== 'ALL') where.country = filters.country
    if (filters.year) where.eventYear = Number(filters.year)
    if (filters.search) where.OR = [{ description: { contains: filters.search, mode: 'insensitive' } }, { device: { name: { contains: filters.search, mode: 'insensitive' } } }, { manufacturer: { name: { contains: filters.search, mode: 'insensitive' } } }]
    const [events, total] = await Promise.all([
      prisma.historicalSafetyEvent.findMany({ where, include: { device: true, manufacturer: true }, orderBy: [{ eventYear: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.historicalSafetyEvent.count({ where }),
    ])
    return { records: events.map(eventItem), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, dataLabel: 'HISTORICAL SAFETY DATA', disclaimer: DISCLAIMER }
  },

  async getSummaryMetrics(filters: HistoricalFilters = {}) {
    const where = buildEventWhere(filters)
    const [totalRecords, manufacturerCount, countryRows, classRows, yearRows] = await Promise.all([
      prisma.historicalSafetyEvent.count({ where }),
      prisma.historicalSafetyEvent.findMany({ where, distinct: ['manufacturerId'], select: { manufacturerId: true } }),
      prisma.historicalSafetyEvent.groupBy({ by: ['country'], where, _count: { _all: true } }),
      prisma.historicalSafetyEvent.groupBy({ by: ['eventType'], where, _count: { _all: true } }),
      prisma.historicalSafetyEvent.groupBy({ by: ['eventYear'], where, _count: { _all: true }, orderBy: { eventYear: 'asc' } }),
    ])
    const typeCounts = Object.fromEntries(classRows.map((r) => [r.eventType, r._count._all]))
    return {
      totalRecords,
      manufacturerCount: manufacturerCount.length,
      countryCount: countryRows.length,
      recallCount: typeCounts.RECALL ?? 0,
      fieldSafetyNoticeCount: typeCounts.FIELD_SAFETY_NOTICE ?? 0,
      safetyAlertCount: typeCounts.SAFETY_ALERT ?? 0,
      mixedCount: typeCounts.MIXED ?? 0,
      recallClasses: typeCounts,
      byYear: yearRows.map((row) => ({ year: row.eventYear, count: row._count._all })),
      dataLabel: 'HISTORICAL SAFETY DATA',
      disclaimer: DISCLAIMER,
    }
  },

  async getEventTrends(filters: HistoricalFilters = {}) {
    const rows = await prisma.historicalSafetyEvent.groupBy({ by: ['eventYear'], where: buildEventWhere(filters), _count: { _all: true }, orderBy: { eventYear: 'asc' } })
    return { trends: rows.map((row) => ({ year: row.eventYear, count: row._count._all })), dataLabel: 'HISTORICAL SAFETY DATA', disclaimer: DISCLAIMER }
  },

  async getEventTypes(filters: HistoricalFilters = {}) {
    const rows = await prisma.historicalSafetyEvent.groupBy({ by: ['eventType'], where: buildEventWhere(filters), _count: { _all: true }, orderBy: { eventType: 'asc' } })
    return { eventTypes: rows.map((row) => ({ type: row.eventType, eventType: row.eventType, count: row._count._all })), dataLabel: 'HISTORICAL SAFETY DATA', disclaimer: DISCLAIMER }
  },

  async listDevices(query: HistoricalFilters & { search?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
    const eventWhere = buildEventWhere({ ...query, deviceSearch: query.search })
    const where: any = { events: { some: eventWhere } }
    const [devices, total] = await Promise.all([prisma.historicalDevice.findMany({ where, include: { manufacturer: true, _count: { select: { events: true } } }, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }), prisma.historicalDevice.count({ where })])
    return { devices: devices.map((d) => ({ ...d, eventCount: d._count.events })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, dataLabel: 'HISTORICAL SAFETY DATA' }
  },

  async listManufacturers(query: HistoricalFilters & { search?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
    const eventWhere = buildEventWhere(query)
    const where: any = {
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      events: { some: eventWhere },
    }
    const [manufacturers, total] = await Promise.all([prisma.historicalManufacturer.findMany({ where, include: { _count: { select: { events: true, devices: true } } }, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }), prisma.historicalManufacturer.count({ where })])
    return { manufacturers: manufacturers.map((m) => ({ ...m, eventCount: m._count.events, deviceCount: m._count.devices })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, dataLabel: 'HISTORICAL SAFETY DATA' }
  },

  async listCountries() {
    const rows = await prisma.historicalSafetyEvent.groupBy({ by: ['country'], _count: { _all: true }, orderBy: { country: 'asc' } })
    return { countries: rows.map((row) => ({ country: row.country, eventCount: row._count._all })), dataLabel: 'HISTORICAL SAFETY DATA' }
  },

  async getEvent(id: string) {
    const event = await prisma.historicalSafetyEvent.findUnique({ where: { id }, include: { device: true, manufacturer: true } })
    return event ? { ...eventItem(event), rawData: event.rawData } : null
  },

  async getDevice(id: string) {
    return prisma.historicalDevice.findUnique({ where: { id }, include: { manufacturer: true, _count: { select: { events: true } } } })
  },
  async getManufacturer(id: string) {
    return prisma.historicalManufacturer.findUnique({ where: { id }, include: { _count: { select: { events: true, devices: true } } } })
  },
  async listEvents(filters: HistoricalFilters & { search?: string; page?: number; limit?: number } = {}) {
    if (!filters.deviceId && !filters.manufacturerId) {
      const where = buildEventWhere({ ...filters, deviceSearch: filters.search, manufacturerSearch: filters.search })
      const page = Math.max(1, Number(filters.page) || 1); const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20))
      const [events, total] = await Promise.all([
        prisma.historicalSafetyEvent.findMany({ where, include: { device: true, manufacturer: true }, orderBy: [{ eventYear: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
        prisma.historicalSafetyEvent.count({ where }),
      ])
      return { records: events.map(eventItem), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, dataLabel: 'HISTORICAL SAFETY DATA', disclaimer: DISCLAIMER }
    }
    const page = Math.max(1, Number(filters.page) || 1); const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20))
    const where: any = {}
    if (filters.deviceId) where.deviceId = String(filters.deviceId)
    if (filters.manufacturerId) where.manufacturerId = String(filters.manufacturerId)
    if (filters.country && filters.country !== 'ALL') where.country = filters.country
    if (filters.eventType && filters.eventType !== 'ALL') where.eventType = filters.eventType
    if (filters.from || filters.to) Object.assign(where, buildEventWhere(filters).eventDate ? { eventDate: buildEventWhere(filters).eventDate } : {})
    const [events, total] = await Promise.all([
      prisma.historicalSafetyEvent.findMany({ where, include: { device: true, manufacturer: true }, orderBy: [{ eventYear: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.historicalSafetyEvent.count({ where }),
    ])
    return { records: events.map(eventItem), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, dataLabel: 'HISTORICAL SAFETY DATA', disclaimer: DISCLAIMER }
  },
}
