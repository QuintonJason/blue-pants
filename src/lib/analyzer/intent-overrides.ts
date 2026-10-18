/**
 * Intent Overrides
 *
 * Off-topic and hand-off flags are detected by wording, and a hand-off costs
 * points. The teacher can overrule any flag: the ruling is stored beside the
 * transcript (never in it, so the evidence fingerprint is unchanged) and applied
 * over the detected intent wherever the transcript is analyzed, so the
 * suggestion, the AI-use summary and the chat highlights all agree with it.
 */

import type { ParsedChat } from '../parser/chatgpt'
import { classifyPrompts, type PromptIntent } from './intent'
import { messageAnchor } from './highlighter'

export type IntentKind = keyof PromptIntent

/** Only the kinds the teacher ruled on; the rest stay as detected. */
export type IntentRuling = Partial<PromptIntent>

/** Keyed by messageAnchor(chatIndex, messageIndex). */
export type IntentOverrides = Record<string, IntentRuling>

export function parseIntentOverrides(stored: string | null | undefined): IntentOverrides {
  if (!stored) return {}
  try {
    const parsed = JSON.parse(stored)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Copies of the chats with each ruling on its message; the chats themselves are untouched. */
export function applyIntentOverrides(chats: ParsedChat[], overrides: IntentOverrides): ParsedChat[] {
  if (Object.keys(overrides).length === 0) return chats
  return chats.map((chat, c) => ({
    ...chat,
    messages: chat.messages.map((message, i) => {
      const ruling = overrides[messageAnchor(c, i)]
      return ruling ? { ...message, teacherIntent: ruling } : message
    }),
  }))
}

export interface FlaggedMessage {
  anchor: string
  text: string
  /** What the wording rules found. */
  detected: PromptIntent
  /** What counts for scoring, after the teacher's ruling. */
  counted: PromptIntent
  ruling: IntentRuling | null
}

/** Every student message detected as off-topic or a hand-off, or ruled on by the teacher. */
export function flaggedMessages(chats: ParsedChat[], overrides: IntentOverrides): FlaggedMessage[] {
  const ruled = applyIntentOverrides(chats, overrides)
  return chats.flatMap((chat, c) => {
    const detected = classifyPrompts(chat)
    const counted = classifyPrompts(ruled[c])
    return chat.messages.flatMap((message, i) => {
      const anchor = messageAnchor(c, i)
      const ruling = overrides[anchor] ?? null
      if (message.role !== 'user' || !(detected[i].offTopic || detected[i].delegation || ruling)) return []
      return [{ anchor, text: message.content, detected: detected[i], counted: counted[i], ruling }]
    })
  })
}

/** The chat and message indexes in an anchor, or null if it isn't one. */
export function parseAnchor(anchor: string): { chatIndex: number; messageIndex: number } | null {
  const match = /^chat-(\d+)-message-(\d+)$/.exec(anchor)
  return match ? { chatIndex: Number(match[1]), messageIndex: Number(match[2]) } : null
}

/**
 * The overrides with one ruling changed. A ruling that agrees with what would
 * count without it is removed rather than stored, so "overruled" always means the
 * teacher disagreed. "Without it" keeps the message's other ruling: bringing a
 * message back from off-topic can reveal a hand-off that wasn't detectable before.
 */
export function setRuling(
  chats: ParsedChat[],
  overrides: IntentOverrides,
  anchor: string,
  kind: IntentKind,
  value: boolean
): IntentOverrides {
  const { [kind]: _previous, ...rest } = overrides[anchor] ?? {}
  const { [anchor]: _old, ...others } = overrides
  const without: IntentOverrides = Object.keys(rest).length > 0 ? { ...others, [anchor]: rest } : others
  return value === intentAt(chats, without, anchor)[kind] ? without : { ...others, [anchor]: { ...rest, [kind]: value } }
}

function intentAt(chats: ParsedChat[], overrides: IntentOverrides, anchor: string): PromptIntent {
  const at = parseAnchor(anchor)
  const chat = at && applyIntentOverrides(chats, overrides)[at.chatIndex]
  if (!at || !chat?.messages[at.messageIndex]) throw new Error(`No message at ${anchor}`)
  return classifyPrompts(chat)[at.messageIndex]
}

/** How often the teacher disagreed with each kind of flag, across submissions. */
export function rulingAgreement(flagged: FlaggedMessage[]): Record<IntentKind, { flagged: number; overruled: number }> {
  const tally = (kind: IntentKind) => ({
    flagged: flagged.filter(f => f.detected[kind]).length,
    overruled: flagged.filter(f => f.detected[kind] && f.ruling?.[kind] === false).length,
  })
  return { delegation: tally('delegation'), offTopic: tally('offTopic') }
}
