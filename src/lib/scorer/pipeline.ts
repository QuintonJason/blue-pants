/**
 * Scoring Pipeline
 *
 * One path from parsed transcripts to a suggested score, shared by import, batch
 * import, and rescoring. It previously existed as two near-identical copies in the
 * submission and batch-import routes, which is how they could drift apart.
 */

import type { CodeBlock, ParsedChat } from '../parser/chatgpt'
import type { ComputedMetrics, CodeSmellSignalResult, CurriculumScopeFlag, DimensionScores, RubricConfig, Submission } from '../db/schema'
import { computeAggregateMetrics } from '../analyzer/metrics'
import { getHighlightSummary, highlightChat } from '../analyzer/highlighter'
import { analyzeModifications, findStudentFirstShingles, getCodeSummary } from '../analyzer/code-extractor'
import { scoreAiLikelihood, CODE_SMELL_SCORER_VERSION } from '../analyzer/code-smell'
import { checkCurriculumScope, validateCurriculumScope } from '../analyzer/curriculum-scope'
import { calculateScores, parseRubricSnapshot, rubricsMatch } from './rubric'
import { buildAiUseFeedback, summarizeFindings, type AiUseFindings } from '../analyzer/feedback'
import { applyIntentOverrides, type IntentOverrides } from '../analyzer/intent-overrides'

/**
 * Bump whenever a change to the parser, analyzers or rubric logic can move a
 * transcript's suggested score. Stored with each suggestion so a stale one is
 * flagged for rescoring instead of silently disagreeing with live analysis (the
 * AI-use summary is computed fresh on every view).
 */
export const TRANSCRIPT_SCORER_VERSION = '2026-10-17.2'

export interface ScoredSubmission {
  metrics: ComputedMetrics
  dimensionScores: DimensionScores
  suggestedScore: number
  /** Assistant code blocks, stored so the diff view does not re-derive them. */
  aiCodeSnippets: CodeBlock[]
  /** What the AI-use summary found, for class-wide views. */
  aiUseFindings: AiUseFindings
}

/**
 * Score a submission from its transcripts and final code.
 *
 * Pure: it reads nothing and writes nothing, so callers decide what to persist.
 */
export function scoreSubmission(
  parsedChats: ParsedChat[],
  finalCode: string | null | undefined,
  rubricConfig: RubricConfig
): ScoredSubmission {
  const metrics = computeAggregateMetrics(parsedChats)

  const highlights = getHighlightSummary(parsedChats.flatMap(chat => highlightChat(chat)))

  const codeSummaries = parsedChats.map(chat => getCodeSummary(chat))
  const allAiCode = codeSummaries.map(summary => summary.allCode).join('\n\n')

  const codeModification =
    finalCode && allAiCode
      ? analyzeModifications(allAiCode, finalCode, findStudentFirstShingles(parsedChats))
      : undefined

  const { dimensionScores, totalScore } = calculateScores({
    metrics,
    highlights,
    codeModification,
    rubricConfig,
  })

  return {
    metrics,
    dimensionScores,
    suggestedScore: totalScore,
    aiCodeSnippets: codeSummaries.flatMap(summary => summary.codeBlocks),
    aiUseFindings: summarizeFindings(buildAiUseFeedback(parsedChats, finalCode ?? null)),
  }
}

/**
 * The fields a rescore is allowed to overwrite.
 *
 * Deliberately excludes finalScore, dimensionScores, teacherNotes and
 * selfReflection: those are the teacher's and the student's own work, not derived
 * data, and a rescore must never silently replace what someone entered by hand.
 */
export interface RescoreUpdate {
  computedMetrics: string
  suggestedDimensionScores: string
  suggestedScore: number
  aiCodeSnippets: string
  /** The rubric this score was computed with, so it stays explainable later. */
  rubricSnapshot: string
  transcriptScorerVersion: string
  aiUseFindings: string
}

/**
 * Recompute the derived fields for a submission already in the database.
 *
 * Reads the transcripts as they were stored at import. Note that those transcripts
 * were already flattened by the parser, so a rescore cannot undo import-time
 * parsing decisions — only re-upload can. See the note in the README.
 */
