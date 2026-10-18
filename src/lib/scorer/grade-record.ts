/**
 * Grade records
 *
 * The AI-use summary is computed live and the scoring rules change, so the
 * evidence shown beside a grade would otherwise drift after it was given: a grade
 * challenged at the end of term could sit beside counts, quotes and a "low score
 * in" line the teacher never saw. Each save of a grade appends a record of what
 * stood behind it at that moment. Records are only ever appended, so a revised
 * grade keeps its history.
 *
 * A record also fingerprints the transcript and code it was given on, so it can
 * be shown that the stored evidence is the same today, or flagged when it isn't.
 */

import type { ComputedMetrics, DimensionScores, RubricConfig, Submission } from '../db/schema'
import type { ParsedChat } from '../parser/chatgpt'
import { buildAiUseFeedback, type AiUseFeedback } from '../analyzer/feedback'
import { computeAggregateMetrics } from '../analyzer/metrics'
import { applyIntentOverrides, parseIntentOverrides, type IntentOverrides } from '../analyzer/intent-overrides'
import { suggestionStaleness, TRANSCRIPT_SCORER_VERSION, type StaleReason } from './pipeline'

/** SHA-256 of the stored transcript and code, exactly as stored; null when absent. */
export interface EvidenceFingerprint {
  chatSha256: string | null
  codeSha256: string | null
}

export interface GradeRecord {
  recordedAt: string
  finalScore: number
  /** The teacher's dimension scores, if the grade came from the rubric sliders. */
  dimensionScores: DimensionScores | null
  teacherNotes: string | null
  /** The suggestion beside which the grade was given, and whether it was outdated. */
  suggestedScore: number | null
  suggestedDimensionScores: DimensionScores | null
  suggestionStale: StaleReason[]
  rubric: RubricConfig
  scorerVersion: string
  /** The AI-use summary exactly as the teacher could see it. Null without a transcript. */
  feedback: AiUseFeedback | null
  metrics: ComputedMetrics | null
  /** Code-only evidence, the counterpart of the summary when there is no transcript. */
  aiLikelihoodScore: number | null
  aiLikelihoodScorerVersion: string | null
  /** Absent on records made before fingerprints were taken. */
  evidence?: EvidenceFingerprint
  /** The teacher's rulings on flagged messages, which the summary above reflects. */
  intentOverrides?: IntentOverrides
}

export interface GradeInput {
  finalScore: number
  dimensionScores: DimensionScores | null
  teacherNotes: string | null
}

export function buildGradeRecord(
  submission: Submission,
  rubric: RubricConfig,
  grade: GradeInput,
  evidence: EvidenceFingerprint,
  now: Date = new Date()
): GradeRecord {
  const intentOverrides = parseIntentOverrides(submission.intentOverrides)
  const chats: ParsedChat[] = applyIntentOverrides(
    submission.submissionMode === 'chat' ? parseJson(submission.chatExports, []) : [],
    intentOverrides
  )
  const hasTranscript = chats.length > 0

  return {
    recordedAt: now.toISOString(),
    finalScore: grade.finalScore,
    dimensionScores: grade.dimensionScores,
    teacherNotes: grade.teacherNotes,
    suggestedScore: submission.suggestedScore,
    suggestedDimensionScores: parseJson(submission.suggestedDimensionScores, null),
    suggestionStale: suggestionStaleness(submission, rubric),
    rubric,
    scorerVersion: TRANSCRIPT_SCORER_VERSION,
    feedback: hasTranscript ? buildAiUseFeedback(chats, submission.finalCode) : null,
    metrics: hasTranscript ? computeAggregateMetrics(chats) : null,
    aiLikelihoodScore: submission.aiLikelihoodScore,
    aiLikelihoodScorerVersion: submission.aiLikelihoodScorerVersion,
    evidence,
    intentOverrides,
  }
}

/**
 * The records with this grade added, or unchanged if it repeats the latest one:
 * saving again without changing anything isn't a new grading decision. The
 * same grade saved over changed evidence is one, though.
 */
export function appendGradeRecord(existing: GradeRecord[], record: GradeRecord): GradeRecord[] {
  const latest = existing[existing.length - 1]
  if (
    latest &&
    latest.finalScore === record.finalScore &&
    latest.teacherNotes === record.teacherNotes &&
    latest.scorerVersion === record.scorerVersion &&
    JSON.stringify(latest.dimensionScores) === JSON.stringify(record.dimensionScores) &&
    JSON.stringify(latest.rubric) === JSON.stringify(record.rubric) &&
    JSON.stringify(latest.evidence) === JSON.stringify(record.evidence) &&
    JSON.stringify(latest.intentOverrides ?? {}) === JSON.stringify(record.intentOverrides ?? {})
  ) {
    return existing
  }
  return [...existing, record]
}

export function parseGradeRecords(stored: string | null | undefined): GradeRecord[] {
  const parsed = parseJson<unknown>(stored, [])
  return Array.isArray(parsed) ? (parsed as GradeRecord[]) : []
}

function parseJson<T>(stored: string | null | undefined, fallback: T): T {
  if (!stored) return fallback
  try {
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}
