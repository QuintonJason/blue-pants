/**
 * Scoring Pipeline
 *
 * One path from parsed transcripts to a suggested score, shared by import, batch
 * import, and rescoring. It previously existed as two near-identical copies in the
 * submission and batch-import routes, which is how they could drift apart.
 */

import type { CodeBlock, ParsedChat } from '../parser/chatgpt'
import type { ComputedMetrics, DimensionScores, RubricConfig } from '../db/schema'
import { computeAggregateMetrics } from '../analyzer/metrics'
import { getHighlightSummary, highlightChat } from '../analyzer/highlighter'
import { analyzeModifications, getCodeSummary } from '../analyzer/code-extractor'
import { calculateScores } from './rubric'

export interface ScoredSubmission {
  metrics: ComputedMetrics
  dimensionScores: DimensionScores
  suggestedScore: number
  /** Assistant code blocks, stored so the diff view does not re-derive them. */
  aiCodeSnippets: CodeBlock[]
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
    finalCode && allAiCode ? analyzeModifications(allAiCode, finalCode) : undefined

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
  rubricConfig: RubricConfig
): RescoreUpdate {
  const parsedChats: ParsedChat[] = JSON.parse(storedChatExports)
  if (!Array.isArray(parsedChats)) {
    throw new Error('Stored transcripts are not an array')
  }

  const scored = scoreSubmission(parsedChats, finalCode, rubricConfig)

  return {
    computedMetrics: JSON.stringify(scored.metrics),
    suggestedDimensionScores: JSON.stringify(scored.dimensionScores),
    suggestedScore: scored.suggestedScore,
    aiCodeSnippets: JSON.stringify(scored.aiCodeSnippets),
    rubricSnapshot: JSON.stringify(rubricConfig),
  }
}
