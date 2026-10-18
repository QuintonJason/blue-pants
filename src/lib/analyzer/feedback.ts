/**
 * AI-use feedback
 *
 * A plain-language summary of how a student used the AI: what they're doing well
 * and what to work on, each point backed by quotes from their own messages so a
 * teacher can check it and pass it on. Built from the same signals the score uses,
 * by rule rather than by a model, so the same submission always reads the same.
 */

import { extractCodeBlocks, extractCodeDownloads, type ParsedChat } from '../parser/chatgpt'
import {
  analyzeModifications,
  detectUnfencedCode,
  findStudentFirstShingles,
  getCodeSummary,
  ownWords,
} from './code-extractor'
import { highlightChat, messageAnchor, type HighlightedMessage } from './highlighter'

export interface FeedbackQuote {
  /** The student's own words. */
  text: string
  /** Where the message is in the chat viewer (see messageAnchor). */
  anchor: string
}

export interface FeedbackPoint {
  title: string
  detail: string
  /** Quotes from the messages that earned this point. */
  examples: FeedbackQuote[]
}

type LocatedMessage = HighlightedMessage & { anchor: string }

export interface AiUseFeedback {
  strengths: FeedbackPoint[]
  improvements: FeedbackPoint[]
  /** Context for the reader that is neither praise nor criticism. */
  notes: string[]
}

const MAX_EXAMPLES = 3
const EXAMPLE_MAX_CHARS = 90

/** Own words this short on top of a paste say nothing about the problem. */
const BARE_PASTE_MAX_WORDS_CHARS = 30

export function buildAiUseFeedback(chats: ParsedChat[], finalCode: string | null): AiUseFeedback {
  const messages: LocatedMessage[] = chats
    .flatMap((chat, c) => highlightChat(chat).map((m, i) => ({ ...m, anchor: messageAnchor(c, i) })))
    .filter(m => m.role === 'user')
  const counted = messages.filter(m => !m.intent?.offTopic)
  const offTopic = messages.length - counted.length

  const hasPaste = (m: LocatedMessage) =>
    extractCodeBlocks(m.content).length > 0 || detectUnfencedCode(m.content) !== null

  const sharedCode = counted.filter(hasPaste)
  const barePastes = sharedCode.filter(m => ownWords(m.content).length < BARE_PASTE_MAX_WORDS_CHARS)
  const isBarePaste = (m: LocatedMessage) => barePastes.includes(m)

  const questions = counted.filter(m => m.signals.isQuestion && !m.intent?.delegation && !hasPaste(m))
  // "why isnt this working" over a pasted page reports a bug without describing
  // it, so it's coached under bare pastes rather than praised here.
  const debugging = counted.filter(m => m.signals.isErrorDiscussion && !isBarePaste(m))
  const reviews = counted.filter(m => m.signals.isCodeReview)
  const handOffs = counted.filter(m => m.intent?.delegation)
  const terse = counted.filter(m => m.signals.isShortPrompt && !m.intent?.delegation)

  const aiCode = chats.map(chat => getCodeSummary(chat).allCode).join('\n\n')
  const modification =
    finalCode && aiCode ? analyzeModifications(aiCode, finalCode, findStudentFirstShingles(chats)) : null
  const aiShare = modification ? Math.round(modification.verbatimPercentage) : null
  const studentFirst = modification ? Math.round(modification.studentFirstPercentage) : 0
  const downloads = new Set(
    chats.flatMap(chat => chat.messages.filter(m => m.role === 'assistant').flatMap(m => extractCodeDownloads(m.content)))
  ).size

  const strengths: FeedbackPoint[] = []
  const improvements: FeedbackPoint[] = []
  const quote = quoteFrom(new Set())

  if (questions.length >= 3) {
    strengths.push({
      title: 'You ask questions to understand, not just to get code',
      detail: `You asked ${questions.length} questions about how things work. That's using the AI as a tutor, which is how you learn the most from it.`,
      examples: quote(questions),
    })
  }
  if (debugging.length >= 2) {
    strengths.push({
      title: 'You work through bugs by describing what went wrong',
      detail: `${times(debugging.length, true)} you described a specific problem you'd run into instead of asking for the whole thing again.`,
      examples: quote(debugging),
    })
  }
  if (reviews.length >= 1) {
    strengths.push({
      title: 'You ask the AI to check code you already have',
      detail: `You asked for a review or a second opinion ${times(reviews.length)}. Questions like "do I keep this?" are exactly the right use.`,
      examples: quote(reviews),
    })
  }
  if (sharedCode.length >= 2 && barePastes.length < sharedCode.length / 2) {
    strengths.push({
      title: 'You share your own code for context',
      detail: `You pasted your code ${times(sharedCode.length)} so the AI could answer about your project, not a generic one.`,
      examples: quote(sharedCode),
    })
  }
  if (studentFirst >= 10) {
    strengths.push({
      title: 'You wrote code before asking about it',
      detail: `About ${studentFirst}% of your final code is code you wrote and brought to the AI, not code it gave you.`,
      examples: [],
    })
  }
  if (aiShare !== null && aiShare < 50 && handOffs.length === 0) {
    strengths.push({
      title: 'Your final code is mostly your own',
      detail: `Only ${aiShare}% of what you submitted matches code the AI wrote.`,
      examples: [],
    })
  }

  if (handOffs.length >= 1) {
    improvements.push({
      title: 'Write features yourself before asking the AI to build them',
      detail: `${handOffs.length === 1 ? 'Once' : `${handOffs.length} times`} you asked the AI to build a whole feature, page or file. Next time, ask how to approach it, write a first version yourself, then ask the AI to review it.`,
      examples: quote(handOffs),
    })
  }
  if (aiShare !== null && aiShare >= 60) {
    improvements.push({
      title: "Make the AI's code your own",
      detail: `${aiShare}% of your submitted code matches code the AI wrote. When you use a suggestion, change it to fit your project and make sure you can explain each line.`,
      examples: [],
    })
  }
  if (downloads >= 1) {
    improvements.push({
      title: 'Avoid taking whole files from the AI',
      detail: `The AI handed you ${downloads} code file${downloads === 1 ? '' : 's'} to download. Ask it to explain the changes instead, and make them yourself.`,
      examples: [],
    })
  }
  if (barePastes.length >= 3) {
    improvements.push({
      title: 'Say what you expected when you paste code',
      detail: `${barePastes.length} times you pasted code with only a few words, like "why isnt this working". Add what you expected, what happened instead, and what you've already tried. You'll get better answers and practise debugging.`,
      examples: quote(barePastes),
    })
  }
  if (terse.length >= 5 && terse.length / Math.max(counted.length, 1) > 0.2) {
    improvements.push({
      title: 'Give the AI more to go on',
      detail: `${terse.length} of your requests were short instructions. Say what you want to achieve and why, not just the change.`,
      examples: quote(terse),
    })
  }
  if (reviews.length === 0 && counted.length >= 3) {
    improvements.push({
      title: 'Ask the AI to review your code',
      detail: 'You never asked the AI to check code you wrote. Try "here\'s my CSS for the nav. What would you change, and why?"',
      examples: [],
    })
  }
  if (questions.length === 0 && counted.length >= 3) {
    improvements.push({
      title: 'Ask why, not just how',
      detail: 'You didn\'t ask any questions about how the code works. When the AI gives you something, ask why it works that way.',
      examples: [],
    })
  }

  const notes: string[] = []
  if (offTopic > 0) {
    notes.push(
      `${offTopic} request${offTopic === 1 ? ' was' : 's were'} about something other than the code (like images or story writing) and ${offTopic === 1 ? "wasn't" : "weren't"} counted.`
    )
  }

  return { strengths, improvements, notes }
}

