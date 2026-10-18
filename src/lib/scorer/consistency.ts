/**
 * Grading consistency
 *
 * How the teacher's grades on one assignment relate to the analysis behind them,
 * for the report: how far grades depart from the suggestions, how often the
 * teacher overrules the hand-off and off-topic flags (the practical measure of
 * how far to trust them), and whether everyone was graded under the same
 * scoring rules.
 */

import type { Submission } from '../db/schema'
import type { ParsedChat } from '../parser/chatgpt'
import { flaggedMessages, parseIntentOverrides, rulingAgreement, type IntentKind } from '../analyzer/intent-overrides'
import { OVERRIDE_REASON_POINTS } from './rubric'
import { parseGradeRecords } from './grade-record'

export interface GradingConsistency {
  /** Graded submissions that had a suggestion to compare with. */
  compared: number
  /** Mean of grade minus suggestion: positive means grades run above the suggestions. */
  averageGap: number | null
  /** Grades OVERRIDE_REASON_POINTS or more from their suggestion. */
  departed: number
  flags: Record<IntentKind, { flagged: number; overruled: number }>
  /** Scoring-rules versions the current grades were recorded under, oldest first. */
  scorerVersions: string[]
  /** Graded before grade records existed, so their scoring rules are unknown. */
  unrecorded: number
}

export function gradingConsistency(submissions: Submission[]): GradingConsistency {
  const graded = submissions.filter(s => s.finalScore !== null)
  const latest = graded.map(s => ({ submission: s, record: parseGradeRecords(s.gradeRecords).at(-1) }))

  // Compare with the suggestion the teacher saw when grading, where it was recorded.
  const gaps = latest.flatMap(({ submission, record }) => {
    const suggested = record ? record.suggestedScore : submission.suggestedScore
    return suggested === null ? [] : [submission.finalScore! - Math.round(suggested)]
  })

  const flagged = submissions
    .filter(s => s.submissionMode === 'chat' && s.chatExports)
    .flatMap(s => flaggedMessages(parseChats(s.chatExports), parseIntentOverrides(s.intentOverrides)))

  const versions = latest.flatMap(({ submission, record }) =>
    record && submission.submissionMode === 'chat' ? [record.scorerVersion] : []
  )

  return {
    compared: gaps.length,
    averageGap: gaps.length > 0 ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
    departed: gaps.filter(gap => Math.abs(gap) >= OVERRIDE_REASON_POINTS).length,
    flags: rulingAgreement(flagged),
    scorerVersions: Array.from(new Set(versions)).sort(),
    unrecorded: latest.filter(({ record }) => !record).length,
  }
}

function parseChats(stored: string | null): ParsedChat[] {
  try {
    const parsed = JSON.parse(stored || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
