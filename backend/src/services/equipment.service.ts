import { prisma } from '../config/database'
import { EquipmentStatus, Criticality, Prisma } from '@prisma/client'

export interface UserScope {
  userId: string
  role: 'admin' | 'biomedical_engineer' | 'maintenance_technician' | string
  department?: string
}

export interface EquipmentFilterParams {
  search?: string
  department?: string
  equipmentType?: string
  status?: EquipmentStatus
  criticality?: Criticality
  assignedTechnicianId?: string
  manufacturer?: string
  riskClass?: string
  country?: string
  sourceDatasetId?: string
  historicalOnly?: boolean
  page?: number
  limit?: number
  operationalDataset?: boolean
}

async function addHistoricalDetails<T extends { sourceDatasetId: string | null; sourceIdentifier: string | null }>(records: T[]) {
  const identifiers = records.filter((record) => record.sourceDatasetId && record.sourceIdentifier).map((record) => record.sourceIdentifier!)
  if (!identifiers.length) return records
  const devices = await prisma.historicalDevice.findMany({
    where: { sourceId: { in: identifiers } },
    include: {
      manufacturer: { select: { name: true, country: true } },
      _count: { select: { events: true } },
      events: {
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { eventType: true, actionTaken: true, eventDate: true, country: true, description: true },
      },
    },
  })
  const bySourceId = new Map(devices.map((device) => [device.sourceId, device]))
  return records.map((record) => {
    const device = record.sourceIdentifier ? bySourceId.get(record.sourceIdentifier) : undefined
    if (!device) return record
    return {
      ...record,
      historicalDetails: {
        deviceName: device.name,
        manufacturerName: device.manufacturer.name,
        classification: device.classification,
        deviceCode: device.deviceCode,
        riskClass: device.riskClass,
        country: device.country,
        modelNumber: device.modelNumber,
        manufacturerCountry: device.manufacturer.country,
        eventCount: device._count.events,
        lastEvent: device.events[0] || null,
      },
    }
  })
}

