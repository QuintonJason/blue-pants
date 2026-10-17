/**
 * Metrics Analyzer
 *
 * Extracts quantitative metrics from chat conversations
 * to assess AI collaboration quality.
 */

import { ParsedChat, assistantCodeBlocks, extractCodeDownloads } from '../parser/chatgpt'
import { ComputedMetrics } from '../db/schema'
import { extractUserCode } from './code-extractor'
import { classifyPrompts } from './intent'
import {
  LONG_CONTEXT_THRESHOLD,
  isAcknowledgment,
  isCodeReviewRequest,
  isErrorDiscussion,
  isQuestion,
  isShortPrompt,
} from './signals'

/**
 * Count follow-up turns where the student came back to refine.
 *
 * A refinement is a student message that answers an assistant message and says
 * something of its own. Bare acknowledgments ("thanks", "ok") do not count.
 *
 * The previous implementation treated any message under 200 characters as a
 * follow-up and then latched, so an entire multi-turn refinement collapsed to a
 * count of 1 while a single terse reply also scored 1.
 */
function countIterations(messages: ParsedChat['messages'], offTopic: boolean[]): number {
  let iterations = 0

  for (let i = 1; i < messages.length; i++) {
    const current = messages[i]
    const previous = messages[i - 1]

    if (current.role !== 'user' || previous.role !== 'assistant') continue
    if (offTopic[i]) continue

    const content = (current.content || '').trim()
    if (!content) continue
    if (isAcknowledgment(content)) continue

    iterations++
  }

  return iterations
}

/**
 * Unrounded per-chat tallies.
 *
 * Averages are derived from these totals at the end rather than averaged together,
 * so a submission with several chats is not skewed by mean-of-means.
 */
interface RawCounts {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  userPromptChars: number
  questionCount: number
  codeBlockCount: number
  userCodeBlocks: number
  errorMentions: number
  iterationCount: number
  shortPromptCount: number
  longPromptCount: number
  offTopicCount: number
  delegationCount: number
  aiCodeDownloads: number
}

function rawCounts(chat: ParsedChat): RawCounts {
  const intents = classifyPrompts(chat)
  const offTopic = intents.map(intent => intent.offTopic)
  // Off-topic requests (editing an image, rewriting a story) say nothing about how
  // the student worked on the code, so every collaboration count leaves them out.
  const userMessages = chat.messages.filter((m, i) => m.role === 'user' && !offTopic[i])
  const assistantMessages = chat.messages.filter(m => m.role === 'assistant')

  return {
    totalMessages: chat.messages.length,
    userMessages: userMessages.length,
    assistantMessages: assistantMessages.length,
    userPromptChars: userMessages.reduce((sum, m) => sum + (m.content || '').length, 0),
    questionCount: userMessages.filter(m => isQuestion(m.content)).length,
    codeBlockCount: assistantMessages.reduce((sum, m) => sum + assistantCodeBlocks(m).length, 0),
    userCodeBlocks: extractUserCode({ ...chat, messages: userMessages }).length,
    // Student messages only: the assistant explaining an error is not the student
    // debugging, and counting both double-counted every debugging exchange.
    errorMentions: userMessages.filter(m => isErrorDiscussion(m.content)).length,
    iterationCount: countIterations(chat.messages, offTopic),
    // The same definition the highlighter uses; this counted every message under
    // the threshold, acknowledgments and questions included.
    shortPromptCount: userMessages.filter(m => isShortPrompt(m.content)).length,
    longPromptCount: userMessages.filter(
      m => (m.content || '').length > LONG_CONTEXT_THRESHOLD
    ).length,
    offTopicCount: offTopic.filter(Boolean).length,
    delegationCount: intents.filter(intent => intent.delegation).length,
    aiCodeDownloads: new Set(assistantMessages.flatMap(m => extractCodeDownloads(m.content))).size,
  }
}

function finalize(parts: RawCounts[]): ComputedMetrics {
  const sum = (pick: (counts: RawCounts) => number) =>
    parts.reduce((total, part) => total + pick(part), 0)

  const userMessages = sum(c => c.userMessages)
  const userPromptChars = sum(c => c.userPromptChars)

  return {
    totalMessages: sum(c => c.totalMessages),
    userMessages,
    assistantMessages: sum(c => c.assistantMessages),
    // Derived from totals, so this stays correct across any number of chats
    // (including none, which previously produced NaN).
    averagePromptLength: userMessages > 0 ? Math.round(userPromptChars / userMessages) : 0,
    questionCount: sum(c => c.questionCount),
    codeBlockCount: sum(c => c.codeBlockCount),
    userCodeBlocks: sum(c => c.userCodeBlocks),
    errorMentions: sum(c => c.errorMentions),
    iterationCount: sum(c => c.iterationCount),
    shortPromptCount: sum(c => c.shortPromptCount),
    longPromptCount: sum(c => c.longPromptCount),
    offTopicCount: sum(c => c.offTopicCount),
    delegationCount: sum(c => c.delegationCount),
    aiCodeDownloads: sum(c => c.aiCodeDownloads),
  }
}

/**
 * Compute all metrics for a parsed chat
 */
export function computeMetrics(chat: ParsedChat): ComputedMetrics {
  return finalize([rawCounts(chat)])
}

/**
 * Compute metrics across multiple chats (for multi-chat submissions)
 */
export function computeAggregateMetrics(chats: ParsedChat[]): ComputedMetrics {
  return finalize(chats.map(rawCounts))
}

/**
 * Additional analysis functions
 */
export function getCodeReviewRequestCount(chat: ParsedChat): number {
  return chat.messages
    .filter(m => m.role === 'user')
    .filter(m => isCodeReviewRequest(m.content))
    .length
}

export function getSpecificFeedbackRequestCount(chat: ParsedChat): number {
  // Look for specific feedback requests (performance, edge cases, etc.)
  const specificKeywords = [
    'performance', 'edge case', 'edge-case', 'security', 'efficiency',
    'readability', 'maintainability', 'scalability', 'test', 'testing',
    'error handling', 'validation', 'memory', 'time complexity', 'space complexity'
  ]

  return chat.messages
    .filter(m => m.role === 'user')
    .filter(m => {
      const content = (m.content || '').toLowerCase()
      return specificKeywords.some(keyword => content.includes(keyword))
    })
    .length
}
