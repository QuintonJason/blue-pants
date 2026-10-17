import { describe, it, expect } from 'vitest'
import { analyzeModifications, extractUserCode, findStudentFirstShingles } from './code-extractor'
import { chat, message } from './fixtures'

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

  it('recognises partly kept code as a middle grade', () => {
    // The assistant's function kept as-is, plus a comparable amount of the
    // student's own: neither a paste nor independent work.
    const partlyKept = [
      AI_CODE,
      'function discounted(items, percent) {',
      '  return total(items) * (1 - percent / 100);',
      '}',
    ].join('\n')

    const result = analyzeModifications(AI_CODE, partlyKept)
    expect(result.verbatimPercentage).toBeGreaterThan(50)
    expect(result.verbatimPercentage).toBeLessThan(80)
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

/** A long transcript's worth of generic page code, like a student building a site over many prompts. */
const LONG_TRANSCRIPT_CODE = Array.from({ length: 12 }, (_, i) => [
  `<header class="site-header"><nav><ul><li><a href="page${i}.html">Page ${i}</a></li><li><a href="about.html">About</a></li></ul></nav></header>`,
  `<main><section class="intro"><h2>Section ${i}</h2><p>Text for section ${i}.</p><img src="img/photo${i}.png" alt="Photo"></section></main>`,
  `.card-${i} { display: flex; padding: 1rem; margin: 0 auto; border-radius: 8px; color: #333; background: #fafafa; }`,
  `nav ul { list-style: none; display: flex; gap: 1rem; } footer { text-align: center; font-size: 0.875rem; }`,
].join('\n')).join('\n\n')

describe('analyzeModifications against a long transcript', () => {
  it('does not count unrelated markup as copied', () => {
    // Comparing single tokens scored this unrelated page as mostly the assistant's,
    // because every page is made of the same `<`, `li`, `a`, `href`.
    const unrelated = [
      '<!DOCTYPE html><html><head><title>Bakery</title></head><body>',
      '<header><h1>Sweet Crumbs</h1><nav><a href="menu.html">Menu</a> | <a href="hours.html">Hours</a></nav></header>',
      '<main><section class="specials"><h2>Today</h2><ul><li>Croissant</li><li>Rye loaf</li></ul></section></main>',
      '<footer><p>Open 7am to 3pm</p></footer></body></html>',
    ].join('\n')

    expect(analyzeModifications(LONG_TRANSCRIPT_CODE, unrelated).assessment).toBe('significant-rewrite')
  })

  it('still recognises a page pasted from the transcript', () => {
    const pasted = LONG_TRANSCRIPT_CODE.split('\n').slice(0, 6).join('\n')
    expect(analyzeModifications(LONG_TRANSCRIPT_CODE, pasted).assessment).toBe('verbatim')
  })
})

describe('findStudentFirstShingles', () => {
  const STUDENT_PAGE = [
    '<section class="clan-history">',
    '  <h2>Our History</h2>',
    '  <p>The clan settled by the river after the long winter.</p>',
    '  <a href="moons.html" class="next-link">Read about the moons</a>',
    '</section>',
  ].join('\n')

  it("credits code the student pasted before the assistant repeated it", () => {
    const echoed = chat(
      message('user', `whats wrong with this\n${STUDENT_PAGE}`),
      message('assistant', `Nothing major. Here it is with a fix:\n\n\`\`\`html\n${STUDENT_PAGE}\n\`\`\``),
    )
    const aiCode = echoed.messages[1].codeBlocks.map(b => b.code).join('\n')

    const withoutCredit = analyzeModifications(aiCode, STUDENT_PAGE)
    const withCredit = analyzeModifications(aiCode, STUDENT_PAGE, findStudentFirstShingles([echoed]))

    expect(withoutCredit.assessment).toBe('verbatim')
    expect(withCredit.assessment).toBe('significant-rewrite')
    expect(withCredit.studentFirstPercentage).toBeGreaterThan(90)
  })

  it("does not credit the student for pasting the assistant's code back", () => {
    const pastedBack = chat(
      message('assistant', `\`\`\`html\n${STUDENT_PAGE}\n\`\`\``),
      message('user', `do i keep this?\n${STUDENT_PAGE}`),
    )
    const aiCode = pastedBack.messages[0].codeBlocks.map(b => b.code).join('\n')

    const result = analyzeModifications(aiCode, STUDENT_PAGE, findStudentFirstShingles([pastedBack]))
    expect(result.assessment).toBe('verbatim')
    expect(result.studentFirstPercentage).toBe(0)
  })
})

describe('extractUserCode', () => {
  it('counts code pasted without markdown fences', () => {
    const pasted = chat(message('user', [
      'why isnt this working',
      '<footer class="chapter-nav">',
      '  <a href="prologue.html">Previous</a>',
      '  <a href="chapter2.html">Next</a>',
      '</footer>',
    ].join('\n')))

    expect(extractUserCode(pasted)).toHaveLength(1)
    expect(extractUserCode(pasted)[0].language).toBe('html')
  })

  it('does not mistake prose for code', () => {
    const story = chat(message('user', [
      'create a one sentence summary of this',
      'A young cat pattered towards a small group of cats.',
      'They were quietly socializing in a grassy clearing.',
      'Nobody noticed her at first.',
    ].join('\n')))

    expect(extractUserCode(story)).toHaveLength(0)
  })
})
