import { describe, it, expect, beforeEach } from 'vitest'
import { POST } from './route'
import {
  resetDb,
  seedAssignment,
  seedChatSubmission,
  seedCodeOnlySubmission,
  routeParams,
  jsonRequest,
  simpleChatExport,
} from '@/test/route-helpers'

beforeEach(resetDb)

describe('POST /api/submissions/[id]/add-transcript', () => {
  it('404s for a submission that does not exist', async () => {
    const res = await POST(jsonRequest({ chatExports: ['x'] }), routeParams(999))
    expect(res.status).toBe(404)
  })

  it('409s when the submission already has a transcript', async () => {
    const assignment = await seedAssignment()
    const submission = await seedChatSubmission(assignment.id)
    const res = await POST(
      jsonRequest({ chatExports: [simpleChatExport([{ role: 'user', content: 'hi there, a question' }])] }),
      routeParams(submission.id)
    )
    expect(res.status).toBe(409)
  })

  it('requires at least one chat export', async () => {
    const assignment = await seedAssignment()
    const submission = await seedCodeOnlySubmission(assignment.id)
    const res = await POST(jsonRequest({ chatExports: [] }), routeParams(submission.id))
    expect(res.status).toBe(400)
  })

  it('400s when no chat export could be parsed', async () => {
    const assignment = await seedAssignment()
    const submission = await seedCodeOnlySubmission(assignment.id)
    const res = await POST(jsonRequest({ chatExports: ['{"not":"a chat export"}'] }), routeParams(submission.id))
    expect(res.status).toBe(400)
  })

  it('upgrades a code_only submission onto the collaboration rubric', async () => {
    const assignment = await seedAssignment()
    const submission = await seedCodeOnlySubmission(assignment.id, {
      finalCode: 'function total(items) { return items.length }',
      aiLikelihoodScore: 72,
      aiLikelihoodSignals: JSON.stringify([{ id: 'x', label: 'x', points: 72, maxPoints: 100, triggered: true, evidence: [] }]),
    })

    const chat = simpleChatExport([
      { role: 'user', content: 'I need to total up cart prices. What is the best approach and why?' },
      { role: 'assistant', content: 'Try this:\n```js\nfunction total(items) { return items.length }\n```' },
      { role: 'user', content: 'Can you review this for edge cases?' },
      { role: 'assistant', content: 'Looks fine' },
    ])

    const res = await POST(jsonRequest({ chatExports: [chat] }), routeParams(submission.id))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.submissionMode).toBe('chat')
    expect(body.transcriptStatus).toBe('received')
    expect(body.chatExports).not.toBeNull()
    expect(body.suggestedScore).toBeGreaterThan(0)
    expect(JSON.parse(body.suggestedDimensionScores)).toBeTruthy()

    // The code-based evidence that justified requesting the transcript stays around, not wiped by the upgrade.
    expect(body.aiLikelihoodScore).toBe(72)
  })

  it('scores the upgraded submission against the assignment current rubric', async () => {
    const assignment = await seedAssignment({
      rubricConfig: JSON.stringify({
        problemArticulation: 0,
        iterationQuality: 0,
        criticalEvaluation: 0,
        codeReviewEngagement: 0,
        debuggingProcess: 0,
        independenceShown: 100,
      }),
    })
    const submission = await seedCodeOnlySubmission(assignment.id, { finalCode: 'x' })
    const chat = simpleChatExport([{ role: 'user', content: 'hello, a longer opening question please' }])

    const res = await POST(jsonRequest({ chatExports: [chat] }), routeParams(submission.id))
    const body = await res.json()
    expect(body.suggestedScore).toBe(JSON.parse(body.suggestedDimensionScores).independenceShown)
  })
})
