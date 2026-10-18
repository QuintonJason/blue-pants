import { describe, it, expect, beforeEach } from 'vitest'
import { GET, PUT } from './route'
import { POST as RESCORE } from './rescore/route'
import { POST as ADD_TRANSCRIPT } from './add-transcript/route'
import {
  resetDb,
  seedAssignment,
  seedChatSubmission,
  seedCodeOnlySubmission,
  jsonRequest,
  routeParams,
  storedChatExports,
  simpleChatExport,
} from '@/test/route-helpers'
import { db } from '@/lib/db'
import { submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { parseGradeRecords } from '@/lib/scorer/grade-record'
import { TRANSCRIPT_SCORER_VERSION } from '@/lib/scorer/pipeline'

beforeEach(resetDb)

const TRANSCRIPT = storedChatExports([
  { role: 'user', content: 'is head different from header' },
  { role: 'assistant', content: 'Yes, head holds metadata.' },
  { role: 'user', content: 'does css apply to all pages automatically' },
  { role: 'assistant', content: 'Only pages that link it.' },
  { role: 'user', content: 'when do i use a class instead of an id' },
  { role: 'assistant', content: 'Use a class when it repeats.' },
])

async function gradedSubmission() {
  const assignment = await seedAssignment()
  return seedChatSubmission(assignment.id, { chatExports: TRANSCRIPT, finalCode: '<h1>hi</h1>', suggestedScore: 70 })
}

async function saveGrade(id: number, body: Record<string, unknown>) {
  const res = await PUT(jsonRequest(body, 'PUT'), routeParams(id))
  expect(res.status).toBe(200)
  return res.json()
}

describe('PUT /api/submissions/[id]: grade records', () => {
  it('records the evidence a grade was given on', async () => {
    const submission = await gradedSubmission()
    const body = await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })

    const [record] = parseGradeRecords(body.gradeRecords)
    expect(record.finalScore).toBe(72)
    expect(record.teacherNotes).toBe('Good questions')
    expect(record.scorerVersion).toBe(TRANSCRIPT_SCORER_VERSION)
    expect(record.suggestedScore).toBe(70)
    // Seeded without a scorer version, so the suggestion was outdated when graded.
    expect(record.suggestionStale).toContain('rules')
    expect(record.feedback?.strengths.map(p => p.id)).toContain('asks-questions')
    expect(record.feedback?.strengths[0].examples[0].text).toBe('is head different from header')
  })

  it('does not add a record when saving again without changes', async () => {
    const submission = await gradedSubmission()
    await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })
    const body = await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })
    expect(parseGradeRecords(body.gradeRecords)).toHaveLength(1)
  })

  it('keeps earlier records when a grade is revised', async () => {
    const submission = await gradedSubmission()
    await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })
    const body = await saveGrade(submission.id, { finalScore: 65, teacherNotes: 'Revised after review' })
    expect(parseGradeRecords(body.gradeRecords).map(r => r.finalScore)).toEqual([72, 65])
  })

  it('does not record anything for saves that are not grades', async () => {
    const submission = await gradedSubmission()
    const body = await saveGrade(submission.id, { selfReflection: 'I learned a lot' })
    expect(body.gradeRecords).toBeNull()
  })

  it('is never touched by a rescore', async () => {
    const submission = await gradedSubmission()
    const graded = await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })
    const res = await RESCORE(new Request('http://localhost/test', { method: 'POST' }), routeParams(submission.id))
    expect(res.status).toBe(200)

    const after = await (await GET(new Request('http://localhost/test'), routeParams(submission.id))).json()
    expect(after.transcriptScorerVersion).toBe(TRANSCRIPT_SCORER_VERSION)
    expect(after.gradeRecords).toBe(graded.gradeRecords)
  })
})

describe('evidence fingerprints', () => {
  const get = async (id: number) =>
    (await GET(new Request('http://localhost/test'), routeParams(id))).json()

  it('records the evidence a grade was given on and finds it unchanged', async () => {
    const submission = await gradedSubmission()
    const body = await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })
    expect(parseGradeRecords(body.gradeRecords)[0].evidence?.chatSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(body.evidenceChangedSinceGrade).toBe(false)
    expect((await get(submission.id)).evidenceChangedSinceGrade).toBe(false)
  })

  it('flags evidence edited after grading, however it was changed', async () => {
    const submission = await gradedSubmission()
    await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })
    await db.update(submissions).set({ finalCode: '<h1>edited</h1>' }).where(eq(submissions.id, submission.id))
    expect((await get(submission.id)).evidenceChangedSinceGrade).toBe(true)
  })

  it('flags a transcript added after a code-only grade, until the grade is saved again', async () => {
    const assignment = await seedAssignment()
    const submission = await seedCodeOnlySubmission(assignment.id)
    await saveGrade(submission.id, { finalScore: 60, teacherNotes: 'Provisional, no transcript' })

    const chat = simpleChatExport([
      { role: 'user', content: 'why does my heading not change colour' },
      { role: 'assistant', content: 'Check the selector.' },
    ])
    const added = await ADD_TRANSCRIPT(jsonRequest({ chatExports: [chat] }), routeParams(submission.id))
    expect((await added.json()).evidenceChangedSinceGrade).toBe(true)

    // Same grade, new evidence: a new decision, so it's recorded.
    const regraded = await saveGrade(submission.id, { finalScore: 60, teacherNotes: 'Provisional, no transcript' })
    expect(regraded.evidenceChangedSinceGrade).toBe(false)
    expect(parseGradeRecords(regraded.gradeRecords)).toHaveLength(2)
  })

  it('does not flag records made before fingerprints were taken', async () => {
    const submission = await gradedSubmission()
    const body = await saveGrade(submission.id, { finalScore: 72, teacherNotes: 'Good questions' })
    const [record] = parseGradeRecords(body.gradeRecords)
    delete record.evidence
    await db
      .update(submissions)
      .set({ gradeRecords: JSON.stringify([record]), finalCode: '<h1>edited</h1>' })
      .where(eq(submissions.id, submission.id))
    expect((await get(submission.id)).evidenceChangedSinceGrade).toBe(false)
  })
})

describe('PUT /api/submissions/[id]: grades far from the suggestion', () => {
  it('requires notes for a grade 10 or more points from the suggestion', async () => {
    const submission = await gradedSubmission()
    const res = await PUT(jsonRequest({ finalScore: 85, teacherNotes: '' }, 'PUT'), routeParams(submission.id))
    expect(res.status).toBe(400)
    expect((await GET(new Request('http://localhost/test'), routeParams(submission.id)).then(r => r.json())).finalScore).toBeNull()

    await saveGrade(submission.id, { finalScore: 85, teacherNotes: 'Strong reflection in class' })
    await saveGrade(submission.id, { finalScore: 75, teacherNotes: '' })
  })
})
