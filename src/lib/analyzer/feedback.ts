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

export type StrengthId =
  | 'asks-questions'
  | 'describes-bugs'
  | 'asks-for-review'
  | 'shares-code'
  | 'writes-first'
  | 'mostly-own-code'

export type ImprovementId =
  | 'hands-off-features'
  | 'mostly-ai-code'
  | 'takes-ai-files'
  | 'bare-pastes'
  | 'terse-prompts'
  | 'no-review'
  | 'no-questions'

export type FindingId = StrengthId | ImprovementId

/**
 * A finding without its wording: what's stored with a score so class-wide views
 * can read it without re-analyzing every transcript. Labels come from FINDINGS
 * at display time, so rewording one doesn't need a rescore.
 */
export interface Finding {
  id: FindingId
  /** The number behind it: occurrences, or a percentage for mostly-ai-code / mostly-own-code. */
  count: number
}

export interface AiUseFindings {
  strengths: Finding[]
  /** Most important first, the order the summary lists them. */
  improvements: Finding[]
}

interface FindingCopy {
  /** Third person, for a teacher reading across the class. */
  classLabel: string
  /** A few words for a submissions-list row. */
  tag: (count: number) => string
  /** What a teacher could do about it in class (improvements only). */
  teachingTip?: string
}

export const FINDINGS: Record<FindingId, FindingCopy> = {
  'asks-questions': { classLabel: 'Ask questions to understand', tag: n => `${n} questions` },
  'describes-bugs': { classLabel: 'Describe the bugs they hit', tag: n => `${n} bugs described` },
  'asks-for-review': { classLabel: 'Ask the AI to review their code', tag: n => `${n} reviews` },
  'shares-code': { classLabel: 'Share their code for context', tag: n => `${n} pastes` },
  'writes-first': { classLabel: 'Write code before asking about it', tag: n => `${n}% written first` },
  'mostly-own-code': { classLabel: 'Submit mostly their own code', tag: n => `${n}% AI code` },
  'hands-off-features': {
    classLabel: 'Hand whole features to the AI',
    tag: n => `${n} hand-off${n === 1 ? '' : 's'}`,
    teachingTip: 'Model breaking a feature into steps and asking the AI for an approach, not the code.',
  },
  'mostly-ai-code': {
    classLabel: "Submit mostly the AI's code",
    tag: n => `${n}% AI code`,
    teachingTip: 'Have students explain a few AI-written lines in their own words before submitting.',
  },
  'takes-ai-files': {
    classLabel: 'Take whole files from the AI',
    tag: n => `${n} AI file${n === 1 ? '' : 's'}`,
    teachingTip: 'Ask for changes to be made by hand, with the AI explaining them.',
  },
  'bare-pastes': {
    classLabel: 'Paste code without describing the problem',
    tag: n => `${n} bare pastes`,
    teachingTip: 'Teach a three-part bug report: what I expected, what happened, what I tried.',
  },
  'terse-prompts': {
    classLabel: 'Give short instructions without context',
    tag: n => `${n} terse prompts`,
    teachingTip: 'Show a weak and a strong prompt for the same task side by side.',
  },
  'no-review': {
    classLabel: 'Never ask for a review',
    tag: () => 'No reviews',
    teachingTip: 'Make "ask the AI to review your code" a required step.',
  },
  'no-questions': {
    classLabel: 'Never ask why',
    tag: () => 'No questions',
    teachingTip: 'Require one "why does this work?" question per feature.',
  },
}