export function rescoreStoredSubmission(
  storedChatExports: string,
  finalCode: string | null,
  rubricConfig: RubricConfig,
  intentOverrides: IntentOverrides = {}
): RescoreUpdate {
  const parsedChats: ParsedChat[] = JSON.parse(storedChatExports)
  if (!Array.isArray(parsedChats)) {
    throw new Error('Stored transcripts are not an array')
  }

  // The teacher's rulings on flagged messages count as much as the detection does.
  const scored = scoreSubmission(applyIntentOverrides(parsedChats, intentOverrides), finalCode, rubricConfig)

  return {
    computedMetrics: JSON.stringify(scored.metrics),
    suggestedDimensionScores: JSON.stringify(scored.dimensionScores),
    suggestedScore: scored.suggestedScore,
    aiCodeSnippets: JSON.stringify(scored.aiCodeSnippets),
    rubricSnapshot: JSON.stringify(rubricConfig),
    transcriptScorerVersion: TRANSCRIPT_SCORER_VERSION,
    aiUseFindings: JSON.stringify(scored.aiUseFindings),
  }
}

/** Why a stored suggestion no longer matches what scoring it now would give. */
export type StaleReason = 'rubric' | 'rules'

export function suggestionStaleness(
  submission: Pick<Submission, 'submissionMode' | 'suggestedScore' | 'rubricSnapshot' | 'transcriptScorerVersion'>,
  rubricConfig: RubricConfig
): StaleReason[] {
  if (submission.submissionMode === 'code_only' || submission.suggestedScore === null) return []
  const reasons: StaleReason[] = []
  if (!rubricsMatch(parseRubricSnapshot(submission.rubricSnapshot), rubricConfig)) reasons.push('rubric')
  if (submission.transcriptScorerVersion !== TRANSCRIPT_SCORER_VERSION) reasons.push('rules')
  return reasons
}

/**
 * Check code against an assignment's curriculumScope (JSON string, as stored on
 * assignments.curriculumScope). Returns null — "not computed" — if the assignment
 * has no scope configured or it fails to parse, rather than flagging everything
 * against an empty taught-set.
 */
export function checkSubmissionCurriculumScope(
  code: string,
  storedCurriculumScope: string | null | undefined
): CurriculumScopeFlag[] | null {
  if (!storedCurriculumScope) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(storedCurriculumScope)
  } catch {
    return null
  }
  const validated = validateCurriculumScope(parsed)
  if (!validated.ok) return null
  return checkCurriculumScope(code, validated.value.taughtTechniqueIds, validated.value.weekByTechnique)
}

// Score a 'code_only' submission — no transcript, so a separate heuristic over the code alone (see analyzer/code-smell.ts).
export interface CodeOnlyScored {
  aiLikelihoodScore: number
  aiLikelihoodSignals: CodeSmellSignalResult[]
  aiLikelihoodScorerVersion: string
  curriculumScopeFlags: CurriculumScopeFlag[] | null
}

export function scoreCodeOnlySubmission(finalCode: string, assignmentCurriculumScope?: string | null): CodeOnlyScored {
  const { score, signals } = scoreAiLikelihood(finalCode)
  return {
    aiLikelihoodScore: score,
    aiLikelihoodSignals: signals,
    aiLikelihoodScorerVersion: CODE_SMELL_SCORER_VERSION,
    curriculumScopeFlags: checkSubmissionCurriculumScope(finalCode, assignmentCurriculumScope),
  }
}

/** The fields a code_only rescore is allowed to overwrite. */
export interface CodeOnlyRescoreUpdate {
  aiLikelihoodScore: number
  aiLikelihoodSignals: string
  aiLikelihoodScorerVersion: string
  curriculumScopeFlags: string | null
}

export function rescoreCodeOnlySubmission(
  finalCode: string | null,
  assignmentCurriculumScope?: string | null
): CodeOnlyRescoreUpdate {
  const scored = scoreCodeOnlySubmission(finalCode ?? '', assignmentCurriculumScope)
  return {
    aiLikelihoodScore: scored.aiLikelihoodScore,
    aiLikelihoodSignals: JSON.stringify(scored.aiLikelihoodSignals),
    aiLikelihoodScorerVersion: scored.aiLikelihoodScorerVersion,
    curriculumScopeFlags: scored.curriculumScopeFlags ? JSON.stringify(scored.curriculumScopeFlags) : null,
  }
}
