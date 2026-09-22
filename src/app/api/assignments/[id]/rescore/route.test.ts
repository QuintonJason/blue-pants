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

function rescoreAllRequest() {
  return new Request('http://localhost/test', { method: 'POST' })
}

beforeEach(resetDb)

describe('POST /api/assignments/[id]/rescore', () => {
  it('404s for an assignment that does not exist', async () => {
    const res = await POST(rescoreAllRequest(), routeParams(999))
    expect(res.status).toBe(404)
  })

  it('returns zero results for an assignment with no submissions', async () => {
    const assignment = await seedAssignment()
    const res = await POST(rescoreAllRequest(), routeParams(assignment.id))
    const body = await res.json()
    expect(body.total).toBe(0)
  })

  it('rescores every submission regardless of mode, and reports per-submission results', async () => {
    const assignment = await seedAssignment()
    const chatSub = await seedChatSubmission(assignment.id, {
      studentName: 'Chat Student',
      chatExports: storedChatExports([
        { role: 'user', content: 'How should I approach this problem and why?' },
        { role: 'assistant', content: 'Start with the data model' },
      ]),
    })
    const codeOnlySub = await seedCodeOnlySubmission(assignment.id, {
      studentName: 'Code Only Student',
      finalCode: '<!-- this sets the title -->\n<h1>Hi</h1>',
      aiLikelihoodScore: 0,
      aiLikelihoodSignals: JSON.stringify([]),
    })
    const brokenSub = await seedChatSubmission(assignment.id, {
      studentName: 'Broken Student',
      chatExports: null,
    })

    const res = await POST(rescoreAllRequest(), routeParams(assignment.id))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.total).toBe(3)
    expect(body.rescored).toBe(2)
    expect(body.failed).toBe(1)

    const byId = Object.fromEntries(body.results.map((r: { submissionId: number }) => [r.submissionId, r]))
    expect(byId[chatSub.id].suggestedScore).toBeGreaterThan(0)
    expect(byId[codeOnlySub.id].aiLikelihoodScore).toBeGreaterThan(0)
    expect(byId[brokenSub.id].error).toBeTruthy()
  })

  it('does not fail the whole batch when one submission errors', async () => {
    const assignment = await seedAssignment()
    await seedChatSubmission(assignment.id, { chatExports: null })
    const good = await seedCodeOnlySubmission(assignment.id, { finalCode: '<h1>Hi</h1>' })

    const res = await POST(rescoreAllRequest(), routeParams(assignment.id))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.results.find((r: { submissionId: number }) => r.submissionId === good.id).error).toBeUndefined()
  })
})
