import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const sqlite = new Database(path.join(dataDir, 'transcript.db'))
export const db = drizzle(sqlite, { schema })

// Schema lives in schema.ts and is applied by `drizzle-kit push`, which `npm run
// dev` runs first. Hand-written CREATE TABLE statements used to live here too and
// drifted out of sync with schema.ts, so there is deliberately no DDL in this file.

// Export schema for use elsewhere
export { schema }
