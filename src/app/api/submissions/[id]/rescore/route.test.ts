import { describe, it, expect, beforeEach } from 'vitest'
import { POST } from './route'
import {
  resetDb,
  seedAssignment,
  seedChatSubmission,
  seedCodeOnlySubmission,
  routeParams,
  storedChatExports,
} from '@/test/route-helpers'

function rescoreRequest() {
  return new Request('http://localhost/test', { method: 'POST' })
}

beforeEach(resetDb)

describe('POST /api/submissions/[id]/rescore', () => {
  it('404s for a submission that does not exist', async () => {
    const res = await POST(rescoreRequest(), routeParams(999))
    expect(res.status).toBe(404)
  })

  describe('chat mode', () => {
    it('recomputes the suggested score from the stored transcript', async () => {
      const assignment = await seedAssignment()
      const submission = await seedChatSubmission(assignment.id, {
        chatExports: storedChatExports([
          { role: 'user', content: 'How should I structure this component and why?' },
          { role: 'assistant', content: 'Use a functional component' },
        ]),
      })

      const res = await POST(rescoreRequest(), routeParams(submission.id))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.submission.suggestedScore).toBeGreaterThan(0)
      expect(body.previousSuggestedScore).toBeNull()
      expect(body.suggestedScore).toBe(body.submission.suggestedScore)
    })

    it('422s when the submission has no stored transcript to rescore', async () => {
      const assignment = await seedAssignment()
      const submission = await seedChatSubmission(assignment.id, { chatExports: null })
      const res = await POST(rescoreRequest(), routeParams(submission.id))
      expect(res.status).toBe(422)
    })

    it('never touches a hand-entered grade, notes, or reflection', async () => {
      const assignment = await seedAssignment()
      const submission = await seedChatSubmission(assignment.id, {
        chatExports: storedChatExports([{ role: 'user', content: 'hello there, a longer question please' }]),
        finalScore: 88,
        teacherNotes: 'Great work',
        selfReflection: 'I learned a lot',
      })

      const res = await POST(rescoreRequest(), routeParams(submission.id))
      const body = await res.json()
      expect(body.submission.finalScore).toBe(88)
      expect(body.submission.teacherNotes).toBe('Great work')
      expect(body.submission.selfReflection).toBe('I learned a lot')
    })
  })

  describe('code_only mode', () => {
    it('recomputes the AI-likelihood score from the stored code', async () => {
      const assignment = await seedAssignment()
      const submission = await seedCodeOnlySubmission(assignment.id, {
        finalCode: '<!-- this sets the title -->\n<!-- note: makes sure it works -->\n<h1>Hi</h1>',
        aiLikelihoodScore: 0,
        aiLikelihoodSignals: JSON.stringify([]),
      })

      const res = await POST(rescoreRequest(), routeParams(submission.id))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.aiLikelihoodScore).toBeGreaterThan(0)
      expect(body.previousAiLikelihoodScore).toBe(0)
      expect(body.submission.submissionMode).toBe('code_only')
      expect(body.submission.suggestedScore).toBeNull()
    })

    it('never touches a hand-entered grade', async () => {
      const assignment = await seedAssignment()
      const submission = await seedCodeOnlySubmission(assignment.id, { finalScore: 70 })
      const res = await POST(rescoreRequest(), routeParams(submission.id))
      const body = await res.json()
      expect(body.submission.finalScore).toBe(70)
    })
  })
})
