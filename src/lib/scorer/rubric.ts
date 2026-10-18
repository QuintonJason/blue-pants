/**
 * Rubric Scorer
 *
 * Calculates suggested scores based on computed metrics
 * and rubric configuration.
 */

import { ComputedMetrics, RubricConfig, DimensionScores } from '../db/schema'
import { HighlightSummary } from '../analyzer/highlighter'
import { ModificationAnalysis } from '../analyzer/code-extractor'

/**
 * Default rubric weights (total = 100)
 */
export const DEFAULT_RUBRIC_CONFIG: RubricConfig = {
  problemArticulation: 20,
  iterationQuality: 20,
  criticalEvaluation: 20,
  codeReviewEngagement: 20,
  debuggingProcess: 10,
  independenceShown: 10,
}

/** The six dimensions every rubric must weight. */
export const RUBRIC_DIMENSIONS = [
  'problemArticulation',
  'iterationQuality',
  'criticalEvaluation',
  'codeReviewEngagement',
  'debuggingProcess',
  'independenceShown',
] as const

export type RubricValidation =
  | { ok: true; value: RubricConfig }
  | { ok: false; error: string }

/**
 * Validates a rubric config from an untrusted source.
 *
 * The weights are a divisor in calculateTotalScore, so a config that sums to
 * zero would turn every score into NaN. Reject it at the boundary instead.
 */
export function validateRubricConfig(input: unknown): RubricValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Rubric config must be an object' }
  }

  const record = input as Record<string, unknown>
  const value = {} as RubricConfig

  for (const dimension of RUBRIC_DIMENSIONS) {
    const weight = record[dimension]
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      return { ok: false, error: `Weight for ${dimension} must be a finite number` }
    }
    if (weight < 0 || weight > 100) {
      return { ok: false, error: `Weight for ${dimension} must be between 0 and 100` }
    }
    value[dimension] = weight
  }

  const total = RUBRIC_DIMENSIONS.reduce((sum, d) => sum + value[d], 0)
  if (total <= 0) {
    return { ok: false, error: 'Rubric weights must add up to more than 0' }
  }

  return { ok: true, value }
}

/**
 * Whether two rubrics would weight a submission differently.
 *
 * Assignment rubrics are editable after grading, so a stored suggested score can
 * silently stop matching the weights shown next to it. Comparing the snapshot the
 * score was computed with against the assignment's current rubric is what makes
 * that visible.
 */
export function rubricsMatch(a: RubricConfig | null, b: RubricConfig | null): boolean {
  if (!a || !b) return false
  return RUBRIC_DIMENSIONS.every(dimension => a[dimension] === b[dimension])
}

/**
 * Parse a stored rubric snapshot, returning null if it is absent or unusable.
 *
 * Submissions imported before snapshots were recorded have none, which reads as
 * "unknown" rather than "matching".
 */
export function parseRubricSnapshot(stored: string | null | undefined): RubricConfig | null {
  if (!stored) return null
  try {
    const validated = validateRubricConfig(JSON.parse(stored))
    return validated.ok ? validated.value : null
  } catch {
    return null
  }
}

/**
 * Scoring context - all the data needed to compute scores
 */
export interface ScoringContext {
  metrics: ComputedMetrics
  highlights: HighlightSummary
  codeModification?: ModificationAnalysis
  rubricConfig: RubricConfig
}

/**
 * Calculate score for Problem Articulation (0-100)
 * Based on: average prompt length, long context count
 */
function scoreProblemArticulation(ctx: ScoringContext): number {
  const { metrics, highlights } = ctx

  let score = 50 // Base score

  // Reward longer average prompts (more context)
  if (metrics.averagePromptLength > 200) score += 20
  else if (metrics.averagePromptLength > 100) score += 10
  else if (metrics.averagePromptLength < 50) score -= 20

  // Reward detailed context messages
  score += Math.min(highlights.longContexts * 10, 20)

  // Penalize too many short prompts
  const shortPromptRatio = metrics.shortPromptCount / Math.max(metrics.userMessages, 1)
  if (shortPromptRatio > 0.5) score -= 20
  else if (shortPromptRatio > 0.3) score -= 10

  return Math.max(0, Math.min(100, score))
}