export function feedbackToText(feedback: AiUseFeedback): string {
  const section = (heading: string, points: FeedbackPoint[]) =>
    points.length === 0
      ? ''
      : `${heading}\n` +
        points
          .map(p => [`- ${p.title}. ${p.detail}`, ...p.examples.map(e => `    "${e.text}"`)].join('\n'))
          .join('\n') +
        '\n'
  return [
    section('What you are doing well', feedback.strengths),
    section('What to work on', feedback.improvements),
    feedback.notes.join('\n'),
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * Up to three short quotes in the student's own words, spread across the chat.
 * A message quoted for one point isn't reused for another, so each point stands
 * on its own evidence.
 */
function quoteFrom(used: Set<string>) {
  return (messages: LocatedMessage[]): FeedbackQuote[] => {
    // One quote per distinct wording; the first message that said it is the link.
    const byText = new Map<string, string>()
    for (const m of messages) {
      const text = cleanQuote(ownWords(m.content))
      if (text && !byText.has(text)) byText.set(text, m.anchor)
    }
    const all = Array.from(byText.keys())
    const fresh = all.filter(w => !used.has(w))
    const pool = fresh.length > 0 ? fresh : all
    const picked =
      pool.length <= MAX_EXAMPLES
        ? pool
        : Array.from({ length: MAX_EXAMPLES }, (_, i) => pool[Math.floor((i * pool.length) / MAX_EXAMPLES)])
    picked.forEach(w => used.add(w))
    return picked.map(w => ({
      text: w.length > EXAMPLE_MAX_CHARS ? `${w.slice(0, EXAMPLE_MAX_CHARS - 1).trimEnd()}…` : w,
      anchor: byText.get(w)!,
    }))
  }
}

/** Drop attachment placeholders and the stray braces a paste leaves at its edges. */
function cleanQuote(words: string): string {
  return words
    .replace(/\[image\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[^\w"']+|[\s{}();<>/*]+$/g, '')
    .trim()
}

function times(n: number, sentenceStart = false): string {
  const word = n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`
  return sentenceStart ? word[0].toUpperCase() + word.slice(1) : word
}
