import { describe, it, expect, beforeEach } from 'vitest'
import { POST } from './route'
import { PUT } from '../route'
import { resetDb, seedAssignment, seedChatSubmission, seedCodeOnlySubmission, jsonRequest, routeParams, storedChatExports } from '@/test/route-helpers'
import { parseGradeRecords } from '@/lib/scorer/grade-record'

beforeEach(resetDb)

const PAGE_CODE = Array.from({ length: 20 }, (_, i) => `<p class="line-${i}">Line ${i}</p>`).join('\n')

async function handOffSubmission() {
  const assignment = await seedAssignment()
  return seedChatSubmission(assignment.id, {
    chatExports: storedChatExports([
      { role: 'user', content: 'Design my RainClan website using separate HTML, CSS, and JavaScript files' },
      { role: 'assistant', content: '```html\n' + PAGE_CODE + '\n```' },
      { role: 'user', content: 'why is my nav not centered' },
      { role: 'assistant', content: 'Use flex.' },
    ]),
  })
}

const rule = (id: number, body: unknown) => POST(jsonRequest(body), routeParams(id))

describe('POST /api/submissions/[id]/intent-overrides', () => {
  it('stores the ruling and recomputes the suggestion with it', async () => {
    const submission = await handOffSubmission()
    const flagged = await (await rule(submission.id, { anchor: 'chat-0-message-0', kind: 'delegation', value: true })).json()
    const overruled = await (await rule(submission.id, { anchor: 'chat-0-message-0', kind: 'delegation', value: false })).json()

    expect(JSON.parse(overruled.intentOverrides)).toEqual({ 'chat-0-message-0': { delegation: false } })
    expect(JSON.parse(flagged.computedMetrics).delegationCount).toBe(1)
    expect(JSON.parse(overruled.computedMetrics).delegationCount).toBe(0)
    expect(JSON.parse(overruled.suggestedDimensionScores).independenceShown).toBeGreaterThan(
      JSON.parse(flagged.suggestedDimensionScores).independenceShown
    )
  })

  it('records the rulings with the next grade, and flags rulings changed after it', async () => {
    const submission = await handOffSubmission()
    await PUT(jsonRequest({ finalScore: 70, teacherNotes: 'ok' }, 'PUT'), routeParams(submission.id))
    const changed = await (await rule(submission.id, { anchor: 'chat-0-message-0', kind: 'delegation', value: false })).json()
    expect(changed.rulingsChangedSinceGrade).toBe(true)

    const regraded = await (await PUT(jsonRequest({ finalScore: 70, teacherNotes: 'ok' }, 'PUT'), routeParams(submission.id))).json()
    expect(regraded.rulingsChangedSinceGrade).toBe(false)
    const records = parseGradeRecords(regraded.gradeRecords)
    expect(records).toHaveLength(2)
    expect(records[1].intentOverrides).toEqual({ 'chat-0-message-0': { delegation: false } })
    expect(records[1].metrics?.delegationCount).toBe(0)
  })

  it('leaves the transcript itself unchanged', async () => {
    const submission = await handOffSubmission()
    const body = await (await rule(submission.id, { anchor: 'chat-0-message-0', kind: 'delegation', value: false })).json()
    expect(body.chatExports).toBe(submission.chatExports)
  })

  it('rejects bad input, assistant messages and code-only submissions', async () => {
    const submission = await handOffSubmission()
    expect((await rule(submission.id, { anchor: 'nope', kind: 'delegation', value: false })).status).toBe(400)
    expect((await rule(submission.id, { anchor: 'chat-0-message-0', kind: 'other', value: false })).status).toBe(400)
    expect((await rule(submission.id, { anchor: 'chat-0-message-1', kind: 'delegation', value: false })).status).toBe(422)
    expect((await rule(submission.id, { anchor: 'chat-5-message-0', kind: 'delegation', value: false })).status).toBe(422)

    const codeOnly = await seedCodeOnlySubmission(submission.assignmentId)
    expect((await rule(codeOnly.id, { anchor: 'chat-0-message-0', kind: 'delegation', value: false })).status).toBe(422)
  })
})
