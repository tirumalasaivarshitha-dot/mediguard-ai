import { PrismaClient } from '@prisma/client'
import { env } from './env'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (env.NODE_ENV !== 'production') {
  global.prisma = prisma
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    if (env.NODE_ENV === 'development') {
      console.warn('[Database] Connection check warning/error:', error instanceof Error ? error.message : error)
    }
    return false
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect()
    console.log('[Database] Prisma client disconnected cleanly.')
  } catch (error) {
    console.error('[Database] Error during Prisma disconnect:', error)
  }
}
