import { prisma } from '../config/database'
import { AlertSeverity, NotificationType, UserRole } from '@prisma/client'
import { socketManager } from '../sockets/socketManager'

export interface CreateNotificationInput {
  userId: string
  title: string
  message: string
  type: NotificationType
  severity?: AlertSeverity
  relatedEquipmentId?: string
  relatedAlertId?: string
}

export const notificationService = {
  async listUserNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number }) {
    try {
      const where: any = { userId }
      if (options?.unreadOnly) {
        where.isRead = false
      }

      const notifications = await prisma.notification.findMany({
        where,
        take: options?.limit || 50,
        orderBy: { createdAt: 'desc' },
        include: {
          relatedEquipment: {
            select: { id: true, equipmentCode: true, name: true, department: true },
          },
          relatedAlert: {
            select: { id: true, title: true, severity: true, status: true },
          },
        },
      })

      const unreadCount = await prisma.notification.count({
        where: { userId, isRead: false },
      })

      return { notifications, unreadCount }
    } catch (error: any) {
      console.error(`[NotificationService] PostgreSQL read failed for ${userId}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async markAsRead(notificationId: string, userId: string) {
    try {
      const notification = await prisma.notification.findFirst({
        where: { id: notificationId, userId },
      })

      if (!notification) return null

      return await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      })
    } catch (error: any) {
      console.error(`[NotificationService] PostgreSQL update failed for ${notificationId}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async markAllAsRead(userId: string) {
    try {
      return await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      })
    } catch (error: any) {
      console.error(`[NotificationService] PostgreSQL mark-all failed for ${userId}: ${error?.message || error}`)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  async createNotification(input: CreateNotificationInput) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: input.userId,
          title: input.title,
          message: input.message,
          type: input.type,
          severity: input.severity || AlertSeverity.INFO,
          relatedEquipmentId: input.relatedEquipmentId,
          relatedAlertId: input.relatedAlertId,
        },
        include: {
          relatedEquipment: {
            select: { id: true, equipmentCode: true, name: true },
          },
        },
      })

      // Emit real-time Socket.IO notification to user
      socketManager.emit('notification:created', {
        notificationId: notification.id,
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        relatedEquipmentId: notification.relatedEquipmentId,
        createdAt: notification.createdAt,
      })

      return notification
    } catch (err: any) {
      console.error('[NotificationService] Failed to create notification:', err)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },

  /**
   * Broadcast safety notifications to responsible personnel (Admins, Biomed Engineers, Dept Managers, assigned Techs)
   */
  async notifyResponsiblePersonnel(data: {
    title: string
    message: string
    type?: NotificationType
    severity?: AlertSeverity
    relatedEquipmentId?: string
    relatedAlertId?: string
    department?: string
    assignedTechnicianUserId?: string
  }) {
    try {
      // Find relevant user IDs
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { role: UserRole.ADMIN },
            { role: UserRole.BIOMEDICAL_ENGINEER },
            ...(data.assignedTechnicianUserId ? [{ id: data.assignedTechnicianUserId }] : []),
          ],
        },
        select: { id: true },
      })

      const uniqueUserIds = Array.from(new Set(users.map((u) => u.id)))

      // Batch create notifications for each recipient
      await Promise.all(
        uniqueUserIds.map((userId) =>
          this.createNotification({
            userId,
            title: data.title,
            message: data.message,
            type: data.type || NotificationType.SAFETY_ALERT,
            severity: data.severity || AlertSeverity.WARNING,
            relatedEquipmentId: data.relatedEquipmentId,
            relatedAlertId: data.relatedAlertId,
          }),
        ),
      )
    } catch (err) {
      console.error('[NotificationService] Failed to notify responsible personnel:', err)
      throw new Error('DATABASE_UNAVAILABLE')
    }
  },
}
