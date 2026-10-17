import { describe, it, expect } from 'vitest'
import {
  validateRubricConfig,
  calculateTotalScore,
  parseRubricSnapshot,
  rubricsMatch,
  DEFAULT_RUBRIC_CONFIG,
  calculateDimensionScores,
} from './rubric'
import type { DimensionScores, RubricConfig } from '../db/schema'

/** A complete rubric with every dimension set to the same weight. */
function uniformWeights(weight: number): RubricConfig {
  return {
    problemArticulation: weight,
    iterationQuality: weight,
    criticalEvaluation: weight,
    codeReviewEngagement: weight,
    debuggingProcess: weight,
    independenceShown: weight,
  }
}

const evenScores: DimensionScores = {
  problemArticulation: 50,
  iterationQuality: 50,
  criticalEvaluation: 50,
  codeReviewEngagement: 50,
  debuggingProcess: 50,
  independenceShown: 50,
}

describe('validateRubricConfig', () => {
  it('accepts the default config', () => {
    const result = validateRubricConfig(DEFAULT_RUBRIC_CONFIG)
    expect(result.ok).toBe(true)
  })

  it('rejects weights that all sum to zero', () => {
    // This is the case that used to make every score NaN.
    const result = validateRubricConfig(uniformWeights(0))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/more than 0/)
  })

  it('rejects a missing dimension', () => {
    const { independenceShown, ...partial } = DEFAULT_RUBRIC_CONFIG
    expect(validateRubricConfig(partial).ok).toBe(false)
  })

  it('rejects non-numeric, negative, and out-of-range weights', () => {
    for (const bad of ['20', null, NaN, Infinity, -1, 101]) {
      const result = validateRubricConfig({ ...DEFAULT_RUBRIC_CONFIG, iterationQuality: bad })
      expect(result.ok, `expected ${String(bad)} to be rejected`).toBe(false)
    }
  })

  it('rejects non-objects', () => {
    for (const bad of [null, undefined, 42, 'weights', [20, 20, 20, 20, 10, 10]]) {
      expect(validateRubricConfig(bad).ok).toBe(false)
    }
  })

  it('accepts weights that do not sum to 100', () => {
    // calculateTotalScore normalises by the total, so this is legitimate.
    const result = validateRubricConfig({ ...DEFAULT_RUBRIC_CONFIG, debuggingProcess: 50 })
    expect(result.ok).toBe(true)
  })
})

describe('calculateTotalScore', () => {
  it('returns a number, never NaN, when weights sum to zero', () => {
    const total = calculateTotalScore(evenScores, uniformWeights(0))
    expect(Number.isNaN(total)).toBe(false)
    expect(total).toBe(0)
  })

  it('normalises by total weight rather than assuming 100', () => {
    const doubled: RubricConfig = {
      problemArticulation: 40,
      iterationQuality: 40,
      criticalEvaluation: 40,
      codeReviewEngagement: 40,
      debuggingProcess: 20,
      independenceShown: 20,
    }
    expect(calculateTotalScore(evenScores, doubled)).toBe(
      calculateTotalScore(evenScores, DEFAULT_RUBRIC_CONFIG)
    )
  })

  it('weights dimensions as configured', () => {
    const onlyIndependence: RubricConfig = {
      problemArticulation: 0,
      iterationQuality: 0,
      criticalEvaluation: 0,
      codeReviewEngagement: 0,
      debuggingProcess: 0,
      independenceShown: 10,
    }
    const scores = { ...evenScores, independenceShown: 90 }
    expect(calculateTotalScore(scores, onlyIndependence)).toBe(90)
  })
})

describe('rubricsMatch', () => {
  it('is true for identical weights', () => {
    expect(rubricsMatch(DEFAULT_RUBRIC_CONFIG, { ...DEFAULT_RUBRIC_CONFIG })).toBe(true)
  })

  it('is false when any weight differs', () => {
    expect(
      rubricsMatch(DEFAULT_RUBRIC_CONFIG, { ...DEFAULT_RUBRIC_CONFIG, debuggingProcess: 30 })
    ).toBe(false)
  })

  it('treats a missing snapshot as not matching', () => {
    // Submissions imported before snapshots existed are unknown, not equal.
    expect(rubricsMatch(null, DEFAULT_RUBRIC_CONFIG)).toBe(false)
    expect(rubricsMatch(DEFAULT_RUBRIC_CONFIG, null)).toBe(false)
  })
})

describe('parseRubricSnapshot', () => {
  it('round-trips a stored snapshot', () => {
    expect(parseRubricSnapshot(JSON.stringify(DEFAULT_RUBRIC_CONFIG))).toEqual(DEFAULT_RUBRIC_CONFIG)
  })

  it('returns null for absent, malformed, or invalid snapshots', () => {
    for (const bad of [null, undefined, '', 'not json', '{"problemArticulation":20}', JSON.stringify({ ...DEFAULT_RUBRIC_CONFIG, iterationQuality: -1 })]) {
      expect(parseRubricSnapshot(bad as string)).toBe(null)
    }
  })
})

describe('independenceShown', () => {
  const metrics = {
    totalMessages: 10, userMessages: 5, assistantMessages: 5, averagePromptLength: 80,
    questionCount: 2, codeBlockCount: 4, userCodeBlocks: 0, errorMentions: 0,
    iterationCount: 4, shortPromptCount: 0, longPromptCount: 0,
  }
  const highlights = { questions: 2, errors: 0, shortPrompts: 0, codeReviews: 0, longContexts: 0 }
  const rewrite = {
    verbatimPercentage: 20, studentFirstPercentage: 0, modifiedLines: 0,
    addedLines: 0, removedLines: 0, assessment: 'significant-rewrite' as const,
  }
  const independence = (delegationCount?: number) =>
    calculateDimensionScores({
      metrics: { ...metrics, delegationCount },
      highlights,
      codeModification: rewrite,
      rubricConfig: DEFAULT_RUBRIC_CONFIG,
    }).independenceShown

  it('drops for each request that handed work over, up to a cap', () => {
    expect(independence(undefined)).toBe(95)
    expect(independence(2)).toBe(85)
    expect(independence(20)).toBe(65)
  })
})
