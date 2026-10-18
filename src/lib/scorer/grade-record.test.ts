import { describe, it, expect } from 'vitest'
import { appendGradeRecord, parseGradeRecords, type GradeRecord } from './grade-record'
import { DEFAULT_RUBRIC_CONFIG } from './rubric'

const record = (overrides: Partial<GradeRecord> = {}): GradeRecord => ({
  recordedAt: '2026-10-17T12:00:00.000Z',
  finalScore: 72,
  dimensionScores: null,
  teacherNotes: 'ok',
  suggestedScore: 70,
  suggestedDimensionScores: null,
  suggestionStale: [],
  rubric: DEFAULT_RUBRIC_CONFIG,
  scorerVersion: 'v1',
  feedback: null,
  metrics: null,
  aiLikelihoodScore: null,
  aiLikelihoodScorerVersion: null,
  ...overrides,
})

describe('appendGradeRecord', () => {
  it('adds a changed grade and keeps the earlier one', () => {
    expect(appendGradeRecord([record()], record({ finalScore: 65 })).map(r => r.finalScore)).toEqual([72, 65])
  })

  it('skips a save that repeats the latest grade', () => {
    const existing = [record()]
    expect(appendGradeRecord(existing, record({ recordedAt: '2026-12-01T00:00:00.000Z' }))).toBe(existing)
  })

  it('records the same grade again when the rules or rubric behind it changed', () => {
    expect(appendGradeRecord([record()], record({ scorerVersion: 'v2' }))).toHaveLength(2)
    const reweighted = { ...DEFAULT_RUBRIC_CONFIG, independenceShown: 40 }
    expect(appendGradeRecord([record()], record({ rubric: reweighted }))).toHaveLength(2)
  })
})

describe('parseGradeRecords', () => {
  it('reads nothing from empty or malformed storage', () => {
    expect(parseGradeRecords(null)).toEqual([])
    expect(parseGradeRecords('not json')).toEqual([])
    expect(parseGradeRecords('{"a":1}')).toEqual([])
  })
})