export interface FeedbackPoint {
  id: FindingId
  count: number
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
      id: 'asks-questions', count: questions.length,
      title: 'You ask questions to understand, not just to get code',
      detail: `You asked ${questions.length} questions about how things work. That's using the AI as a tutor, which is how you learn the most from it.`,
      examples: quote(questions),
    })
  }
  if (debugging.length >= 2) {
    strengths.push({
      id: 'describes-bugs', count: debugging.length,
      title: 'You work through bugs by describing what went wrong',
      detail: `${times(debugging.length, true)} you described a specific problem you'd run into instead of asking for the whole thing again.`,
      examples: quote(debugging),
    })
  }
  if (reviews.length >= 1) {
    strengths.push({
      id: 'asks-for-review', count: reviews.length,
      title: 'You ask the AI to check code you already have',
      detail: `You asked for a review or a second opinion ${times(reviews.length)}. Questions like "do I keep this?" are exactly the right use.`,
      examples: quote(reviews),
    })
  }
  if (sharedCode.length >= 2 && barePastes.length < sharedCode.length / 2) {
    strengths.push({
      id: 'shares-code', count: sharedCode.length,
      title: 'You share your own code for context',
      detail: `You pasted your code ${times(sharedCode.length)} so the AI could answer about your project, not a generic one.`,
      examples: quote(sharedCode),
    })
  }
  if (studentFirst >= 10) {
    strengths.push({
      id: 'writes-first', count: studentFirst,
      title: 'You wrote code before asking about it',
      detail: `About ${studentFirst}% of your final code is code you wrote and brought to the AI, not code it gave you.`,
      examples: [],
    })
  }
  if (aiShare !== null && aiShare < 50 && handOffs.length === 0) {
    strengths.push({
      id: 'mostly-own-code', count: aiShare,
      title: 'Your final code is mostly your own',
      detail: `Only ${aiShare}% of what you submitted matches code the AI wrote.`,
      examples: [],
    })
  }

  if (handOffs.length >= 1) {
    improvements.push({
      id: 'hands-off-features', count: handOffs.length,
      title: 'Write features yourself before asking the AI to build them',
      detail: `${handOffs.length === 1 ? 'Once' : `${handOffs.length} times`} you asked the AI to build a whole feature, page or file. Next time, ask how to approach it, write a first version yourself, then ask the AI to review it.`,
      examples: quote(handOffs),
    })
  }
  if (aiShare !== null && aiShare >= 60) {
    improvements.push({
      id: 'mostly-ai-code', count: aiShare,
      title: "Make the AI's code your own",
      detail: `${aiShare}% of your submitted code matches code the AI wrote. When you use a suggestion, change it to fit your project and make sure you can explain each line.`,
      examples: [],
    })
  }
  if (downloads >= 1) {
    improvements.push({
      id: 'takes-ai-files', count: downloads,
      title: 'Avoid taking whole files from the AI',
      detail: `The AI handed you ${downloads} code file${downloads === 1 ? '' : 's'} to download. Ask it to explain the changes instead, and make them yourself.`,
      examples: [],
    })
  }
  if (barePastes.length >= 3) {
    improvements.push({
      id: 'bare-pastes', count: barePastes.length,
      title: 'Say what you expected when you paste code',
      detail: `${barePastes.length} times you pasted code with only a few words, like "why isnt this working". Add what you expected, what happened instead, and what you've already tried. You'll get better answers and practise debugging.`,
      examples: quote(barePastes),
    })
  }
  if (terse.length >= 5 && terse.length / Math.max(counted.length, 1) > 0.2) {
    improvements.push({
      id: 'terse-prompts', count: terse.length,
      title: 'Give the AI more to go on',
      detail: `${terse.length} of your requests were short instructions. Say what you want to achieve and why, not just the change.`,
      examples: quote(terse),
    })
  }
  if (reviews.length === 0 && counted.length >= 3) {
    improvements.push({
      id: 'no-review', count: 0,
      title: 'Ask the AI to review your code',
      detail: 'You never asked the AI to check code you wrote. Try "here\'s my CSS for the nav. What would you change, and why?"',
      examples: [],
    })
  }
  if (questions.length === 0 && counted.length >= 3) {
    improvements.push({
      id: 'no-questions', count: 0,
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

/** The compact form stored with a score. */
export function summarizeFindings(feedback: AiUseFeedback): AiUseFindings {
  const strip = (p: FeedbackPoint): Finding => ({ id: p.id, count: p.count })
  return { strengths: feedback.strengths.map(strip), improvements: feedback.improvements.map(strip) }
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

export interface ClassPattern {
  id: FindingId
  /** Students it applies to, in submission order. */
  students: string[]
}

export interface ClassPatterns {
  /** Submissions with stored findings. */
  analyzed: number
  /** Chat submissions scored before findings were stored; a rescore fills them in. */
  notAnalyzed: number
  improvements: ClassPattern[]
  strengths: ClassPattern[]
}

/**
 * How many students share each finding, most common first: what to teach next,
 * rather than what to tell one student. Reads the findings stored with each score.
 */
export function classPatterns(
  submissions: Array<{ studentName: string; submissionMode: string; aiUseFindings: string | null }>
): ClassPatterns {
  const tally = { strengths: new Map<FindingId, string[]>(), improvements: new Map<FindingId, string[]>() }
  let analyzed = 0
  let notAnalyzed = 0

  for (const sub of submissions) {
    if (sub.submissionMode === 'code_only') continue
    const findings = parseFindings(sub.aiUseFindings)
    if (!findings) {
      notAnalyzed++
      continue
    }
    analyzed++
    for (const kind of ['strengths', 'improvements'] as const) {
      for (const finding of findings[kind]) {
        if (!(finding.id in FINDINGS)) continue
        tally[kind].set(finding.id, [...(tally[kind].get(finding.id) ?? []), sub.studentName])
      }
    }
  }

  const ranked = (map: Map<FindingId, string[]>) =>
    Array.from(map, ([id, students]) => ({ id, students })).sort((a, b) => b.students.length - a.students.length)

  return { analyzed, notAnalyzed, improvements: ranked(tally.improvements), strengths: ranked(tally.strengths) }
}

export function parseFindings(stored: string | null | undefined): AiUseFindings | null {
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed?.strengths) && Array.isArray(parsed?.improvements) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The one finding most worth a teacher's attention, for a submissions-list row:
 * the summary's first improvement. Null when there's nothing to work on or the
 * submission hasn't been analyzed.
 */
export function topFinding(stored: string | null | undefined): { tag: string; label: string } | null {
  const first = parseFindings(stored)?.improvements.find(f => f.id in FINDINGS)
  if (!first) return null
  const copy = FINDINGS[first.id]
  return { tag: copy.tag(first.count), label: copy.classLabel }
}
