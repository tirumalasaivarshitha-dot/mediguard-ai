import { Router, Response } from 'express'
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth'
import { notificationService } from '../services/notification.service'
import { ApiResponse } from '../types'

const router = Router()

/**
 * GET /api/notifications
 * Fetch notifications for authenticated user with unread count
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }

    const unreadOnly = req.query.unreadOnly === 'true'
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50

    const { notifications, unreadCount } = await notificationService.listUserNotifications(userId, {
      unreadOnly,
      limit,
    })

    return res.status(200).json({
      success: true,
      message: 'Notifications fetched successfully',
      data: {
        records: notifications,
        unreadCount,
      },
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch notifications',
    })
  }
})

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const userId = req.user?.id
    const notificationId = String(req.params.id)

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }

    const updated = await notificationService.markAsRead(notificationId, userId)
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' })
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: updated,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update notification',
    })
  }
})

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for current user
 */
router.patch('/read-all', authenticateToken, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }

    const result = await notificationService.markAllAsRead(userId)

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: result,
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to mark notifications as read',
    })
  }
})

export default router
