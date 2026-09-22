// Provisions a disposable SQLite database for integration tests, via the same `drizzle-kit push` mechanism `npm run dev` uses (see TRANSCRIPT_DB_FILE in vitest.config.ts).
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import path from 'path'

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test.db')

export default function setup() {
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true })
  rmSync(TEST_DB_PATH, { force: true })

  execFileSync(
    'npx',
    [
      'drizzle-kit',
      'push',
      '--force',
      '--dialect', 'sqlite',
      '--schema', './src/lib/db/schema.ts',
      '--url', TEST_DB_PATH,
    ],
    { stdio: 'inherit' }
  )

  return () => {
    if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH, { force: true })
  }
}
