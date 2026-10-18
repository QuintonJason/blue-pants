import { describe, it, expect } from 'vitest'
import { gradingConsistency } from './consistency'
import type { Submission } from '../db/schema'
import { storedChatExports } from '@/test/route-helpers'

const PAGE_CODE = Array.from({ length: 20 }, (_, i) => `<p class="line-${i}">Line ${i}</p>`).join('\n')
const HAND_OFF = storedChatExports([
  { role: 'user', content: 'Design my RainClan website using separate HTML, CSS, and JavaScript files' },
  { role: 'assistant', content: '```html\n' + PAGE_CODE + '\n```' },
])

const submission = (overrides: Partial<Submission>): Submission =>
  ({
    id: 1,
    assignmentId: 1,
    studentName: 'S',
    submissionMode: 'chat',
    chatExports: '[]',
    finalCode: null,
    suggestedScore: null,
    finalScore: null,
    gradeRecords: null,
    intentOverrides: null,
    ...overrides,
  }) as Submission

const record = (scorerVersion: string, suggestedScore: number) =>
  JSON.stringify([{ scorerVersion, suggestedScore, finalScore: 0 }])

describe('gradingConsistency', () => {
  it('compares grades with the suggestion recorded when grading', () => {
    const c = gradingConsistency([
      submission({ finalScore: 80, suggestedScore: 50, gradeRecords: record('v1', 75) }),
      submission({ finalScore: 60, suggestedScore: 72 }),
      submission({ finalScore: null, suggestedScore: 90 }),
    ])
    expect(c.compared).toBe(2)
    expect(c.averageGap).toBe(-3.5)
    expect(c.departed).toBe(1)
    expect(c.unrecorded).toBe(1)
  })

  it('lists the scoring rules current grades were given under', () => {
    const c = gradingConsistency([
      submission({ finalScore: 70, gradeRecords: record('v2', 70) }),
      submission({ finalScore: 70, gradeRecords: record('v1', 70) }),
      submission({ finalScore: 70, gradeRecords: record('v2', 70) }),
    ])
    expect(c.scorerVersions).toEqual(['v1', 'v2'])
  })

  it('counts flags and how many the teacher overruled', () => {
    const c = gradingConsistency([
      submission({ chatExports: HAND_OFF }),
      submission({ chatExports: HAND_OFF, intentOverrides: JSON.stringify({ 'chat-0-message-0': { delegation: false } }) }),
    ])
    expect(c.flags.delegation).toEqual({ flagged: 2, overruled: 1 })
  })
})
