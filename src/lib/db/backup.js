// @ts-check
/**
 * Database backups
 *
 * The database is the grade book, so it is copied before anything that could
 * lose data: a schema update (`drizzle-kit push` can rebuild tables), a delete,
 * and at least once a day while grades are being saved. Copies are taken with
 * SQLite's online backup, so they are consistent even while the app is running.
 *
 * Copies go to data/backups, or to TRANSCRIPT_BACKUP_DIR: point that at a synced
 * folder (iCloud Drive, Dropbox, a school drive) to keep them off this machine.
 *
 * CommonJS so `npm run dev` can run it with plain node before the schema push
 * (scripts/backup-db.js) and the routes can import the same code.
 */

const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

const DAY_MS = 24 * 60 * 60 * 1000

/** How many copies of each kind to keep; a daily copy covers about a school year. */
const KEEP = {
  daily: 200,
  'before-schema-update': 30,
  'before-delete': 50,
  manual: 50,
}

/**
 * @typedef {keyof typeof KEEP} BackupReason
 * @typedef {{ dbPath?: string, dir?: string, now?: Date }} BackupOptions
 */

/** @param {BackupOptions} options */
function resolveOptions(options) {
  const dataDir = path.join(process.cwd(), 'data')
  return {
    dbPath: options.dbPath || path.join(dataDir, process.env.TRANSCRIPT_DB_FILE || 'transcript.db'),
    dir: options.dir || process.env.TRANSCRIPT_BACKUP_DIR || path.join(dataDir, 'backups'),
    now: options.now || new Date(),
  }
}

/** `transcript-daily-` for data/transcript.db: names sort oldest first after it. */
function prefixFor(/** @type {string} */ dbPath, /** @type {BackupReason} */ reason) {
  return `${path.basename(dbPath, path.extname(dbPath))}-${reason}-`
}

/**
 * Copy the database. Resolves to the copy's path, or null if there is no
 * database yet (first run).
 * @param {BackupReason} reason
 * @param {BackupOptions} [options]
 * @returns {Promise<string | null>}
 */
async function backupDatabase(reason, options = {}) {
  const { dbPath, dir, now } = resolveOptions(options)
  if (!fs.existsSync(dbPath)) return null

  fs.mkdirSync(dir, { recursive: true })
  const prefix = prefixFor(dbPath, reason)
  const file = path.join(dir, `${prefix}${now.toISOString().replace(/[:.]/g, '-')}.db`)

  const source = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    await source.backup(file)
  } finally {
    source.close()
  }

  // Oldest first, so everything before the last KEEP is surplus.
  const copies = fs.readdirSync(dir).filter(name => name.startsWith(prefix) && name.endsWith('.db')).sort()
  for (const old of copies.slice(0, Math.max(0, copies.length - KEEP[reason]))) {
    fs.rmSync(path.join(dir, old), { force: true })
  }
  return file
}

/**
 * Take the daily copy if the last one is a day old or there is none. Resolves to
 * the new copy's path, or null if none was due.
 * @param {BackupOptions} [options]
 * @returns {Promise<string | null>}
 */
async function backupIfDue(options = {}) {
  const { dbPath, dir, now } = resolveOptions(options)
  const prefix = prefixFor(dbPath, 'daily')
  const latest = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(name => name.startsWith(prefix) && name.endsWith('.db')).sort().pop()
    : undefined
  if (latest && now.getTime() - fs.statSync(path.join(dir, latest)).mtimeMs < DAY_MS) return null
  return backupDatabase('daily', options)
}

/**
 * For routes: back up without ever failing the request. A failed copy is logged
 * loudly, since nothing else would notice backups had stopped.
 * @param {BackupReason | 'if-due'} reason
 */
async function backupQuietly(reason) {
  if (process.env.TRANSCRIPT_BACKUPS === 'off') return
  try {
    if (reason === 'if-due') await backupIfDue()
    else await backupDatabase(reason)
  } catch (error) {
    console.error(`Database backup (${reason}) failed:`, error)
  }
}

module.exports = { backupDatabase, backupIfDue, backupQuietly }
