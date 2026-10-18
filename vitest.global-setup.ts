// Provisions a disposable SQLite database for integration tests by running the checked-in migrations from scratch, the same script `npm run dev` uses (see TRANSCRIPT_DB_FILE in vitest.config.ts), so every test run also proves the migrations build the schema.
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import path from 'path'

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test.db')

export default function setup() {
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true })
  rmSync(TEST_DB_PATH, { force: true })

  execFileSync('node', ['scripts/migrate-db.js'], {
    stdio: 'inherit',
    env: { ...process.env, TRANSCRIPT_DB_FILE: path.basename(TEST_DB_PATH) },
  })

  return () => {
    if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH, { force: true })
  }
}
