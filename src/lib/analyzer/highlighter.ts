import { ParsedChat, ChatMessage } from '../parser/chatgpt'
import {
  getMessageSignals,
  isCodeReviewRequest,
  isErrorDiscussion,
  isLongContext,
  isQuestion,
  isShortPrompt,
  type MessageSignals,
} from './signals'
import { classifyPrompts, type PromptIntent } from './intent'

export type HighlightType =
  | 'off-topic'
  | 'delegation'
  | 'question'
  | 'error'
  | 'short-prompt'
  | 'code-review'
  | 'long-context'
  | null

export interface HighlightedMessage extends ChatMessage {
  highlightType: HighlightType
  highlightReason?: string
  /** Every signal this message carries, not just the primary one shown as a badge. */
  signals: MessageSignals
  /** What the request was for, judged with the assistant's reply in view. */
  intent?: PromptIntent
}

/**
 * The single most notable thing about a message, for the badge in the chat viewer.
 *
 * This is a display concern and is intentionally lossy: a message that both asks a
 * question and reports an error gets one badge. Counting for scoring must not use
 * this — see getHighlightSummary, which counts every signal independently.
 */
export function getHighlightType(message: ChatMessage): { type: HighlightType; reason?: string } {
  // Only highlight user messages
  if (message.role !== 'user') {
    return { type: null }
  }

  const content = message.content || ''

  if (isCodeReviewRequest(content)) {
    return { type: 'code-review', reason: 'Code review request' }
  }
  if (isErrorDiscussion(content)) {
    return { type: 'error', reason: 'Debugging/error discussion' }
  }
  if (isQuestion(content)) {
    return { type: 'question', reason: 'Question asked' }
  }
  if (isLongContext(content)) {
    return { type: 'long-context', reason: 'Detailed context provided' }
  }
  if (isShortPrompt(content)) {
    return { type: 'short-prompt', reason: 'Very short prompt' }
  }

  return { type: null }
}

/** DOM id for a message in the chat viewer, so other panels can link to it. */
export function messageAnchor(chatIndex: number, messageIndex: number): string {
  return `chat-${chatIndex}-message-${messageIndex}`
}

/**
 * Add highlight information to all messages in a chat
 */
export function highlightChat(chat: ParsedChat): HighlightedMessage[] {
  const intents = classifyPrompts(chat)
  return chat.messages.map((message, i) => {
    const { type, reason } = intentHighlight(intents[i]) ?? getHighlightType(message)
    return {
      ...message,
      highlightType: type,
      highlightReason: reason,
      signals: getMessageSignals(message.role, message.content),
      intent: intents[i],
    }
  })
}

/** Intent outranks the per-message badges: it's what a grader most needs to see. */
function intentHighlight(intent: PromptIntent): { type: HighlightType; reason: string } | null {
  if (intent.offTopic) return { type: 'off-topic', reason: 'Not about the code; left out of scoring' }
  if (intent.delegation) return { type: 'delegation', reason: 'Handed a whole feature, page or file to the AI' }
  return null
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

/**
 * Counts each signal independently.
 *
 * Previously this counted the primary badge, so signals masked each other: a long,
 * detailed message that mentioned an error was labelled "error" and therefore
 * contributed nothing to longContexts, silently costing the student their Problem
 * Articulation bonus. A question that mentioned a bug never counted as a question.
 */
export function getHighlightSummary(highlightedMessages: HighlightedMessage[]): HighlightSummary {
  const summary: HighlightSummary = {
    questions: 0,
    errors: 0,
    shortPrompts: 0,
    codeReviews: 0,
    longContexts: 0,
  }

  for (const message of highlightedMessages) {
    if (message.intent?.offTopic) continue
    // Fall back for messages built before signals were attached.
    const signals = message.signals ?? getMessageSignals(message.role, message.content)
    if (signals.isQuestion) summary.questions++
    if (signals.isErrorDiscussion) summary.errors++
    if (signals.isShortPrompt) summary.shortPrompts++
    if (signals.isCodeReview) summary.codeReviews++
    if (signals.isLongContext) summary.longContexts++
  }

  return summary
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
    case 'delegation':
      return 'highlight-warning'
    case 'off-topic':
      return 'highlight-muted'
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
    case 'delegation':
      return { label: 'Hand-off', variant: 'destructive' }
    case 'off-topic':
      return { label: 'Off-topic', variant: 'outline' }
    default:
      return null
  }
}