/**
 * Calculate score for Iteration Quality (0-100)
 * Based on: iteration count, follow-up patterns
 */
function scoreIterationQuality(ctx: ScoringContext): number {
  const { metrics } = ctx

  let score = 30 // Base score

  // Reward iterations (shows refinement)
  score += Math.min(metrics.iterationCount * 15, 40)

  // Reward multiple exchanges
  if (metrics.userMessages >= 5) score += 15
  else if (metrics.userMessages >= 3) score += 10
  else if (metrics.userMessages === 1) score -= 30 // One-shot = red flag

  // Penalize if no iterations at all
  if (metrics.iterationCount === 0 && metrics.userMessages > 1) {
    score -= 10
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Calculate score for Critical Evaluation (0-100)
 * Based on: question count, understanding signals
 */
function scoreCriticalEvaluation(ctx: ScoringContext): number {
  const { metrics, highlights } = ctx

  let score = 40 // Base score

  // Reward questions asked
  score += Math.min(highlights.questions * 10, 30)

  // Reward user sharing their own code (shows engagement)
  if (metrics.userCodeBlocks > 0) score += 15

  // Penalize if no questions at all
  if (highlights.questions === 0) score -= 20

  return Math.max(0, Math.min(100, score))
}

/**
 * Calculate score for Code Review Engagement (0-100)
 * Based on: code review requests, specific feedback asks
 */
function scoreCodeReviewEngagement(ctx: ScoringContext): number {
  const { highlights } = ctx

  let score = 30 // Base score

  // Reward code review requests
  score += Math.min(highlights.codeReviews * 20, 50)

  // If no code review at all, penalize
  if (highlights.codeReviews === 0) score -= 20

  return Math.max(0, Math.min(100, score))
}

/**
 * Calculate score for Debugging Process (0-100)
 * Based on: error mentions, debugging discussions
 */
function scoreDebuggingProcess(ctx: ScoringContext): number {
  const { highlights } = ctx

  // Note: No errors could mean they got it right first time OR
  // they never encountered issues (suspicious for complex tasks)
  // We give benefit of the doubt but reward debugging discussions

  let score = 50 // Base score

  // Reward error/debugging discussions. Counted once: highlights.errors and
  // metrics.errorMentions both derive from the same signal over the same student
  // messages, so adding both rewarded a single debugging exchange twice.
  score += Math.min(highlights.errors * 15, 40)

  return Math.max(0, Math.min(100, score))
}

/**
 * Calculate score for Independence Shown (0-100)
 * Based on: code modification analysis (if available)
 */
/** Points off Independence per request that handed over a whole feature, page or file. */
const DELEGATION_PENALTY = 5
const DELEGATION_PENALTY_MAX = 30

function scoreIndependenceShown(ctx: ScoringContext): number {
  const { codeModification, metrics } = ctx

  // The code comparison can't see everything the assistant wrote: files it handed
  // over as downloads never appear in the transcript. Asking for whole features is
  // direct evidence either way, so it counts against independence on its own.
  const delegationPenalty = Math.min(
    (metrics.delegationCount ?? 0) * DELEGATION_PENALTY,
    DELEGATION_PENALTY_MAX
  )

  // If no code modification analysis, use other signals
  if (!codeModification) {
    let score = 50

    // User sharing code is a good signal
    if (metrics.userCodeBlocks > 0) score += 20

    return Math.max(0, Math.min(100, score - delegationPenalty))
  }

  // Score based on modification analysis
  let score: number
  switch (codeModification.assessment) {
    case 'verbatim':
      score = 20 // Copy-pasted AI code
      break
    case 'minor-changes':
      score = 50 // Some changes
      break
    case 'substantial-changes':
      score = 75 // Good modifications
      break
    case 'significant-rewrite':
      score = 95 // Significant personal contribution
      break
    default:
      score = 50
  }

  return Math.max(0, score - delegationPenalty)
}

/**
 * Calculate all dimension scores
 */
export function calculateDimensionScores(ctx: ScoringContext): DimensionScores {
  return {
    problemArticulation: scoreProblemArticulation(ctx),
    iterationQuality: scoreIterationQuality(ctx),
    criticalEvaluation: scoreCriticalEvaluation(ctx),
    codeReviewEngagement: scoreCodeReviewEngagement(ctx),
    debuggingProcess: scoreDebuggingProcess(ctx),
    independenceShown: scoreIndependenceShown(ctx),
  }
}

/**
 * Calculate weighted total score
 */
export function calculateTotalScore(
  dimensionScores: DimensionScores,
  rubricConfig: RubricConfig
): number {
  const totalWeight = Object.values(rubricConfig).reduce((sum, w) => sum + w, 0)

  // Guard the divisor: a zero total would yield NaN and poison every stored score.
  if (!(totalWeight > 0)) return 0

  const weightedSum =
    (dimensionScores.problemArticulation * rubricConfig.problemArticulation) +
    (dimensionScores.iterationQuality * rubricConfig.iterationQuality) +
    (dimensionScores.criticalEvaluation * rubricConfig.criticalEvaluation) +
    (dimensionScores.codeReviewEngagement * rubricConfig.codeReviewEngagement) +
    (dimensionScores.debuggingProcess * rubricConfig.debuggingProcess) +
    (dimensionScores.independenceShown * rubricConfig.independenceShown)

  return Math.round(weightedSum / totalWeight)
}

/**
 * Full scoring function - returns dimension scores and total
 */
export function calculateScores(ctx: ScoringContext): {
  dimensionScores: DimensionScores
  totalScore: number
} {
  const dimensionScores = calculateDimensionScores(ctx)
  const totalScore = calculateTotalScore(dimensionScores, ctx.rubricConfig)

  return { dimensionScores, totalScore }
}

/**
 * Get score interpretation
 *
 * Driven by the total alone, so it describes the process in general terms and
 * claims nothing about understanding: a 77% built from strong questioning and a
 * 20% for independence used to read "Strong AI collaboration with clear
 * understanding". weakDimensions() names what the total hides.
 */
export function interpretScore(score: number): {
  label: string
  description: string
  color: string
} {
  if (score >= 90) {
    return {
      label: 'Excellent',
      description: 'Strong collaboration process across the rubric',
      color: 'text-green-600',
    }
  } else if (score >= 75) {
    return {
      label: 'Good',
      description: 'Solid collaboration process overall',
      color: 'text-blue-600',
    }
  } else if (score >= 60) {
    return {
      label: 'Satisfactory',
      description: 'Adequate collaboration process, with clear gaps',
      color: 'text-yellow-600',
    }
  } else if (score >= 40) {
    return {
      label: 'Needs Improvement',
      description: 'Limited engagement in the collaboration process',
      color: 'text-orange-600',
    }
  } else {
    return {
      label: 'Poor',
      description: 'Little evidence of a collaboration process, possible copy-paste approach',
      color: 'text-red-600',
    }
  }
}

/** A dimension scoring below this is called out beside the total. */
export const WEAK_DIMENSION_THRESHOLD = 50

/**
 * Weighted dimensions scoring below WEAK_DIMENSION_THRESHOLD, weakest first. A
 * weighted average can be high while one dimension is very low; this keeps that
 * dimension from disappearing behind the total.
 */
export function weakDimensions(
  scores: DimensionScores,
  rubricConfig: RubricConfig
): Array<keyof DimensionScores> {
  return (Object.keys(scores) as Array<keyof DimensionScores>)
    .filter(key => rubricConfig[key] > 0 && scores[key] < WEAK_DIMENSION_THRESHOLD)
    .sort((a, b) => scores[a] - scores[b])
}

/** A grade at least this many points from the suggestion needs a written reason. */
export const OVERRIDE_REASON_POINTS = 10

/**
 * Whether a grade departs far enough from the suggestion to need a reason in the
 * teacher's notes: the grade is the teacher's call, but an appeal will ask why it
 * differs from what the analysis suggested.
 */
export function needsOverrideReason(finalScore: number, suggestedScore: number | null): boolean {
  return suggestedScore !== null && Math.abs(finalScore - Math.round(suggestedScore)) >= OVERRIDE_REASON_POINTS
}
