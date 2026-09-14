import { SOCKET_URL } from '@/config/app'
import type { ConnectionState } from '@/types'
import { io, type Socket } from 'socket.io-client'

type Handler = (payload: unknown) => void

const listeners = new Map<string, Set<Handler>>()

let socket: Socket | null = null
let state: ConnectionState = 'offline'
let stateListeners = new Set<(s: ConnectionState) => void>()
const joinedEquipmentRooms = new Set<string>()

function setState(next: ConnectionState) {
  state = next
  stateListeners.forEach((fn) => fn(state))
}

export function getConnectionState() {
  return state
}

export function subscribeConnection(fn: (s: ConnectionState) => void) {
  stateListeners.add(fn)
  fn(state)
  return () => {
    stateListeners.delete(fn)
  }
}

export function onRealtime(event: string, handler: Handler) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(handler)
  return () => listeners.get(event)?.delete(handler)
}

export function emitLocal(event: string, payload: unknown) {
  listeners.get(event)?.forEach((h) => h(payload))
}

export function connectRealtime() {
  if (!SOCKET_URL) {
    setState('offline')
    return
  }
  if (socket) return
  setState('reconnecting')
  const token = localStorage.getItem('mediguard.token')
  socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    auth: { token },
  })
  socket.on('connect', () => {
    setState('connected')
    joinedEquipmentRooms.forEach((equipmentId) => {
      socket?.emit('join:equipment', { equipmentId })
    })
  })
  socket.on('disconnect', () => setState(socket?.active ? 'reconnecting' : 'offline'))
  socket.on('connect_error', () => setState('reconnecting'))
  socket.on('reconnect_attempt', () => setState('reconnecting'))
  const events = [
    'equipment:update',
    'telemetry:update',
    'prediction:update',
    'risk:changed',
    'safety:created',
    'safety:acknowledged',
    'safety:assigned',
    'safety:escalated',
    'safety:resolved',
    'safety:dismissed',
    'notification:created',
    'maintenance:created',
    'maintenance:updated',
    'maintenance:assigned',
    'maintenance:scheduled',
    'maintenance:started',
    'maintenance:completed',
    'maintenance:cancelled',
    'equipment:status_changed',
    'dataset:activated',
    'simulation:started',
    'simulation:updated',
    'simulation:completed',
  ]
  events.forEach((event) => {
    socket?.on(event, (payload: unknown) => emitLocal(event, payload))
  })
}

export function joinEquipmentRoom(equipmentId: string) {
  joinedEquipmentRooms.add(equipmentId)
  if (socket && socket.connected) {
    socket.emit('join:equipment', { equipmentId })
  }
}

export function leaveEquipmentRoom(equipmentId: string) {
  joinedEquipmentRooms.delete(equipmentId)
  if (socket && socket.connected) {
    socket.emit('leave:equipment', { equipmentId })
  }
}

export function disconnectRealtime() {
  socket?.disconnect()
  socket = null
  joinedEquipmentRooms.clear()
  setState('offline')
}
