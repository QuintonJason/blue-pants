/**
 * Chat Highlighter
 *
 * Identifies messages that should be highlighted in the chat viewer:
 * - Questions (blue) - shows engagement
 * - Error discussions (orange) - shows debugging process
 * - Short prompts (red) - potential red flag
 */

import { ParsedChat, ChatMessage } from '../parser/chatgpt'

export type HighlightType = 'question' | 'error' | 'short-prompt' | 'code-review' | 'long-context' | null

export interface HighlightedMessage extends ChatMessage {
  highlightType: HighlightType
  highlightReason?: string
}

// Question indicators
const QUESTION_PATTERNS = [
  /\?/,
  /^(how|why|what|when|where|which|can|could|would|should|is|are|do|does)\b/i,
  /explain/i,
  /help me understand/i,
  /i don't understand/i,
  /what does.*mean/i,
  /how does.*work/i,
]

// Error/debugging indicators
const ERROR_PATTERNS = [
  /error/i,
  /bug/i,
  /issue/i,
  /problem/i,
  /doesn't work/i,
  /not working/i,
  /failed/i,
  /exception/i,
  /traceback/i,
  /undefined/i,
  /null/i,
  /crash/i,
  /broken/i,
  /fix/i,
  /debug/i,
]

// Code review indicators
const CODE_REVIEW_PATTERNS = [
  /review/i,
  /check.*code/i,
  /look at.*code/i,
  /feedback/i,
  /improve/i,
  /optimize/i,
  /any (issues|problems|bugs)/i,
  /suggestions/i,
  /best practice/i,
]

// Thresholds
const SHORT_PROMPT_THRESHOLD = 50 // characters
const LONG_CONTEXT_THRESHOLD = 500 // characters

/**
 * Determine the highlight type for a message
 */
export function getHighlightType(message: ChatMessage): { type: HighlightType; reason?: string } {
  // Only highlight user messages
  if (message.role !== 'user') {
    return { type: null }
  }

  const content = message.content || ''

  // Check for code review requests (positive signal)
  for (const pattern of CODE_REVIEW_PATTERNS) {
    if (pattern.test(content)) {
      return { type: 'code-review', reason: 'Code review request' }
    }
  }

  // Check for error/debugging discussions (shows process)
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(content)) {
      return { type: 'error', reason: 'Debugging/error discussion' }
    }
  }

  // Check for questions (shows engagement)
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(content)) {
      return { type: 'question', reason: 'Question asked' }
    }
  }

  // Check for long context (positive signal)
  if (content.length > LONG_CONTEXT_THRESHOLD) {
    return { type: 'long-context', reason: 'Detailed context provided' }
  }

  // Check for short prompts (potential red flag)
  if (content.length < SHORT_PROMPT_THRESHOLD && content.length > 0) {
    // Don't flag if it's clearly a follow-up acknowledgment
    const acknowledgments = ['thanks', 'ok', 'got it', 'perfect', 'great', 'yes', 'no']
    const isAcknowledgment = acknowledgments.some(ack =>
      content.toLowerCase().trim().startsWith(ack)
    )

    if (!isAcknowledgment) {
      return { type: 'short-prompt', reason: 'Very short prompt' }
    }
  }

  return { type: null }
}

/**
 * Add highlight information to all messages in a chat
 */
export function highlightChat(chat: ParsedChat): HighlightedMessage[] {
  return chat.messages.map(message => {
    const { type, reason } = getHighlightType(message)
    return {
      ...message,
      highlightType: type,
      highlightReason: reason,
    }
  })
}

/**
 * Get summary of highlights for quick overview
 */
export interface HighlightSummary {
  questions: number
  errors: number
  shortPrompts: number
  codeReviews: number
  longContexts: number
}

export function getHighlightSummary(highlightedMessages: HighlightedMessage[]): HighlightSummary {
  return {
    questions: highlightedMessages.filter(m => m.highlightType === 'question').length,
    errors: highlightedMessages.filter(m => m.highlightType === 'error').length,
    shortPrompts: highlightedMessages.filter(m => m.highlightType === 'short-prompt').length,
    codeReviews: highlightedMessages.filter(m => m.highlightType === 'code-review').length,
    longContexts: highlightedMessages.filter(m => m.highlightType === 'long-context').length,
  }
}

/**
 * Get CSS class for highlight type
 */
export function getHighlightClass(type: HighlightType): string {
  switch (type) {
    case 'question':
      return 'highlight-question'
    case 'error':
      return 'highlight-error'
    case 'short-prompt':
      return 'highlight-warning'
    case 'code-review':
      return 'highlight-question' // Same as questions (positive)
    case 'long-context':
      return '' // No special styling, just a note
    default:
      return ''
  }
}

/**
 * Get icon/badge for highlight type
 */
export function getHighlightBadge(type: HighlightType): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } | null {
  switch (type) {
    case 'question':
      return { label: 'Question', variant: 'default' }
    case 'error':
      return { label: 'Debug', variant: 'secondary' }
    case 'short-prompt':
      return { label: 'Short', variant: 'destructive' }
    case 'code-review':
      return { label: 'Review', variant: 'default' }
    case 'long-context':
      return { label: 'Detailed', variant: 'outline' }
    default:
      return null
  }
}
