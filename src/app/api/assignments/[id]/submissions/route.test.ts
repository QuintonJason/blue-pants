import { describe, it, expect, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { TRANSCRIPT_SCORER_VERSION } from '@/lib/scorer/pipeline'
import { resetDb, seedAssignment, seedCodeOnlySubmission, jsonRequest, routeParams, simpleChatExport } from '@/test/route-helpers'

beforeEach(resetDb)

describe('POST /api/assignments/[id]/submissions', () => {
  it('404s for an assignment that does not exist', async () => {
    const res = await POST(jsonRequest({ studentName: 'A', chatExports: ['x'] }), routeParams(999))
    expect(res.status).toBe(404)
  })

  it('400s for an invalid assignment id', async () => {
    const res = await POST(jsonRequest({ studentName: 'A' }), routeParams('not-a-number'))
    expect(res.status).toBe(400)
  })

  describe('chat mode (default)', () => {
    it('requires a student name', async () => {
      const assignment = await seedAssignment()
      const res = await POST(
        jsonRequest({ chatExports: [simpleChatExport([{ role: 'user', content: 'hi' }])] }),
        routeParams(assignment.id)
      )
      expect(res.status).toBe(400)
    })

    it('requires at least one chat export', async () => {
      const assignment = await seedAssignment()
      const res = await POST(jsonRequest({ studentName: 'Alex' }), routeParams(assignment.id))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/chat export/i)
    })

    it('creates a submission scored from the transcript', async () => {
      const assignment = await seedAssignment()
      const chat = simpleChatExport([
        { role: 'user', content: 'How do I total up cart prices? Walk me through the approach.' },
        { role: 'assistant', content: 'Try this:\n```js\nfunction total(items) { return items.length }\n```' },
        { role: 'user', content: 'Can you review this for edge cases?' },
        { role: 'assistant', content: 'Looks fine' },
      ])

      const res = await POST(
        jsonRequest({ studentName: 'Alex', chatExports: [chat], finalCode: 'function total(items) { return items.length }' }),
        routeParams(assignment.id)
      )
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.submissionMode).toBe('chat')
      expect(body.chatExports).not.toBeNull()
      expect(body.suggestedScore).toBeGreaterThan(0)
      expect(JSON.parse(body.computedMetrics).userMessages).toBe(2)
      expect(body.aiLikelihoodScore).toBeNull()
      expect(body.transcriptScorerVersion).toBe(TRANSCRIPT_SCORER_VERSION)
    })

    it('400s when no chat export could be parsed', async () => {
      const assignment = await seedAssignment()
      const res = await POST(
        jsonRequest({ studentName: 'Alex', chatExports: ['{"not":"a chat export"}'] }),
        routeParams(assignment.id)
      )
      expect(res.status).toBe(400)
    })
  })

  describe('code_only mode', () => {
    it('requires code', async () => {
      const assignment = await seedAssignment()
      const res = await POST(
        jsonRequest({ studentName: 'Alex', submissionMode: 'code_only' }),
        routeParams(assignment.id)
      )
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/code is required/i)
    })

    it('does not require a chat export', async () => {
      const assignment = await seedAssignment()
      const res = await POST(
        jsonRequest({ studentName: 'Alex', submissionMode: 'code_only', finalCode: '<h1>Hi</h1>' }),
        routeParams(assignment.id)
      )
      expect(res.status).toBe(200)
    })

    it('creates a submission with an AI-likelihood score instead of a suggested score', async () => {
      const assignment = await seedAssignment()
      const res = await POST(
        jsonRequest({
          studentName: 'Alex',
          submissionMode: 'code_only',
          finalCode: '<!-- this sets the page title -->\n<h1>Hi</h1>',
        }),
        routeParams(assignment.id)
      )
      const body = await res.json()
      expect(body.submissionMode).toBe('code_only')
      expect(body.chatExports).toBeNull()
      expect(body.suggestedScore).toBeNull()
      expect(typeof body.aiLikelihoodScore).toBe('number')
      expect(JSON.parse(body.aiLikelihoodSignals).length).toBeGreaterThan(0)
    })

    it('flags techniques outside the assignment curriculum scope', async () => {
      const assignment = await seedAssignment({
        curriculumScope: JSON.stringify({ taughtTechniqueIds: ['css-hover'] }),
      })
      const res = await POST(
        jsonRequest({
          studentName: 'Alex',
          submissionMode: 'code_only',
          finalCode: '<style>@media (max-width: 768px) { .x { color: red; } }</style>',
        }),
        routeParams(assignment.id)
      )
      const body = await res.json()
      const flags = JSON.parse(body.curriculumScopeFlags)
      expect(flags.some((f: { id: string }) => f.id === 'css-media-queries')).toBe(true)
    })

    it('leaves curriculumScopeFlags null when the assignment has no scope configured', async () => {
      const assignment = await seedAssignment()
      const res = await POST(
        jsonRequest({ studentName: 'Alex', submissionMode: 'code_only', finalCode: '@media (max-width: 768px) {}' }),
        routeParams(assignment.id)
      )
      const body = await res.json()
      expect(body.curriculumScopeFlags).toBeNull()
    })
  })
})

describe('GET /api/assignments/[id]/submissions', () => {
  it('lists submissions for the assignment, newest first', async () => {
    const assignment = await seedAssignment()
    // Explicit, distinct timestamps: two POSTs in quick succession can tie to the
    // same millisecond, which made this test flaky.
    await seedCodeOnlySubmission(assignment.id, { studentName: 'First', submittedAt: '2026-01-01T00:00:00.000Z' })
    await seedCodeOnlySubmission(assignment.id, { studentName: 'Second', submittedAt: '2026-01-01T00:00:01.000Z' })

    const res = await GET(new Request('http://localhost/test'), routeParams(assignment.id))
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].studentName).toBe('Second')
  })
})
