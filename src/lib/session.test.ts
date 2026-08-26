import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSessionToken, verifySessionToken } from './session'

const SECRET = 'a'.repeat(64)
const OTHER_SECRET = 'b'.repeat(64)

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET
})
afterEach(() => {
  delete process.env.SESSION_SECRET
})

describe('session tokens', () => {
  it('accepts a token it just signed', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true)
  })

  it('rejects the pre-fix forgeable format', async () => {
    // The old scheme put the secret in the cookie and compared it by equality,
    // so anyone could build this from public source. It must not verify now.
    const forged = Buffer.from(`${Date.now()}:random:transcript-local-secret-key`).toString('base64')
    expect(await verifySessionToken(forged)).toBe(false)
  })

  it('rejects a token whose payload was tampered with', async () => {
    // Re-dating the payload must invalidate the signature. The substituted iat is
    // deliberately far from the original so the two payloads can never coincide.
    const token = await createSessionToken(Date.now() - 60 * 60 * 1000)
    const [, signature] = token.split('.')
    const swapped = Buffer.from(JSON.stringify({ iat: Date.now() })).toString('base64url')
    expect(await verifySessionToken(`${swapped}.${signature}`)).toBe(false)
  })

  it('rejects a token whose signature was tampered with', async () => {
    const [payload, signature] = (await createSessionToken()).split('.')
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)
    expect(await verifySessionToken(`${payload}.${flipped}`)).toBe(false)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken()
    process.env.SESSION_SECRET = OTHER_SECRET
    expect(await verifySessionToken(token)).toBe(false)
  })

  it('rejects an expired token', async () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000
    expect(await verifySessionToken(await createSessionToken(twentyFiveHoursAgo))).toBe(false)
  })

  it('rejects a token issued in the future', async () => {
    const token = await createSessionToken(Date.now() + 60 * 60 * 1000)
    expect(await verifySessionToken(token)).toBe(false)
  })

  it('fails closed when the secret is missing or too short', async () => {
    const token = await createSessionToken()
    delete process.env.SESSION_SECRET
    expect(await verifySessionToken(token)).toBe(false)
    process.env.SESSION_SECRET = 'short'
    expect(await verifySessionToken(token)).toBe(false)
  })

  it('rejects empty and malformed input', async () => {
    for (const bad of ['', undefined, null, 'nodot', 'a.b.c', '.', 'payload.']) {
      expect(await verifySessionToken(bad as string)).toBe(false)
    }
  })

  it('refuses to sign without a usable secret', async () => {
    delete process.env.SESSION_SECRET
    await expect(createSessionToken()).rejects.toThrow(/SESSION_SECRET/)
  })
})
