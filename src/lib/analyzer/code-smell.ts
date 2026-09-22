// Heuristic, code-only estimate of AI-generation likelihood for the 'code_only' path (no chat transcript) — evidence for a human call, never a verdict. Signals are independent and capped; weights sum to 100.

import type { CodeSmellSignalResult } from '../db/schema'

/** Strip HTML/JS/CSS comments and tags to approximate visible reader-facing text. */
function extractVisibleText(code: string): string {
  return code
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract comment bodies across HTML, CSS, and C-style/JS comment syntax. */
function extractComments(code: string): string[] {
  const comments: string[] = []
  for (const match of Array.from(code.matchAll(/<!--([\s\S]*?)-->/g))) comments.push(match[1])
  for (const match of Array.from(code.matchAll(/\/\*([\s\S]*?)\*\//g))) comments.push(match[1])
  for (const match of Array.from(code.matchAll(/(^|[^:])\/\/(.*)$/gm))) comments.push(match[2])
  return comments.map(c => c.trim()).filter(c => c.length > 0)
}

const EXPLANATORY_COMMENT_PATTERNS = [
  /\bthis (sets|is|will|shows|adds|creates|handles|controls|makes|ensures|hides|moves|declares)\b/i,
  /\bnote:/i,
  /\bmakes? sure\b/i,
  /\bused to\b/i,
  /\bin order to\b/i,
  /\bhelps? (to )?\b/i,
  /\bdeclaring\b/i,
  /\bstuff when\b/i,
]

interface SignalDefinition {
  id: string
  label: string
  maxPoints: number
  detect: (code: string) => { triggered: boolean; points: number; evidence: string[] }
}

// Comments that narrate self-evident code in tutorial prose, rather than the "why" a student note usually captures.
const explanatoryComments: SignalDefinition = {
  id: 'explanatoryComments',
  label: 'Explanatory, tutorial-style comments',
  maxPoints: 25,
  detect(code) {
    const comments = extractComments(code)
    const hits = comments.filter(c => EXPLANATORY_COMMENT_PATTERNS.some(p => p.test(c)))
    const points = Math.min(hits.length * 8, 25)
    return { triggered: hits.length > 0, points, evidence: hits.slice(0, 5) }
  },
}

// Accessibility/security hardening applied everywhere it could apply, not just once — the pattern a linter or generator produces.
const consistentBestPractices: SignalDefinition = {
  id: 'consistentBestPractices',
  label: 'Uniformly applied accessibility/security best practices',
  maxPoints: 20,
  detect(code) {
    const evidence: string[] = []
    let points = 0

    const blankLinks = Array.from(code.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi))
    if (blankLinks.length > 0) {
      const withNoopener = blankLinks.filter(m => /rel=["'][^"']*noopener/i.test(m[0]))
      if (withNoopener.length === blankLinks.length) {
        points += 8
        evidence.push(`rel="noopener noreferrer" on all ${blankLinks.length} target="_blank" link(s)`)
      }
    }

    const images = Array.from(code.matchAll(/<img\b[^>]*>/gi))
    if (images.length > 0) {
      const withGoodAlt = images.filter(m => {
        const alt = /alt=["']([^"']*)["']/i.exec(m[0])
        return !!alt && alt[1].trim().length > 3 && !/\.(png|jpe?g|gif|webp)$/i.test(alt[1].trim())
      })
      if (withGoodAlt.length === images.length) {
        points += 6
        evidence.push(`descriptive alt text on all ${images.length} image(s)`)
      }
    }

    if (/<meta\s+name=["']viewport["']/i.test(code) && /<link[^>]*rel=["']icon["']/i.test(code)) {
      points += 6
      evidence.push('viewport meta tag and favicon both present')
    }

    return { triggered: points > 0, points, evidence }
  },
}

// CSS structure a first project rarely reaches for unprompted: custom properties, a responsive breakpoint, hover/transition micro-interactions.
const structuralSophistication: SignalDefinition = {
  id: 'structuralSophistication',
  label: 'CSS structure beyond an intro assignment',
  maxPoints: 20,
  detect(code) {
    const evidence: string[] = []
    let points = 0

    if (/:root\s*{[^}]*--[\w-]+\s*:/.test(code)) {
      points += 7
      evidence.push('CSS custom properties declared on :root')
    }
    if (/@media\s*\([^)]*(min|max)-width/i.test(code)) {
      points += 6
      evidence.push('responsive @media breakpoint')
    }
    if (/:hover\s*{[^}]*}/.test(code) && /transition\s*:/i.test(code)) {
      points += 7
      evidence.push('hover state paired with a CSS transition')
    }

    return { triggered: points > 0, points, evidence }
  },
}

const LLM_PHRASE_PATTERNS = [
  /\bwhatever the reason\b/i,
  /\bhere'?s a (quick|brief) (breakdown|overview|look)\b/i,
  /\blet'?s (dive|get) (in|started)\b/i,
  /\bin today'?s\b/i,
  /\bit'?s (worth|important) (noting|mentioning)\b/i,
  /\bwhether you'?re\b/i,
  /\bat the end of the day\b/i,
]

// Stock transitional phrasing in visible page text — one hit proves nothing, but density is unusual for a first project.
const stockPhrasing: SignalDefinition = {
  id: 'stockPhrasing',
  label: 'Stock transitional phrasing in page text',
  maxPoints: 20,
  detect(code) {
    const text = extractVisibleText(code)
    const hits: string[] = []
    for (const pattern of LLM_PHRASE_PATTERNS) {
      const match = pattern.exec(text)
      if (match) hits.push(match[0])
    }
    const emDashCount = (text.match(/—/g) ?? []).length
    if (emDashCount >= 2) hits.push(`${emDashCount} em dashes`)

    const points = Math.min(hits.length * 7, 20)
    return { triggered: hits.length > 0, points, evidence: hits.slice(0, 5) }
  },
}

// Absence of the rough edges a first draft usually has — individually unremarkable, together unusually clean.
const uniformPolish: SignalDefinition = {
  id: 'uniformPolish',
  label: 'No rough edges anywhere in the file',
  maxPoints: 15,
  detect(code) {
    // Absence-of-markers checks are meaningless on trivial input (empty string trivially has "no TODO markers").
    if (code.trim().length < 20) return { triggered: false, points: 0, evidence: [] }

    const evidence: string[] = []
    let points = 0

    const usesExternalStylesheet = /<link[^>]*rel=["']stylesheet["']/i.test(code)
    const hasInlineStyle = /style=["'][^"']+["']/i.test(code)
    if (usesExternalStylesheet && !hasInlineStyle) {
      points += 5
      evidence.push('zero inline styles despite an external stylesheet')
    }

    if (!/\b(TODO|FIXME|console\.log|XXX)\b/i.test(code)) {
      points += 4
      evidence.push('no leftover TODO/FIXME/debug markers')
    }

    const lines = code.split('\n').filter(l => /^\s+\S/.test(l))
    if (lines.length >= 8) {
      const indentUnits = lines.map(l => (l.match(/^\s*/)?.[0].length ?? 0))
      const usesTabs = lines.some(l => /^\t/.test(l))
      const allEven = !usesTabs && indentUnits.every(n => n % 2 === 0)
      if (allEven || usesTabs) {
        points += 6
        evidence.push('perfectly consistent indentation throughout')
      }
    }

    return { triggered: points > 0, points, evidence }
  },
}

const SIGNALS: SignalDefinition[] = [
  explanatoryComments,
  consistentBestPractices,
  structuralSophistication,
  stockPhrasing,
  uniformPolish,
]

export interface CodeSmellReport {
  score: number
  signals: CodeSmellSignalResult[]
}

// Score how much a code submission alone resembles AI output. Pure, like scoreSubmission in scorer/pipeline.ts.
export function scoreAiLikelihood(code: string): CodeSmellReport {
  const signals: CodeSmellSignalResult[] = SIGNALS.map(def => {
    const result = def.detect(code)
    return {
      id: def.id,
      label: def.label,
      points: result.points,
      maxPoints: def.maxPoints,
      triggered: result.triggered,
      evidence: result.evidence,
    }
  })

  const score = Math.max(0, Math.min(100, signals.reduce((sum, s) => sum + s.points, 0)))

  return { score, signals }
}

// Human-facing interpretation of the score — deliberately hedged, a conversation starter, not a finding of fact.
export function interpretAiLikelihood(score: number): {
  label: string
  description: string
  color: string
} {
  if (score >= 70) {
    return {
      label: 'Strong indicators',
      description: 'Multiple signals consistent with AI-generated code. Not proof — treat as a reason to ask for the student\'s process, not a verdict.',
      color: 'text-red-600',
    }
  } else if (score >= 45) {
    return {
      label: 'Some indicators',
      description: 'A few signals worth a closer look, but well within what an attentive student could produce.',
      color: 'text-orange-600',
    }
  } else if (score >= 20) {
    return {
      label: 'Few indicators',
      description: 'Mostly consistent with independent work, with a couple of minor signals.',
      color: 'text-yellow-600',
    }
  } else {
    return {
      label: 'Minimal indicators',
      description: 'Little in the code itself suggests AI generation.',
      color: 'text-green-600',
    }
  }
}
