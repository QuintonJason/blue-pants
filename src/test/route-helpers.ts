// Shared scaffolding for route-handler integration tests — calls route handlers as plain functions against the disposable TRANSCRIPT_DB_FILE database.
import { db } from '@/lib/db'
import { assignments, submissions, teachers, type NewAssignment, type NewSubmission } from '@/lib/db/schema'
import { DEFAULT_RUBRIC_CONFIG } from '@/lib/scorer/rubric'
import { smartParse } from '@/lib/parser/chatgpt'

/** Wipe every table. Call from beforeEach so tests can't see each other's rows. */
export async function resetDb() {
  await db.delete(submissions)
  await db.delete(assignments)
  await db.delete(teachers)
}

export async function seedAssignment(overrides: Partial<NewAssignment> = {}) {
  const [row] = await db
    .insert(assignments)
    .values({
      name: 'Test Assignment',
      rubricConfig: JSON.stringify(DEFAULT_RUBRIC_CONFIG),
      ...overrides,
    })
    .returning()
  return row
}

export async function seedChatSubmission(
  assignmentId: number,
  overrides: Partial<NewSubmission> = {}
) {
  const [row] = await db
    .insert(submissions)
    .values({
      assignmentId,
      studentName: 'Test Student',
      submittedAt: new Date().toISOString(),
      submissionMode: 'chat',
      chatExports: JSON.stringify([]),
      ...overrides,
    })
    .returning()
  return row
}

export async function seedCodeOnlySubmission(
  assignmentId: number,
  overrides: Partial<NewSubmission> = {}
) {
  const [row] = await db
    .insert(submissions)
    .values({
      assignmentId,
      studentName: 'Test Student',
      submittedAt: new Date().toISOString(),
      submissionMode: 'code_only',
      chatExports: null,
      finalCode: '<h1>hi</h1>',
      aiLikelihoodScore: 0,
      aiLikelihoodSignals: JSON.stringify([]),
      ...overrides,
    })
    .returning()
  return row
}

/** A chat export the parser's "simple format" accepts, much less ceremony than a real ChatGPT mapping tree. */
export function simpleChatExport(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return JSON.stringify({ title: 'Test Chat', messages })
}

// The already-parsed form the `chatExports` column actually stores — use when seeding directly so rescore tests read what production would store.
export function storedChatExports(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return JSON.stringify(smartParse(simpleChatExport(messages)))
}

export function jsonRequest(body?: unknown, method = 'POST'): Request {
  return new Request('http://localhost/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

export function routeParams(id: string | number) {
  return { params: Promise.resolve({ id: String(id) }) }
}
