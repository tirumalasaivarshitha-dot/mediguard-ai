import { PrismaClient, UserRole, EquipmentStatus, Criticality, WorkOrderType, WorkOrderStatus, Priority, AlertSeverity, AlertStatus, NotificationType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function ensureSeedUser(data: {
  employeeId: string
  name: string
  email: string
  role: UserRole
  department: string
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { ...data, passwordHash: await bcrypt.hash('MediGuardDev!2026', 10), isActive: true },
    })
  }
  return prisma.user.upsert({
    where: { employeeId: data.employeeId },
    update: { ...data, passwordHash: await bcrypt.hash('MediGuardDev!2026', 10), isActive: true },
    create: { ...data, passwordHash: await bcrypt.hash('MediGuardDev!2026', 10) },
  })
}

async function main() {
  console.log('[Seed] Starting database seed with DEMO DATA...')

  // Development-only seed password. Never use this value in production.
  const defaultPassword = await bcrypt.hash('MediGuardDev!2026', 10)

  // Seed Users
  const admin = await ensureSeedUser({
    employeeId: 'ADM001',
    name: 'Meredith Chen (DEMO)',
    email: 'mchen@riverside.hospital',
    role: UserRole.ADMIN,
    department: 'Administration',
  })

  const biomed = await ensureSeedUser({
    employeeId: 'BIO001',
    name: 'Rahul Kumar (DEMO)',
    email: 'rkumar@riverside.hospital',
    role: UserRole.BIOMEDICAL_ENGINEER,
    department: 'Radiology',
  })

  const techUser = await ensureSeedUser({
    employeeId: 'TEC001',
    name: 'James Okonkwo (DEMO)',
    email: 'jokonkwo@riverside.hospital',
    role: UserRole.TECHNICIAN,
    department: 'Emergency',
  })

  // Seed Technician Profile
  const techProfile = await prisma.technicianProfile.upsert({
    where: { userId: techUser.id },
    update: { employeeCode: 'TECH-104', department: 'Emergency', location: 'Building A, Fl 2', availability: 'Available', workload: 2 },
    create: {
      userId: techUser.id,
      employeeCode: 'TECH-104',
      expertise: ['MRI', 'CT', 'Radiology Equipment'],
      certifications: ['Certified Biomedical Equipment Technician (CBET)'],
      department: 'Emergency',
      location: 'Building A, Fl 2',
      availability: 'Available',
      workload: 2,
    },
  })

  // Seed Equipment
  const eq1 = await prisma.equipment.upsert({
    where: { equipmentCode: 'MRI-042' },
    update: { assignedTechnicianId: techProfile.id },
    create: {
      equipmentCode: 'MRI-042',
      name: 'High-Field MRI Scanner',
      equipmentType: 'MRI Scanner',
      manufacturer: 'Siemens Healthineers',
      model: 'MAGNETOM Vida 3T',
      serialNumber: 'SN-MRI-2023-042',
      department: 'Radiology',
      location: 'Imaging Suite 2',
      installationDate: new Date('2022-03-15'),
      operatingHours: 8420,
      criticality: Criticality.HIGH,
      status: EquipmentStatus.ATTENTION_REQUIRED,
      healthScore: 68,
      failureRisk: 58,
      assignedTechnicianId: techProfile.id,
    },
  })

  const eq2 = await prisma.equipment.upsert({
    where: { equipmentCode: 'VENT-018' },
    update: {},
    create: {
      equipmentCode: 'VENT-018',
      name: 'ICU Mechanical Ventilator',
      equipmentType: 'Ventilator',
      manufacturer: 'Hamilton Medical',
      model: 'HAMILTON-G5',
      serialNumber: 'SN-VENT-2021-018',
      department: 'Emergency',
      location: 'ICU Bed 04',
      installationDate: new Date('2021-08-10'),
      operatingHours: 12450,
      criticality: Criticality.CRITICAL,
      status: EquipmentStatus.OPERATIONAL,
      healthScore: 92,
      failureRisk: 14,
    },
  })

  // Seed Telemetry
  if (await prisma.telemetryReading.count({ where: { equipmentId: eq1.id } }) === 0) {
    await prisma.telemetryReading.createMany({
      data: [
      {
        equipmentId: eq1.id,
        temperature: 51.4,
        vibration: 2.8,
        powerConsumption: 14.2,
        errorCount: 7,
        operatingHours: 8420,
      },
      {
        equipmentId: eq2.id,
        temperature: 24.1,
        vibration: 0.3,
        powerConsumption: 0.8,
        pressure: 18.5,
        errorCount: 0,
        operatingHours: 12450,
      },
      ],
    })
  }

  // Seed Maintenance Work Order
  const workOrder = await prisma.maintenanceWorkOrder.upsert({
    where: { workOrderCode: 'WO-DEV-MRI-001' },
    update: { assignedTechnicianId: techProfile.id, createdById: admin.id },
    create: {
      workOrderCode: 'WO-DEV-MRI-001',
      equipmentId: eq1.id,
      assignedTechnicianId: techProfile.id,
      createdById: admin.id,
      title: 'Cryogen Level & Cooling System Inspection',
      description: 'Scheduled preventive check following elevated temperature reading.',
      type: WorkOrderType.PREVENTIVE,
      priority: Priority.HIGH,
      status: WorkOrderStatus.ASSIGNED,
      scheduledAt: new Date(Date.now() + 86400000 * 2),
      estimatedCost: 1250.00,
    },
  })

  // Seed Safety Alert
  const existingAlert = await prisma.safetyAlert.findFirst({ where: { equipmentId: eq1.id, title: 'Elevated Temperature & Cooling Anomaly' } })
  const alert = existingAlert || await prisma.safetyAlert.create({
    data: {
      equipmentId: eq1.id,
      title: 'Elevated Temperature & Cooling Anomaly',
      description: 'Helium compressor coolant temperature exceeds upper baseline threshold (51.4°C vs 45°C norm).',
      severity: AlertSeverity.HIGH,
      status: AlertStatus.OPEN,
      assignedToId: techProfile.id,
    },
  })

  // Seed Notification
  if (!await prisma.notification.findFirst({ where: { userId: biomed.id, title: 'High Risk Alert: MRI-042' } })) {
    await prisma.notification.create({
      data: {
      userId: biomed.id,
      title: 'High Risk Alert: MRI-042',
      message: 'MRI Scanner MRI-042 failure risk increased to 58%.',
      type: NotificationType.HIGH_RISK,
      severity: AlertSeverity.HIGH,
      relatedEquipmentId: eq1.id,
      relatedAlertId: alert.id,
      },
    })
  }

  console.log('[Seed] Demo data seeding completed successfully.')
}

main()
  .catch((e) => {
    console.error('[Seed] Failed to seed database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
