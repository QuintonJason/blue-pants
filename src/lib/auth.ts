import bcrypt from 'bcryptjs'
import { db } from './db'
import { teachers } from './db/schema'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'

const SALT_ROUNDS = 10
const SESSION_COOKIE_NAME = 'transcript_session'
const SESSION_SECRET = process.env.SESSION_SECRET || 'transcript-local-secret-key'

// Hash a password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

// Verify a password against a hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Set up initial password (first run)
export async function setupPassword(password: string): Promise<void> {
  const hash = await hashPassword(password)

  // Clear any existing teacher and create new one
  const existing = await db.select().from(teachers).limit(1)
  if (existing.length > 0) {
    await db.delete(teachers)
  }

  await db.insert(teachers).values({
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  })
}

// Check if password is set up
export async function isPasswordSetup(): Promise<boolean> {
  const result = await db.select().from(teachers).limit(1)
  return result.length > 0
}

// Verify login
export async function verifyLogin(password: string): Promise<boolean> {
  const result = await db.select().from(teachers).limit(1)
  if (result.length === 0) return false

  return verifyPassword(password, result[0].passwordHash)
}

// Create a simple session token
function createSessionToken(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2)
  return Buffer.from(`${timestamp}:${random}:${SESSION_SECRET}`).toString('base64')
}

// Verify session token
function verifySessionToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return false

    const [timestamp, , secret] = parts
    if (secret !== SESSION_SECRET) return false

    // Session expires after 24 hours
    const tokenTime = parseInt(timestamp, 10)
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000

    return (now - tokenTime) < twentyFourHours
  } catch {
    return false
  }
}

// Set session cookie
export async function setSessionCookie(): Promise<void> {
  const token = createSessionToken()
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })
}

// Clear session cookie
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

// Check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)

  if (!token) return false
  return verifySessionToken(token.value)
}
