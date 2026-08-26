// Node 18 does not expose Web Crypto as a global inside vitest's sandbox, though
// both the Next.js Node runtime and the Edge middleware runtime do. Provide it so
// src/lib/session.ts can be tested as it actually runs in production.
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}