export const equipmentService = {
  async getFilterOptions(scope: UserScope, operationalDataset = false) {
    const where: Prisma.EquipmentWhereInput = {}
    let activeDataset: { id: string; name: string; datasetType: string } | null = null
    if (operationalDataset) {
      activeDataset = await prisma.dataset.findFirst({ where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } }, select: { id: true, name: true, datasetType: true } })
      where.sourceDatasetId = activeDataset?.id || '__NO_ACTIVE_DATASET__'
    }
    const roleUpper = scope.role.toUpperCase()
    if (roleUpper === 'TECHNICIAN' || roleUpper === 'MAINTENANCE_TECHNICIAN') {
      const profile = await prisma.technicianProfile.findUnique({ where: { userId: scope.userId } })
      where.assignedTechnicianId = profile?.id || scope.userId
    }
    const [types, departments, manufacturers, models, dataSources] = await Promise.all([
      prisma.equipment.findMany({ where, distinct: ['equipmentType'], select: { equipmentType: true }, orderBy: { equipmentType: 'asc' } }),
      prisma.equipment.findMany({ where, distinct: ['department'], select: { department: true }, orderBy: { department: 'asc' } }),
      prisma.equipment.findMany({ where, distinct: ['manufacturer'], select: { manufacturer: true }, orderBy: { manufacturer: 'asc' } }),
      prisma.equipment.findMany({ where, distinct: ['model'], select: { model: true }, orderBy: { model: 'asc' } }),
      prisma.equipment.findMany({ where, distinct: ['sourceDatasetId'], select: { sourceDatasetId: true, sourceDatasetName: true }, orderBy: { sourceDatasetName: 'asc' } }),
    ])
    const historicalManufacturers = activeDataset?.datasetType === 'HISTORICAL_SAFETY'
      ? await prisma.historicalManufacturer.findMany({ distinct: ['name'], select: { name: true }, orderBy: { name: 'asc' } })
      : []
    return {
      types: types.map((item) => item.equipmentType),
      departments: departments.map((item) => item.department),
      manufacturers: historicalManufacturers.length ? historicalManufacturers.map((item) => item.name) : manufacturers.map((item) => item.manufacturer),
      models: models.map((item) => item.model),
      dataSources: dataSources.filter((item) => item.sourceDatasetId).map((item) => ({ id: item.sourceDatasetId!, name: item.sourceDatasetName || item.sourceDatasetId! })),
      activeDataset: activeDataset ? { id: activeDataset.id, name: activeDataset.name, datasetType: activeDataset.datasetType } : null,
      historicalRiskClasses: await prisma.historicalDevice.findMany({ distinct: ['riskClass'], where: { riskClass: { not: null } }, select: { riskClass: true }, orderBy: { riskClass: 'asc' } }).then((rows) => rows.map((row) => row.riskClass!)),
      historicalCountries: await prisma.historicalDevice.findMany({ distinct: ['country'], where: { country: { not: null } }, select: { country: true }, orderBy: { country: 'asc' } }).then((rows) => rows.map((row) => row.country!)),
    }
  },

  async listEquipment(params: EquipmentFilterParams, scope: UserScope) {
    const page = Math.max(1, params.page || 1)
    const limit = Math.min(100, Math.max(1, params.limit || 20))
    const skip = (page - 1) * limit

    const where: Prisma.EquipmentWhereInput = {}
    if (params.operationalDataset) {
      const activeDataset = await prisma.dataset.findFirst({ where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } }, select: { id: true } })
      where.sourceDatasetId = activeDataset?.id || '__NO_ACTIVE_DATASET__'
    }
    if (params.sourceDatasetId) where.sourceDatasetId = params.sourceDatasetId
    if (params.historicalOnly) where.sourceDataset = { datasetType: 'HISTORICAL_SAFETY' }
    if (params.manufacturer && (params.historicalOnly || params.operationalDataset) || params.riskClass || params.country) {
      const historicalDevices = await prisma.historicalDevice.findMany({
        where: {
          ...(params.manufacturer && (params.historicalOnly || params.operationalDataset)
            ? { manufacturer: { name: { equals: params.manufacturer, mode: 'insensitive' } } }
            : {}),
          ...(params.riskClass ? { riskClass: params.riskClass } : {}),
          ...(params.country ? { country: params.country } : {}),
        },
        select: { sourceId: true },
      })
      where.sourceIdentifier = { in: historicalDevices.map((device) => device.sourceId) }
    }

    // Role-based scoping
    const roleUpper = scope.role.toUpperCase()
    if (roleUpper === 'TECHNICIAN' || roleUpper === 'MAINTENANCE_TECHNICIAN') {
      // Find technician profile ID or filter by assigned technician
      const profile = await prisma.technicianProfile.findUnique({ where: { userId: scope.userId } })
      if (profile) where.assignedTechnicianId = profile.id
      else where.assignedTechnicianId = scope.userId
    }

    // Query parameters
    if (params.department) {
      where.department = params.department
    }
    if (params.equipmentType) where.equipmentType = params.equipmentType
    if (params.manufacturer) where.manufacturer = params.manufacturer
    if (params.status) where.status = params.status
    if (params.criticality) where.criticality = params.criticality
    if (params.assignedTechnicianId) where.assignedTechnicianId = params.assignedTechnicianId

    if (params.search) {
      const q = params.search.trim()
      where.OR = [
        { equipmentCode: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { manufacturer: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
      ]
    }

    try {
      const [total, records] = await Promise.all([
        prisma.equipment.count({ where }),
        prisma.equipment.findMany({
          where,
          skip,
          take: limit,
          include: {
            sourceDataset: { select: { id: true, name: true, datasetType: true, source: true, isOperational: true } },
            assignedTechnician: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
          orderBy: { failureRisk: 'desc' },
        }),
      ])

      return {
        records: await addHistoricalDetails(records),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      }
    } catch (error: any) {
      console.error(`[Equipment] PostgreSQL read failed: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async getEquipmentById(id: string, scope?: UserScope, operationalDataset = false) {
    try {
      const item = await prisma.equipment.findUnique({
        where: { id },
        include: {
          sourceDataset: { select: { id: true, name: true, source: true, datasetType: true, isOperational: true, provenance: true } },
          assignedTechnician: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          assessments: { take: 5, orderBy: { assessedAt: 'desc' } },
          telemetryReadings: { take: 10, orderBy: { timestamp: 'desc' } },
          workOrders: { take: 10, orderBy: { createdAt: 'desc' } },
          safetyAlerts: { take: 10, orderBy: { createdAt: 'desc' } },
        },
      })

      if (!item) return null
      if (operationalDataset) {
        const activeDataset = await prisma.dataset.findFirst({ where: { isOperational: true, datasetType: { not: 'HISTORICAL_SAFETY' } }, select: { id: true } })
        if (!activeDataset || item.sourceDatasetId !== activeDataset.id) return null
      }

      // Check scope permission
      if (scope) {
        const roleUpper = scope.role.toUpperCase()
      }

      const enriched = await addHistoricalDetails([item])
      return enriched[0] as typeof item | 'FORBIDDEN'
    } catch (error: any) {
      console.error(`[Equipment] PostgreSQL read failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async getEquipmentByCode(equipmentCode: string, scope?: UserScope) {
    try {
      const item = await prisma.equipment.findUnique({
        where: { equipmentCode },
        include: {
          assignedTechnician: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      })
      if (!item) return null

      if (scope) {
        const roleUpper = scope.role.toUpperCase()
      }

      return item as typeof item | 'FORBIDDEN'
    } catch (error: any) {
      console.error(`[Equipment] PostgreSQL read failed for code ${equipmentCode}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async createEquipment(data: {
    equipmentCode: string
    name: string
    equipmentType: string
    manufacturer: string
    model: string
    serialNumber: string
    department: string
    location: string
    installationDate?: Date
    warrantyExpiry?: Date
    operatingHours?: number
    criticality?: Criticality
  }) {
    try {
      // Check for duplicates
      const existingCode = await prisma.equipment.findUnique({ where: { equipmentCode: data.equipmentCode } })
      if (existingCode) throw new Error('DUPLICATE_CODE')

      const existingSerial = await prisma.equipment.findUnique({ where: { serialNumber: data.serialNumber } })
      if (existingSerial) throw new Error('DUPLICATE_SERIAL')

      return await prisma.equipment.create({
        data: {
          equipmentCode: data.equipmentCode,
          name: data.name,
          equipmentType: data.equipmentType,
          manufacturer: data.manufacturer,
          model: data.model,
          serialNumber: data.serialNumber,
          department: data.department,
          location: data.location,
          installationDate: data.installationDate,
          warrantyExpiry: data.warrantyExpiry,
          operatingHours: data.operatingHours || 0,
          criticality: data.criticality || Criticality.MEDIUM,
          status: EquipmentStatus.OPERATIONAL,
        },
      })
    } catch (error) {
      if (error instanceof Error && (error.message === 'DUPLICATE_CODE' || error.message === 'DUPLICATE_SERIAL')) {
        throw error
      }
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async updateEquipment(
    id: string,
    data: Partial<{
      name: string
      equipmentType: string
      manufacturer: string
      model: string
      department: string
      location: string
      installationDate: Date
      warrantyExpiry: Date
      operatingHours: number
      criticality: Criticality
    }>,
  ) {
    try {
      return await prisma.equipment.update({
        where: { id },
        data,
      })
    } catch (error: any) {
      console.error(`[Equipment] PostgreSQL update failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async updateEquipmentStatus(id: string, status: EquipmentStatus) {
    try {
      return await prisma.equipment.update({
        where: { id },
        data: { status },
      })
    } catch (error: any) {
      console.error(`[Equipment] PostgreSQL status update failed for ${id}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async assignTechnician(id: string, technicianId: string) {
    try {
      const tech = await prisma.technicianProfile.findFirst({
        where: { OR: [{ id: technicianId }, { userId: technicianId }] },
        include: { user: true },
      })

      if (!tech || !tech.user.isActive) {
        throw new Error('INVALID_TECHNICIAN')
      }

      return await prisma.equipment.update({
        where: { id },
        data: { assignedTechnicianId: tech.id },
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_TECHNICIAN') throw error
      console.error(`[Equipment] PostgreSQL technician assignment failed for ${id}: ${error instanceof Error ? error.message : error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },
}
