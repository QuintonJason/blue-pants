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

// Initialize database with tables
export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      rubric_config TEXT NOT NULL DEFAULT '{"problemArticulation":20,"iterationQuality":20,"criticalEvaluation":20,"codeReviewEngagement":20,"debuggingProcess":10,"independenceShown":10}'
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      chat_exports TEXT NOT NULL,
      final_code TEXT,
      ai_code_snippets TEXT,
      computed_metrics TEXT,
      suggested_score REAL,
      final_score REAL,
      dimension_scores TEXT,
      teacher_notes TEXT
    );
  `)
}

// Export schema for use elsewhere
export { schema }
