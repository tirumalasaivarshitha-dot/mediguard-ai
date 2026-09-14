import { Router, Response } from 'express'
import { authenticateToken } from '../middleware/auth'
import { prisma } from '../config/database'
import { ApiResponse } from '../types'

const router = Router()

router.get('/', authenticateToken, async (req: any, res: Response<ApiResponse>) => {
  try {
    const role = String(req.user?.role || '').toUpperCase()
    const department = req.query.department as string | undefined
    const where: any = { user: { isActive: true } }
    if (department) where.department = department

    const profiles = await prisma.technicianProfile.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true, department: true } } },
      orderBy: { workload: 'asc' },
    })

    return res.status(200).json({
      success: true,
      message: 'Technicians retrieved successfully',
      data: profiles.map((profile) => ({
        id: profile.id,
        userId: profile.userId,
        name: profile.user.name,
        role: profile.user.role,
        expertise: profile.expertise,
        certifications: profile.certifications,
        department: profile.department,
        location: profile.location,
        availability: profile.availability,
        currentWorkload: profile.workload,
        assignedEquipmentIds: [],
      })),
    })
  } catch (error: any) {
    console.error(`[Technicians] PostgreSQL read failed: ${error?.message || error}`)
    return res.status(503).json({ success: false, message: 'Technician data is unavailable.' })
  }
})

export default router
