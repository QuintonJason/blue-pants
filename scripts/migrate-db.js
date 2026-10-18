// Apply the checked-in migrations in drizzle/ to the database:
// `node scripts/migrate-db.js`. Runs after the backup in `npm run dev`.
//
// This replaced `drizzle-kit push`, which compares schema.ts with the database
// and changes the database to match, rebuilding tables if it decides to. A
// migration is SQL that's written down, reviewed and committed before it runs.
//
// A database created by the old push already has the tables in the baseline
// migration (drizzle/0000_baseline.sql). If it has every column the baseline
// creates, the baseline is recorded as applied instead of run; if it is missing
// any, nothing is changed and the script stops, rather than guess.
// Same environment as the app, so TRANSCRIPT_* settings in .env.local apply here too.
require('@next/env').loadEnvConfig(process.cwd())
const Database = require('better-sqlite3')
const { drizzle } = require('drizzle-orm/better-sqlite3')
const { migrate } = require('drizzle-orm/better-sqlite3/migrator')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MIGRATIONS = path.join(__dirname, '..', 'drizzle')
const BASELINE = '0000_baseline'

const dataDir = path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })
const dbPath = path.join(dataDir, process.env.TRANSCRIPT_DB_FILE || 'transcript.db')
const sqlite = new Database(dbPath)

try {
  adoptPushedDatabase()
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS })
  console.log(`Database is up to date (${path.relative(process.cwd(), dbPath)})`)
} catch (error) {
  console.error('Database migration failed:', error.message || error)
  process.exitCode = 1
} finally {
  sqlite.close()
}

function adoptPushedDatabase() {
  const hasTable = name =>
    !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  if (hasTable('__drizzle_migrations') || !hasTable('submissions')) return

  const snapshot = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '0000_snapshot.json'), 'utf8'))
  const missing = Object.entries(snapshot.tables).flatMap(([table, { columns }]) => {
    const present = new Set(sqlite.prepare(`PRAGMA table_info(\`${table}\`)`).all().map(c => c.name))
    return Object.keys(columns).filter(column => !present.has(column)).map(column => `${table}.${column}`)
  })
  if (missing.length > 0) {
    throw new Error(
      `this database predates the baseline migration and is missing ${missing.join(', ')}. ` +
        'Nothing was changed. Bring it up to the baseline once with `npx drizzle-kit push`, then run this again.'
    )
  }

  // Recorded the way drizzle's migrator records a migration it ran itself.
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'))
  const entry = journal.entries.find(e => e.tag === BASELINE)
  const sql = fs.readFileSync(path.join(MIGRATIONS, `${BASELINE}.sql`), 'utf8')
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
  )
  sqlite
    .prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)')
    .run(crypto.createHash('sha256').update(sql).digest('hex'), entry.when)
  console.log('Existing database recorded as matching the baseline migration')
}
