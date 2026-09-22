// Heuristic, code-only estimate of AI-generation likelihood for the 'code_only' path (no chat transcript) — evidence for a human call, never a verdict. Signals are independent and capped; weights sum to 100.
//
// Deliberately excludes anything that rewards following a taught rule or an
// assignment's own explicit requirements (e.g. alt text, target=_blank security
// attributes, or "bonus" CSS the brief invites) — scoring "did what was asked" as
// suspicious is indefensible on appeal and was cut after review. Signals here are
// only about authorial voice (comment style, page prose, leftover rough edges).

import type { CodeSmellSignalResult } from '../db/schema'

// Bump whenever a signal or weight changes, so a stored score stays explainable against the exact ruleset that produced it.
export const CODE_SMELL_SCORER_VERSION = '2026-09-22.2'

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
  maxPoints: 40,
  detect(code) {
    const comments = extractComments(code)
    const hits = comments.filter(c => EXPLANATORY_COMMENT_PATTERNS.some(p => p.test(c)))
    const points = Math.min(hits.length * 13, 40)
    return { triggered: hits.length > 0, points, evidence: hits.slice(0, 5) }
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
  maxPoints: 35,
  detect(code) {
    const text = extractVisibleText(code)
    const hits: string[] = []
    for (const pattern of LLM_PHRASE_PATTERNS) {
      const match = pattern.exec(text)
      if (match) hits.push(match[0])
    }
    const emDashCount = (text.match(/—/g) ?? []).length
    if (emDashCount >= 2) hits.push(`${emDashCount} em dashes`)

    const points = Math.min(hits.length * 12, 35)
    return { triggered: hits.length > 0, points, evidence: hits.slice(0, 5) }
  },
}

// Absence of the rough edges a first draft usually has — individually unremarkable, together unusually clean.
const uniformPolish: SignalDefinition = {
  id: 'uniformPolish',
  label: 'No rough edges anywhere in the file',
  maxPoints: 25,
  detect(code) {
    // Absence-of-markers checks are meaningless on trivial input (empty string trivially has "no TODO markers").
    if (code.trim().length < 20) return { triggered: false, points: 0, evidence: [] }

    const evidence: string[] = []
    let points = 0

    const usesExternalStylesheet = /<link[^>]*rel=["']stylesheet["']/i.test(code)
    const hasInlineStyle = /style=["'][^"']+["']/i.test(code)
    if (usesExternalStylesheet && !hasInlineStyle) {
      points += 8
      evidence.push('zero inline styles despite an external stylesheet')
    }

    if (!/\b(TODO|FIXME|console\.log|XXX)\b/i.test(code)) {
      points += 7
      evidence.push('no leftover TODO/FIXME/debug markers')
    }

    const lines = code.split('\n').filter(l => /^\s+\S/.test(l))
    if (lines.length >= 8) {
      const indentUnits = lines.map(l => (l.match(/^\s*/)?.[0].length ?? 0))
      const usesTabs = lines.some(l => /^\t/.test(l))
      const allEven = !usesTabs && indentUnits.every(n => n % 2 === 0)
      if (allEven || usesTabs) {
        points += 10
        evidence.push('perfectly consistent indentation throughout')
      }
    }

    return { triggered: points > 0, points, evidence }
  },
}

const SIGNALS: SignalDefinition[] = [
  explanatoryComments,
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
      description: 'Multiple signals consistent with AI-generated code. Not sufficient on its own to support an academic-integrity finding — use it to decide whether to have a conversation with the student, not as the basis for one.',
      color: 'text-red-600',
    }
  } else if (score >= 45) {
    return {
      label: 'Some indicators',
      description: 'A few signals worth a closer look, but well within what an attentive student could produce on their own.',
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
