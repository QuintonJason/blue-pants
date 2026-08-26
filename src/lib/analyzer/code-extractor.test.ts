import { describe, it, expect } from 'vitest'
import { analyzeModifications } from './code-extractor'

const AI_CODE = [
  'function total(items) {',
  '  let sum = 0;',
  '  for (const i of items) {',
  '    sum += i.price;',
  '  }',
  '  return sum;',
  '}',
].join('\n')

describe('analyzeModifications', () => {
  it('treats reformatted AI code as verbatim, not as a rewrite', () => {
    // The headline bug: identical code with the line breaks removed scored 0%
    // verbatim and was reported as a "significant rewrite" worth 95 on
    // Independence, while the same code pasted unchanged scored 20.
    const minified =
      'function total(items) { let sum = 0; for (const i of items) { sum += i.price; } return sum; }'

    const pasted = analyzeModifications(AI_CODE, AI_CODE)
    const reformatted = analyzeModifications(AI_CODE, minified)

    expect(pasted.assessment).toBe('verbatim')
    expect(reformatted.assessment).toBe('verbatim')
    expect(Math.round(reformatted.verbatimPercentage)).toBe(100)
  })

  it('is unaffected by indentation changes', () => {
    const reindented = AI_CODE.split('\n').map(l => '    ' + l.trim()).join('\n')
    expect(analyzeModifications(AI_CODE, reindented).assessment).toBe('verbatim')
  })

  it('still recognises genuinely independent code', () => {
    const ownWork = [
      'const cartTotal = (products) =>',
      '  products.reduce((acc, product) => acc + product.amountCents, 0) / 100;',
      'export default cartTotal;',
    ].join('\n')

    const result = analyzeModifications(AI_CODE, ownWork)
    expect(result.verbatimPercentage).toBeLessThan(50)
    expect(result.assessment).toBe('significant-rewrite')
  })

  it('recognises adapted code as a middle grade', () => {
    // Kept the assistant's structure but renamed everything and added a guard:
    // neither a paste nor independent work.
    const adapted = [
      'function total(products) {',
      '  if (!products) return 0;',
      '  let runningTotal = 0;',
      '  for (const product of products) {',
      '    runningTotal += product.price;',
      '  }',
      '  return runningTotal;',
      '}',
    ].join('\n')

    const result = analyzeModifications(AI_CODE, adapted)
    expect(result.verbatimPercentage).toBeGreaterThan(50)
    expect(result.verbatimPercentage).toBeLessThan(95)
    expect(result.assessment).toBe('substantial-changes')
  })

  it('grades a large independent addition as substantial own contribution', () => {
    const extended = [
      AI_CODE,
      'function applyDiscount(amount, percent) {',
      '  if (percent < 0 || percent > 100) throw new RangeError("bad percent");',
      '  return amount - (amount * percent) / 100;',
      '}',
      'const fmt = new Intl.NumberFormat("en-US", { style: "currency" });',
    ].join('\n')

    // Most of what was submitted is the student's own, so this reads as a rewrite
    // even though the assistant's code is still in there.
    expect(analyzeModifications(AI_CODE, extended).assessment).toBe('significant-rewrite')
  })

  it('handles empty input without dividing by zero', () => {
    expect(analyzeModifications('', '').verbatimPercentage).toBe(0)
    expect(analyzeModifications(AI_CODE, '').verbatimPercentage).toBe(0)
    expect(Number.isNaN(analyzeModifications('', AI_CODE).verbatimPercentage)).toBe(false)
  })

  it('still reports line counts for the rendered diff', () => {
    const changed = AI_CODE.replace('let sum = 0;', 'let sum = 0; // running total')
    const result = analyzeModifications(AI_CODE, changed)
    expect(result.addedLines).toBeGreaterThan(0)
    expect(result.removedLines).toBeGreaterThan(0)
  })
})
