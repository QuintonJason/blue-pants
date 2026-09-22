import { describe, it, expect } from 'vitest'
import { scoreAiLikelihood, interpretAiLikelihood } from './code-smell'

const AI_LIKE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="styles.css">
  <link rel="icon" type="image/png" href="icon.png">
  <title>Guide</title>
</head>
<body>
  <h1>Guide</h1>
  <p>Whatever the reason, here's a quick breakdown of what you need to know.</p>
  <p>It's worth noting that — whether you're a beginner or not — this helps a lot.</p>
  <a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>
  <img src="a.jpg" alt="A descriptive caption of the photo">
</body>
</html>
`

const CSS_LIKE = `
* { box-sizing: border-box; }
:root {
  --paper: #fff;
  --accent: #333;
}
/* declaring variables so this is easy to reuse */
.card {
  transition: 0.3s ease;
}
.card:hover {
  transform: scale(1.02);
}
@media (max-width: 768px) {
  .card { flex-direction: column; }
}
`

const STUDENT_LIKE = `
<!DOCTYPE html>
<html>
<head>
  <title>my page</title>
  <link rel="stylesheet" href="style.css">
</head>
<body style="background-color: lightblue;">
  <h1>My Page</h1>
  <!-- todo: add more stuff -->
  <p>this is my page for the assignment</p>
  <a href="https://example.com">link</a>
  <img src="dog.jpg" alt="dog.jpg">
</body>
</html>
`

describe('scoreAiLikelihood', () => {
  it('scores AI-flavored HTML/CSS higher than plain student HTML', () => {
    const aiLike = scoreAiLikelihood(AI_LIKE + CSS_LIKE)
    const studentLike = scoreAiLikelihood(STUDENT_LIKE)
    expect(aiLike.score).toBeGreaterThan(studentLike.score)
  })

  it('stays within 0-100', () => {
    const { score } = scoreAiLikelihood(AI_LIKE + CSS_LIKE)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns evidence only for triggered signals', () => {
    const { signals } = scoreAiLikelihood(STUDENT_LIKE)
    for (const signal of signals) {
      if (!signal.triggered) expect(signal.evidence).toHaveLength(0)
    }
  })

  it('handles empty code without throwing', () => {
    const { score, signals } = scoreAiLikelihood('')
    expect(score).toBe(0)
    expect(signals.every(s => !s.triggered)).toBe(true)
  })

  it('never scores fulfilling an assignment requirement as suspicious', () => {
    // rel="noopener noreferrer", alt text, and a responsive/animated CSS flourish
    // are things this exact assignment brief explicitly required or invited as
    // bonus work — scoring compliance as evidence of cheating doesn't survive an
    // appeal, so no signal may key off them. Regression test for that decision:
    // adding only those specific behaviors must not move the score at all.
    // Identical line count and indentation in both variants — the only
    // difference is the compliant attributes/rules themselves — so the two
    // scores are only comparable if those attributes carry no weight.
    const base = `
      <a href="https://a.com">A</a>
      <img src="a.jpg">
      <style>
        .card { color: red; }
        .box { color: blue; }
        .row { color: green; }
        .col { color: black; }
      </style>
    `
    const withCompliantExtras = `
      <a href="https://a.com" target="_blank" rel="noopener noreferrer">A</a>
      <img src="a.jpg" alt="A descriptive caption">
      <style>
        .card { color: red; }
        :root { --accent: #333; }
        .card:hover { transform: scale(1.02); }
        @media (max-width: 768px) { .card { flex-direction: column; } }
      </style>
    `
    expect(scoreAiLikelihood(withCompliantExtras).score).toBe(scoreAiLikelihood(base).score)

    const signalIds = scoreAiLikelihood(withCompliantExtras).signals.map(s => s.id)
    expect(signalIds).not.toContain('consistentBestPractices')
    expect(signalIds).not.toContain('structuralSophistication')
  })
})

describe('interpretAiLikelihood', () => {
  it('labels the full range without gaps', () => {
    for (const score of [0, 19, 20, 44, 45, 69, 70, 100]) {
      expect(interpretAiLikelihood(score).label).toBeTruthy()
    }
  })

  it('never claims certainty', () => {
    for (const score of [0, 30, 60, 90]) {
      const { description } = interpretAiLikelihood(score)
      expect(description.toLowerCase()).not.toMatch(/\bproof\b(?!.*not)/)
    }
  })
})
