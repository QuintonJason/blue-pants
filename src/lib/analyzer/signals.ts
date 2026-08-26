/**
 * Message Signals
 *
 * One definition of each collaboration signal, shared by the metrics analyzer and
 * the chat highlighter. These were previously implemented twice — with substring
 * matching in metrics.ts and anchored regexes in highlighter.ts — so the two
 * disagreed about what counted as a question. Substring matching also meant
 * "shower" contained "how" and "somewhere" contained "where".
 *
 * Signals are deliberately independent: one message can be a question AND a
 * debugging report AND detailed context. Callers that need a single label for
 * display pick a primary type; callers that count evidence count each separately.
 */

export const SHORT_PROMPT_THRESHOLD = 50 // characters
export const LONG_CONTEXT_THRESHOLD = 500 // characters

/**
 * A question mark, or an opening interrogative. Anchored at the start rather than
 * matched anywhere, so "I know what I want" is not treated as a question.
 */
const QUESTION_PATTERNS = [
  /\?/,
  /^\s*(how|why|what|when|where|which|who|can|could|would|should|is|are|do|does|did|will|any)\b/i,
  /\b(explain|clarify)\b/i,
  /\bhelp me understand\b/i,
  /\bi (don't|do not) understand\b/i,
]

/**
 * Explicit failure vocabulary only. The previous list included `null`, `undefined`,
 * `fix`, `wrong` and `mistake`, which occur constantly in ordinary programming talk
 * and inflated the debugging signal for students who never debugged anything.
 */
const ERROR_PATTERNS = [
  /\berrors?\b/i,
  /\bexceptions?\b/i,
  /\btracebacks?\b/i,
  /\bstack trace\b/i,
  /\bcrash(es|ed|ing)?\b/i,
  /\bfail(s|ed|ing|ure)?\b/i,
  /\bbugs?\b/i,
  /\bbroken\b/i,
  /\bdebug(ging)?\b/i,
  /\bproblems?\b/i,
  /\bissues?\b/i,
  /\b(doesn't|does not|isn't|is not|won't|will not|not) work(ing)?\b/i,
]

const CODE_REVIEW_PATTERNS = [
  /\breview\b/i,
  /\bfeedback\b/i,
  /\bimprove(ment|ments)?\b/i,
  /\boptimi[sz]e\b/i,
  /\bsuggestions?\b/i,
  /\bbest practices?\b/i,
  /\bthoughts on\b/i,
  /\bany (issues|problems|bugs)\b/i,
  /\b(check|look at|critique)\b[^.?!]*\bcode\b/i,
]

/** Openers that carry no content of their own, e.g. "thanks", "ok, got it". */
const ACKNOWLEDGMENT_PREFIXES = [
  'thanks',
  'thank you',
  'ok',
  'okay',
  'got it',
  'perfect',
  'great',
  'nice',
  'cool',
  'yes',
  'yep',
  'no',
  'nope',
]

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(content))
}

export function isQuestion(content: string | undefined | null): boolean {
  return !!content && matchesAny(content, QUESTION_PATTERNS)
}

export function isErrorDiscussion(content: string | undefined | null): boolean {
  return !!content && matchesAny(content, ERROR_PATTERNS)
}

export function isCodeReviewRequest(content: string | undefined | null): boolean {
  return !!content && matchesAny(content, CODE_REVIEW_PATTERNS)
}

export function isLongContext(content: string | undefined | null): boolean {
  return !!content && content.length > LONG_CONTEXT_THRESHOLD
}

/** How much substance may follow an acknowledgment before it counts as content. */
const ACKNOWLEDGMENT_REMAINDER_MAX = 12

/**
 * A bare acknowledgment, which should not count as a prompt or a refinement.
 *
 * Matching the opening word alone is not enough: "Nope is not a valid CSS value,
 * so why does it parse?" opens with an acknowledgment and then says something. So
 * the opener must be followed by little or nothing.
 */
export function isAcknowledgment(content: string | undefined | null): boolean {
  if (!content) return false

  const trimmed = content.toLowerCase().trim()
  if (!trimmed) return false

  const opener = ACKNOWLEDGMENT_PREFIXES.find(prefix => {
    if (trimmed === prefix) return true
    if (!trimmed.startsWith(prefix)) return false
    return /^[\s,.!?]/.test(trimmed.slice(prefix.length))
  })
  if (!opener) return false

  const remainder = trimmed
    .slice(opener.length)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return remainder.length <= ACKNOWLEDGMENT_REMAINDER_MAX
}

export function isShortPrompt(content: string | undefined | null): boolean {
  if (!content) return false
  const length = content.length
  return length > 0 && length < SHORT_PROMPT_THRESHOLD && !isAcknowledgment(content)
}

export interface MessageSignals {
  isQuestion: boolean
  isErrorDiscussion: boolean
  isCodeReview: boolean
  isLongContext: boolean
  isShortPrompt: boolean
}

const NO_SIGNALS: MessageSignals = {
  isQuestion: false,
  isErrorDiscussion: false,
  isCodeReview: false,
  isLongContext: false,
  isShortPrompt: false,
}

/**
 * All signals for one message. Only student messages carry signals — the point is
 * to assess what the student did, so an assistant message that says "that error
 * means..." must not be counted as the student debugging.
 */
export function getMessageSignals(
  role: string,
  content: string | undefined | null
): MessageSignals {
  if (role !== 'user') return { ...NO_SIGNALS }
  return {
    isQuestion: isQuestion(content),
    isErrorDiscussion: isErrorDiscussion(content),
    isCodeReview: isCodeReviewRequest(content),
    isLongContext: isLongContext(content),
    isShortPrompt: isShortPrompt(content),
  }
}
