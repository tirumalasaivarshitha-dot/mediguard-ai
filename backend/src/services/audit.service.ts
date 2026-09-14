import { prisma } from '../config/database'
import { Prisma } from '@prisma/client'

export const auditService = {
  async log(params: {
    userId?: string
    action: string
    entityType: string
    entityId: string
    details?: Record<string, unknown>
    ipAddress?: string
  }) {
    try {
      return await prisma.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          details: params.details ? (params.details as Prisma.InputJsonValue) : undefined,
          ipAddress: params.ipAddress,
        },
      })
    } catch (error) {
      console.error('[AuditLog] Failed to record audit log:', error)
      return null
    }
  },
}
