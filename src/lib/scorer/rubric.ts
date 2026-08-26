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
function scoreIndependenceShown(ctx: ScoringContext): number {
  const { codeModification, metrics } = ctx

  // If no code modification analysis, use other signals
  if (!codeModification) {
    let score = 50

    // User sharing code is a good signal
    if (metrics.userCodeBlocks > 0) score += 20

    return Math.max(0, Math.min(100, score))
  }

  // Score based on modification analysis
  switch (codeModification.assessment) {
    case 'verbatim':
      return 20 // Copy-pasted AI code
    case 'minor-changes':
      return 50 // Some changes
    case 'substantial-changes':
      return 75 // Good modifications
    case 'significant-rewrite':
      return 95 // Significant personal contribution
    default:
      return 50
  }
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
 */
export function interpretScore(score: number): {
  label: string
  description: string
  color: string
} {
  if (score >= 90) {
    return {
      label: 'Excellent',
      description: 'Exceptional AI collaboration showing deep engagement',
      color: 'text-green-600',
    }
  } else if (score >= 75) {
    return {
      label: 'Good',
      description: 'Strong AI collaboration with clear understanding',
      color: 'text-blue-600',
    }
  } else if (score >= 60) {
    return {
      label: 'Satisfactory',
      description: 'Adequate AI collaboration with room for improvement',
      color: 'text-yellow-600',
    }
  } else if (score >= 40) {
    return {
      label: 'Needs Improvement',
      description: 'Limited engagement with AI assistance',
      color: 'text-orange-600',
    }
  } else {
    return {
      label: 'Poor',
      description: 'Minimal AI collaboration, possible copy-paste approach',
      color: 'text-red-600',
    }
  }
}
