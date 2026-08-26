import bcrypt from 'bcryptjs'
import { db } from './db'
import { teachers } from './db/schema'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from './session'

const SALT_ROUNDS = 10

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

// Set session cookie
export async function setSessionCookie(): Promise<void> {
  const token = await createSessionToken()
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
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
