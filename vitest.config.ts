import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    // Integration tests share one on-disk SQLite file, so no file-level parallelism (concurrent workers would corrupt writes).
    fileParallelism: false,
    env: {
      TRANSCRIPT_DB_FILE: 'test.db',
      // Routes back up the database they write to; tests shouldn't fill data/backups with test.db copies.
      TRANSCRIPT_BACKUPS: 'off',
    },
    include: ['src/**/*.test.ts'],
  },
})
