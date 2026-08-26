/**
 * Session tokens
 *
 * Tokens are HMAC-SHA256 signed: the cookie carries only a payload and its
 * signature, never the secret itself. Forging one requires the secret, so a
 * client cannot mint a session it was not given.
 *
 * Uses Web Crypto rather than node:crypto so a single implementation runs in
 * both the Edge middleware and the Node route handlers.
 */

export const SESSION_COOKIE_NAME = 'transcript_session'

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000

/** Minimum secret length. 32 chars of hex is 128 bits of entropy. */
export const MIN_SECRET_LENGTH = 32

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters. ` +
        'Copy .env.example to .env.local and fill in a random value.'
    )
  }
  return secret
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toBase64Url(new Uint8Array(signature))
}

/** Compares without early-exit, so timing does not reveal how much matched. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Mints a signed token for a freshly authenticated session. */
export async function createSessionToken(issuedAt = Date.now()): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ iat: issuedAt })))
  return `${payload}.${await sign(payload)}`
}

/** True only for a token this server signed, that has not yet expired. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, signature] = parts
  if (!payload || !signature) return false

  let expected: string
  try {
    expected = await sign(payload)
  } catch {
    // A missing or too-short secret must fail closed, never open.
    return false
  }
  if (!constantTimeEquals(signature, expected)) return false

  // Signature is valid, so the payload is ours to trust. Enforce expiry.
  try {
    const { iat } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    if (typeof iat !== 'number' || !Number.isFinite(iat)) return false
    const age = Date.now() - iat
    return age >= 0 && age < SESSION_MAX_AGE_MS
  } catch {
    return false
  }
}
