import { describe, it, expect } from 'vitest'
import { rescoreStoredSubmission, scoreSubmission } from './pipeline'
import { DEFAULT_RUBRIC_CONFIG } from './rubric'
import { chat, message } from '../analyzer/fixtures'

const AI_CODE = ['function total(items) {', '  return items.length;', '}'].join('\n')

const transcript = chat(
  message('user', 'I need to total up cart prices. What is the best approach and why?'),
  message('assistant', 'Try this:\n```js\n' + AI_CODE + '\n```'),
  message('user', 'Can you review this for edge cases?'),
  message('assistant', 'Looks fine'),
)

describe('scoreSubmission', () => {
  it('produces a score, metrics, and the assistant code blocks', () => {
    const scored = scoreSubmission([transcript], AI_CODE, DEFAULT_RUBRIC_CONFIG)
    expect(scored.suggestedScore).toBeGreaterThan(0)
    expect(scored.suggestedScore).toBeLessThanOrEqual(100)
    expect(scored.metrics.userMessages).toBe(2)
    expect(scored.aiCodeSnippets).toHaveLength(1)
  })

  it('scores pasted and reformatted code identically', () => {
    const minified = 'function total(items) { return items.length; }'
    const pasted = scoreSubmission([transcript], AI_CODE, DEFAULT_RUBRIC_CONFIG)
    const reformatted = scoreSubmission([transcript], minified, DEFAULT_RUBRIC_CONFIG)
    expect(reformatted.dimensionScores.independenceShown).toBe(
      pasted.dimensionScores.independenceShown
    )
  })

  it('honours the rubric weights it is given', () => {
    const independenceOnly = { ...DEFAULT_RUBRIC_CONFIG, problemArticulation: 0, iterationQuality: 0, criticalEvaluation: 0, codeReviewEngagement: 0, debuggingProcess: 0, independenceShown: 100 }
    const scored = scoreSubmission([transcript], AI_CODE, independenceOnly)
    expect(scored.suggestedScore).toBe(scored.dimensionScores.independenceShown)
  })

  it('works with no final code', () => {
    const scored = scoreSubmission([transcript], null, DEFAULT_RUBRIC_CONFIG)
    expect(Number.isNaN(scored.suggestedScore)).toBe(false)
  })
})

describe('rescoreStoredSubmission', () => {
  const stored = JSON.stringify([transcript])

  it('only ever returns derived fields', () => {
    // The guarantee that matters: a rescore cannot overwrite a hand-entered grade,
    // a teacher's notes, or a student's reflection, because the update object it
    // produces has no key for any of them.
    const update = rescoreStoredSubmission(stored, AI_CODE, DEFAULT_RUBRIC_CONFIG)
    expect(Object.keys(update).sort()).toEqual([
      'aiCodeSnippets',
      'computedMetrics',
      'suggestedDimensionScores',
      'suggestedScore',
    ])
    // dimensionScores holds the teacher's adjusted sliders, so it must not appear.
    for (const forbidden of ['finalScore', 'dimensionScores', 'teacherNotes', 'selfReflection', 'studentName', 'chatExports', 'finalCode']) {
      expect(update).not.toHaveProperty(forbidden)
    }
  })

  it('agrees with a fresh score of the same transcripts', () => {
    const fresh = scoreSubmission([transcript], AI_CODE, DEFAULT_RUBRIC_CONFIG)
    const update = rescoreStoredSubmission(stored, AI_CODE, DEFAULT_RUBRIC_CONFIG)
    expect(update.suggestedScore).toBe(fresh.suggestedScore)
    expect(JSON.parse(update.computedMetrics)).toEqual(fresh.metrics)
  })

  it('serialises JSON columns as strings', () => {
    const update = rescoreStoredSubmission(stored, null, DEFAULT_RUBRIC_CONFIG)
    expect(typeof update.computedMetrics).toBe('string')
    expect(typeof update.suggestedDimensionScores).toBe('string')
    expect(typeof update.aiCodeSnippets).toBe('string')
    expect(typeof update.suggestedScore).toBe('number')
  })

  it('rejects stored transcripts that are not an array', () => {
    expect(() => rescoreStoredSubmission('{"not":"an array"}', null, DEFAULT_RUBRIC_CONFIG))
      .toThrow(/not an array/)
  })

  it('rejects unparseable stored transcripts', () => {
    expect(() => rescoreStoredSubmission('not json', null, DEFAULT_RUBRIC_CONFIG)).toThrow()
  })

  it('is idempotent', () => {
    const first = rescoreStoredSubmission(stored, AI_CODE, DEFAULT_RUBRIC_CONFIG)
    const second = rescoreStoredSubmission(stored, AI_CODE, DEFAULT_RUBRIC_CONFIG)
    expect(second).toEqual(first)
  })
})
