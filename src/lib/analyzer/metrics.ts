/**
 * Metrics Analyzer
 *
 * Extracts quantitative metrics from chat conversations
 * to assess AI collaboration quality.
 */

import { ParsedChat, extractCodeBlocks } from '../parser/chatgpt'
import { ComputedMetrics } from '../db/schema'
import { extractUserCode } from './code-extractor'

// Keywords that indicate debugging/error discussion
const ERROR_KEYWORDS = [
  'error', 'bug', 'issue', 'problem', 'fix', 'broken', 'doesn\'t work',
  'not working', 'failed', 'exception', 'crash', 'undefined', 'null',
  'traceback', 'stack trace', 'debug', 'wrong', 'incorrect', 'mistake'
]

// Keywords that indicate questions
const QUESTION_INDICATORS = [
  '?', 'how', 'why', 'what', 'when', 'where', 'which', 'could you',
  'can you', 'would you', 'explain', 'help me understand', 'I don\'t understand'
]

// Keywords for code review requests
const CODE_REVIEW_KEYWORDS = [
  'review', 'check', 'look at', 'feedback', 'improve', 'optimize',
  'better', 'best practice', 'any issues', 'suggestions', 'thoughts on'
]

/**
 * Count occurrences of keywords in text (case-insensitive)
 */
function countKeywords(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase()
  return keywords.reduce((count, keyword) => {
    const regex = new RegExp(keyword.toLowerCase(), 'gi')
    const matches = lowerText.match(regex)
    return count + (matches ? matches.length : 0)
  }, 0)
}

/**
 * Check if a message contains a question
 */
function isQuestion(text: string | undefined | null): boolean {
  if (!text) return false
  const lowerText = text.toLowerCase()
  return QUESTION_INDICATORS.some(indicator => lowerText.includes(indicator.toLowerCase()))
}

/**
 * Check if a message mentions errors/debugging
 */
function mentionsErrors(text: string | undefined | null): boolean {
  if (!text) return false
  const lowerText = text.toLowerCase()
  return ERROR_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()))
}

/**
 * Check if a message is a code review request
 */
function isCodeReviewRequest(text: string | undefined | null): boolean {
  if (!text) return false
  const lowerText = text.toLowerCase()
  return CODE_REVIEW_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()))
}

/**
 * Calculate average length of an array of strings
 */
function averageLength(texts: (string | undefined | null)[]): number {
  const validTexts = texts.filter((t): t is string => typeof t === 'string')
  if (validTexts.length === 0) return 0
  const totalLength = validTexts.reduce((sum, text) => sum + text.length, 0)
  return Math.round(totalLength / validTexts.length)
}

/**
 * Count iteration sequences (user follow-ups on same topic)
 */
function countIterations(messages: ParsedChat['messages']): number {
  let iterations = 0
  let inSequence = false

  for (let i = 1; i < messages.length; i++) {
    const current = messages[i]
    const prev = messages[i - 1]

    // An iteration is when user responds to assistant with a follow-up
    if (current.role === 'user' && prev.role === 'assistant') {
      const content = current.content || ''
      // Check if it's a follow-up (mentions similar terms or asks for changes)
      const followUpIndicators = ['but', 'however', 'instead', 'also', 'actually', 'change', 'modify', 'update']
      const isFollowUp = followUpIndicators.some(ind =>
        content.toLowerCase().includes(ind)
      ) || content.length < 200 // Short follow-ups are usually iterations

      if (isFollowUp) {
        if (!inSequence) {
          iterations++
          inSequence = true
        }
      } else {
        inSequence = false
      }
    }
  }

  return iterations
}

/**
 * Compute all metrics for a parsed chat
 */
export function computeMetrics(chat: ParsedChat): ComputedMetrics {
  const userMessages = chat.messages.filter(m => m.role === 'user')
  const assistantMessages = chat.messages.filter(m => m.role === 'assistant')

  const userContents = userMessages.map(m => m.content)
  const avgPromptLength = averageLength(userContents)

  // Count questions in user messages
  const questionCount = userMessages.filter(m => isQuestion(m.content)).length

  // Count code blocks in assistant messages
  const codeBlockCount = assistantMessages.reduce((sum, m) => sum + m.codeBlocks.length, 0)

  // Count user code blocks (user sharing code)
  const userCodeBlocks = extractUserCode(chat).length

  // Count error mentions
  const errorMentions = chat.messages.filter(m => mentionsErrors(m.content)).length

  // Count iterations
  const iterationCount = countIterations(chat.messages)

  // Short prompts (less than 50 chars) - potential red flag
  const shortPromptCount = userMessages.filter(m => (m.content || '').length < 50).length

  // Long prompts (more than 500 chars) - usually good context
  const longPromptCount = userMessages.filter(m => (m.content || '').length > 500).length

  return {
    totalMessages: chat.messages.length,
    userMessages: userMessages.length,
    assistantMessages: assistantMessages.length,
    averagePromptLength: avgPromptLength,
    questionCount,
    codeBlockCount,
    userCodeBlocks,
    errorMentions,
    iterationCount,
    shortPromptCount,
    longPromptCount,
  }
}

/**
 * Compute metrics across multiple chats (for multi-chat submissions)
 */
export function computeAggregateMetrics(chats: ParsedChat[]): ComputedMetrics {
  const allMetrics = chats.map(chat => computeMetrics(chat))

  return {
    totalMessages: allMetrics.reduce((sum, m) => sum + m.totalMessages, 0),
    userMessages: allMetrics.reduce((sum, m) => sum + m.userMessages, 0),
    assistantMessages: allMetrics.reduce((sum, m) => sum + m.assistantMessages, 0),
    averagePromptLength: Math.round(
      allMetrics.reduce((sum, m) => sum + m.averagePromptLength, 0) / allMetrics.length
    ),
    questionCount: allMetrics.reduce((sum, m) => sum + m.questionCount, 0),
    codeBlockCount: allMetrics.reduce((sum, m) => sum + m.codeBlockCount, 0),
    userCodeBlocks: allMetrics.reduce((sum, m) => sum + m.userCodeBlocks, 0),
    errorMentions: allMetrics.reduce((sum, m) => sum + m.errorMentions, 0),
    iterationCount: allMetrics.reduce((sum, m) => sum + m.iterationCount, 0),
    shortPromptCount: allMetrics.reduce((sum, m) => sum + m.shortPromptCount, 0),
    longPromptCount: allMetrics.reduce((sum, m) => sum + m.longPromptCount, 0),
  }
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
    .filter(m => specificKeywords.some(kw => m.content.toLowerCase().includes(kw)))
    .length
}
