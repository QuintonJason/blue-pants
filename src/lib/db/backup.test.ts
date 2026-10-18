import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { backupDatabase, backupIfDue } from './backup'

let tmp: string
let dbPath: string
let dir: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-backup-'))
  dbPath = path.join(tmp, 'grades.db')
  dir = path.join(tmp, 'backups')
  const db = new Database(dbPath)
  db.exec("CREATE TABLE grades (score INTEGER); INSERT INTO grades VALUES (72);")
  db.close()
})

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

const at = (iso: string) => ({ dbPath, dir, now: new Date(iso) })
const copies = () => fs.readdirSync(dir).sort()

describe('backupDatabase', () => {
  it('writes a readable copy of the database', async () => {
    const file = await backupDatabase('manual', at('2026-10-18T09:00:00.000Z'))
    expect(path.basename(file!)).toBe('grades-manual-2026-10-18T09-00-00-000Z.db')
    const copy = new Database(file!, { readonly: true })
    expect(copy.prepare('SELECT score FROM grades').get()).toEqual({ score: 72 })
    copy.close()
  })

  it('does nothing before the database exists', async () => {
    expect(await backupDatabase('manual', { dbPath: path.join(tmp, 'missing.db'), dir })).toBeNull()
    expect(fs.existsSync(dir)).toBe(false)
  })

  it('keeps only the newest copies of each kind', async () => {
    for (let day = 1; day <= 32; day++) {
      await backupDatabase('before-schema-update', { dbPath, dir, now: new Date(Date.UTC(2026, 9, day, 9)) })
    }
    await backupDatabase('manual', at('2026-09-01T09:00:00.000Z'))
    const kept = copies()
    expect(kept.filter(name => name.includes('before-schema-update'))).toHaveLength(30)
    // 32 copies from 1 Oct to 1 Nov: the two oldest go.
    expect(kept[0]).toBe('grades-before-schema-update-2026-10-03T09-00-00-000Z.db')
    // Another kind's copy isn't pruned to make room, however old.
    expect(kept).toContain('grades-manual-2026-09-01T09-00-00-000Z.db')
  })
})

describe('backupIfDue', () => {
  it('takes one copy a day', async () => {
    const now = Date.now()
    expect(await backupIfDue({ dbPath, dir, now: new Date(now) })).not.toBeNull()
    expect(await backupIfDue({ dbPath, dir, now: new Date(now + 60 * 60 * 1000) })).toBeNull()
    expect(await backupIfDue({ dbPath, dir, now: new Date(now + 25 * 60 * 60 * 1000) })).not.toBeNull()
    expect(copies()).toHaveLength(2)
  })
})
