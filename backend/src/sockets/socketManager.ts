import { Server as HttpServer } from 'http'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { env } from '../config/env'
import { verifyToken } from '../utils/auth'
import { equipmentService, UserScope } from '../services/equipment.service'

export type SocketEvent =
  | 'equipment:update'
  | 'telemetry:update'
  | 'prediction:update'
  | 'risk:changed'
  | 'alert:created'
  | 'safety:created'
  | 'safety:acknowledged'
  | 'safety:assigned'
  | 'safety:escalated'
  | 'safety:resolved'
  | 'safety:dismissed'
  | 'notification:created'
  | 'maintenance:updated'
  | 'maintenance:created'
  | 'maintenance:assigned'
  | 'maintenance:scheduled'
  | 'maintenance:started'
  | 'maintenance:completed'
  | 'maintenance:cancelled'
  | 'equipment:status_changed'
  | 'dataset:processed'
  | 'dataset:activated'

export interface AuthenticatedSocket extends Socket {
  user?: {
    id: string
    name: string
    email: string
    role: string
    department?: string
  }
}

class SocketManager {
  private io: SocketIOServer | null = null

  public init(server: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: env.FRONTEND_URL,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    })

    // Socket Authentication Middleware
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')

      if (!token) {
        return next(new Error('Authentication required'))
      }

      try {
        const decoded = verifyToken(token)
        if (!decoded) return next(new Error('Invalid or expired token'))
        socket.user = decoded
        return next()
      } catch {
        return next(new Error('Invalid or expired token'))
      }
    })

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      if (env.NODE_ENV === 'development') {
        console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${socket.user?.email || 'Anonymous'})`)
      }

      // Room join handler with RBAC equipment access scope check
      socket.on('join:equipment', async (payload: { equipmentId: string }) => {
        if (!payload || !payload.equipmentId) return

        if (!socket.user) {
          socket.emit('socket:error', { message: 'Authentication required', equipmentId: payload.equipmentId })
          return
        }

        const scope: UserScope = {
          userId: socket.user.id,
          role: socket.user.role,
          department: socket.user.department,
        }
        const eq = await equipmentService.getEquipmentById(payload.equipmentId, scope)
        if (!eq || eq === 'FORBIDDEN') {
          socket.emit('socket:error', {
            message: 'Access denied: You do not have permission to join telemetry room for this equipment.',
            equipmentId: payload.equipmentId,
          })
          return
        }

        socket.join(`equipment:${payload.equipmentId}`)
        socket.emit('room:joined', { equipmentId: payload.equipmentId })
      })

      // Room leave handler
      socket.on('leave:equipment', (payload: { equipmentId: string }) => {
        if (payload?.equipmentId) {
          socket.leave(`equipment:${payload.equipmentId}`)
        }
      })

      socket.on('disconnect', (reason) => {
        if (env.NODE_ENV === 'development') {
          console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`)
        }
      })
    })

    return this.io
  }

  public emit(event: SocketEvent, data: unknown): void {
    if (!this.io) {
      console.warn('[Socket.IO] Cannot emit event, Socket.IO server not initialized.')
      return
    }
    this.io.emit(event, data)
  }

  public emitToRoom(room: string, event: SocketEvent, data: unknown): void {
    if (!this.io) {
      console.warn('[Socket.IO] Cannot emit to room, Socket.IO server not initialized.')
      return
    }
    this.io.to(room).emit(event, data)
  }

  public getIO(): SocketIOServer | null {
    return this.io
  }
}

export const socketManager = new SocketManager()
