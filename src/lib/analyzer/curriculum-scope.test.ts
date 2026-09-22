import { describe, it, expect } from 'vitest'
import { checkCurriculumScope, detectTechniques, validateCurriculumScope, TECHNIQUE_LIBRARY } from './curriculum-scope'

const SAMPLE = `
* { box-sizing: border-box; }
:root { --accent: #333; }
.card:hover { transform: scale(1.02); }
.card { transition: 0.3s ease; }
.col:first-child { flex: 1; }
@media (max-width: 768px) { .card { display: flex; } }
`

describe('checkCurriculumScope', () => {
  it('flags every detected technique when nothing is marked taught', () => {
    const flags = checkCurriculumScope(SAMPLE, [])
    const flaggedIds = flags.map(f => f.id)
    expect(flaggedIds).toContain('css-box-sizing')
    expect(flaggedIds).toContain('css-custom-properties')
    expect(flaggedIds).toContain('css-hover')
    expect(flaggedIds).toContain('css-transforms')
    expect(flaggedIds).toContain('css-transitions')
    expect(flaggedIds).toContain('css-structural-pseudo')
    expect(flaggedIds).toContain('css-media-queries')
    expect(flaggedIds).toContain('css-flexbox')
  })

  it('does not flag a technique once marked taught', () => {
    const allIds = TECHNIQUE_LIBRARY.map(t => t.id)
    const flags = checkCurriculumScope(SAMPLE, allIds)
    expect(flags).toHaveLength(0)
  })

  it('only flags techniques actually present in the code', () => {
    const flags = checkCurriculumScope('<h1>Hi</h1>', [])
    expect(flags).toHaveLength(0)
  })

  it('attaches the teacher-supplied week citation when given', () => {
    const flags = checkCurriculumScope('.x { box-sizing: border-box; }', [], { 'css-box-sizing': 5 })
    const flag = flags.find(f => f.id === 'css-box-sizing')!
    expect(flag.syllabusWeek).toBe(5)
  })

  it('leaves syllabusWeek null when no week citation is supplied', () => {
    const flags = checkCurriculumScope('.x { box-sizing: border-box; }', [])
    const flag = flags.find(f => f.id === 'css-box-sizing')!
    expect(flag.syllabusWeek).toBeNull()
  })
})

describe('detectTechniques', () => {
  it('reports every technique present regardless of taught status', () => {
    const ids = detectTechniques(SAMPLE)
    expect(ids).toContain('css-box-sizing')
    expect(ids).toContain('css-hover')
  })

  it('returns nothing for plain HTML with no flagged techniques', () => {
    expect(detectTechniques('<h1>Hi</h1><p>Just text.</p>')).toEqual([])
  })
})

describe('validateCurriculumScope', () => {
  it('accepts a valid config', () => {
    const result = validateCurriculumScope({ taughtTechniqueIds: ['css-hover'] })
    expect(result.ok).toBe(true)
  })

  it('accepts an optional weekByTechnique map', () => {
    const result = validateCurriculumScope({ taughtTechniqueIds: [], weekByTechnique: { 'css-box-sizing': 5 } })
    expect(result.ok).toBe(true)
  })

  it('rejects a non-object', () => {
    expect(validateCurriculumScope('nope').ok).toBe(false)
    expect(validateCurriculumScope(null).ok).toBe(false)
    expect(validateCurriculumScope([]).ok).toBe(false)
  })

  it('rejects an unknown technique id', () => {
    const result = validateCurriculumScope({ taughtTechniqueIds: ['not-a-real-id'] })
    expect(result.ok).toBe(false)
  })

  it('rejects a non-numeric week', () => {
    const result = validateCurriculumScope({ taughtTechniqueIds: [], weekByTechnique: { 'css-hover': 'five' } })
    expect(result.ok).toBe(false)
  })
})
