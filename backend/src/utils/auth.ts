import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import { env } from '../config/env'
import { SessionUser } from '../types'

const SALT_ROUNDS = 10

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(user: SessionUser): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  }
  return jwt.sign({ user }, env.JWT_SECRET, options)
}

export function verifyToken(token: string): SessionUser | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { user: SessionUser }
    return decoded.user
  } catch {
    return null
  }
}
