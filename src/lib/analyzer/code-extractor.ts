/**
 * Code Extractor
 *
 * Extracts and organizes code blocks from chat conversations
 * for comparison with final submitted code.
 */

import { ParsedChat, CodeBlock, assistantCodeBlocks, extractCodeBlocks } from '../parser/chatgpt'

export interface ExtractedCodeSummary {
  totalBlocks: number
  byLanguage: Record<string, number>
  allCode: string
  codeBlocks: CodeBlock[]
  userCodeBlocks: CodeBlock[]
}

/**
 * Extract all code from assistant messages in a chat
 */
export function extractAssistantCode(chat: ParsedChat): CodeBlock[] {
  return chat.messages.flatMap(assistantCodeBlocks)
}

const CODE_LINE_PATTERNS: Array<[RegExp, string]> = [
  // Chat exports sometimes escape tags as `\<div>`.
  [/\\?<\/?[a-z!][\w-]*(\s[^<>]*)?\/?>/i, 'html'],
  [/^\s*[\w-]+\s*:\s*[^;]+;\s*$/, 'css'],
  [/^\s*[^{}]+\{\s*$/, 'css'],
  [/\b(const|let|var|function|return)\b|=>|document\.|\);\s*$/, 'javascript'],
]

/** Lines that must look like code before an unfenced message counts as a paste. */
const MIN_UNFENCED_CODE_LINES = 3

/**
 * Code pasted straight into a message, without markdown fences. Students paste
 * this way far more often than they fence: one transcript had ten pastes of the
 * student's own pages and was counted as sharing no code at all.
 */
export function detectUnfencedCode(content: string): CodeBlock | null {
  const votes: Record<string, number> = {}
  let codeLines = 0
  for (const line of content.split('\n')) {
    const match = CODE_LINE_PATTERNS.find(([pattern]) => pattern.test(line))
    if (!match) continue
    codeLines++
    votes[match[1]] = (votes[match[1]] ?? 0) + 1
  }
  if (codeLines < MIN_UNFENCED_CODE_LINES) return null

  const language = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]
  return { language, code: content.trim(), startIndex: 0, endIndex: content.length }
}

/**
 * A student message with the code taken out: fenced or tagged blocks, and pasted
 * lines that read as code when the message carries a paste.
 *
 * Length was meant to measure how well the student described their problem, but a
 * 6,000-character paste with "what needs to change" on top scored as the most
 * articulate message in the transcript. One student's average prompt was 381
 * characters while their typical prompt was 45.
 */
export function ownWords(content: string): string {
  let text = ''
  let cursor = 0
  for (const block of extractCodeBlocks(content)) {
    text += content.slice(cursor, block.startIndex) + '\n'
    cursor = block.endIndex
  }
  text += content.slice(cursor)

  // Everything from the first pasted code line to the last is the paste, prose
  // between tags included: a pasted page's paragraphs aren't the student explaining.
  if (detectUnfencedCode(text)) {
    const lines = text.split('\n')
    const isCode = lines.map(line => CODE_LINE_PATTERNS.some(([pattern]) => pattern.test(line)))
    const first = isCode.indexOf(true)
    const last = isCode.lastIndexOf(true)
    // "whats wrong with this html: <!doctype html>" opens the paste mid-line.
    const lead = lines[first].slice(0, Math.max(lines[first].search(/\\?</), 0))
    text = [...lines.slice(0, first), lead, ...lines.slice(last + 1)].join('\n')
  }
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Extract all code from user messages (shows they're engaging with code)
 */
export function extractUserCode(chat: ParsedChat): CodeBlock[] {
  const userCodeBlocks: CodeBlock[] = []

  chat.messages
    .filter(msg => msg.role === 'user')
    .forEach(msg => {
      if (!msg.content) return
      const fenced = extractCodeBlocks(msg.content)
      if (fenced.length > 0) {
        userCodeBlocks.push(...fenced)
        return
      }
      const unfenced = detectUnfencedCode(msg.content)
      if (unfenced) userCodeBlocks.push(unfenced)
    })

  return userCodeBlocks
}

/**
 * Get comprehensive code extraction summary
 */
export function getCodeSummary(chat: ParsedChat): ExtractedCodeSummary {
  const assistantBlocks = extractAssistantCode(chat)
  const userBlocks = extractUserCode(chat)
  const allBlocks = [...assistantBlocks, ...userBlocks]

  // Count by language
  const byLanguage: Record<string, number> = {}
  for (const block of allBlocks) {
    const lang = block.language || 'unknown'
    byLanguage[lang] = (byLanguage[lang] || 0) + 1
  }

  // Concatenate all assistant code for diff comparison
  const allCode = assistantBlocks.map(b => b.code).join('\n\n')

  return {
    totalBlocks: assistantBlocks.length,
    byLanguage,
    allCode,
    codeBlocks: assistantBlocks,
    userCodeBlocks: userBlocks,
  }
}

/**
 * Get the most likely "final" code from a conversation
 * (Usually the last substantial code block)
 */
export function getFinalAssistantCode(chat: ParsedChat, minLines = 5): string | null {
  const codeBlocks = extractAssistantCode(chat)

  // Find the last substantial code block
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    const block = codeBlocks[i]
    const lines = block.code.split('\n').length
    if (lines >= minLines) {
      return block.code
    }
  }

  // Return the last block if no substantial one found
  if (codeBlocks.length > 0) {
    return codeBlocks[codeBlocks.length - 1].code
  }

  return null
}

/**
 * Find similar code blocks between AI suggestions and final code
 */
export function findSimilarBlocks(
  aiCode: string,
  finalCode: string,
  threshold = 0.7
): { similarity: number; matchedLines: number; totalLines: number } {
  const aiLines = aiCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const finalLines = finalCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  let matchedLines = 0
  const finalLinesSet = new Set(finalLines)

  for (const line of aiLines) {
    if (finalLinesSet.has(line)) {
      matchedLines++
    }
  }

  const similarity = aiLines.length > 0 ? matchedLines / aiLines.length : 0

  return {
    similarity,
    matchedLines,
    totalLines: aiLines.length,
  }
}

/**
 * Analyze how much the student modified AI-generated code
 */
export interface ModificationAnalysis {
  /** Share of the submitted code that is the assistant's code, run for run. */
  verbatimPercentage: number
  /**
   * Share of the submitted code the student had pasted into the chat before the
   * assistant repeated it. Counted as the student's, not the assistant's.
   */
  studentFirstPercentage: number
  modifiedLines: number
  addedLines: number
  removedLines: number
  assessment: 'verbatim' | 'minor-changes' | 'substantial-changes' | 'significant-rewrite'
}

/**
 * Tokens per comparison window. Single tokens said almost nothing: every HTML or
 * CSS file is made of `<`, `div`, `class`, `px`, so unrelated CSS scored 94%
 * "verbatim" against a long transcript, and normalize.css, never mentioned in
 * the chat, scored 80%. Eight tokens in a row was still too short: against a
 * long transcript, generic markup like `</a><a href="` matched half of an
 * unrelated page. Sixteen tokens, about one CSS rule or one line of markup,
 * brought unrelated pages to 31% or under while pages that really were pasted
 * from the chat stayed above 85%.
 *
 * Exact matching means renaming every variable in the assistant's code reads as
 * independent work. Catching that needs a parser per language, not a token trick.
 */
const SHINGLE_SIZE = 16

/**
 * Split code into identifiers, numbers, and individual punctuation marks.
 *
 * Whitespace and line structure are discarded, so reformatting — reindenting, or
 * collapsing a file onto one line — cannot change the result.
 */
function tokenize(code: string): string[] {
  return code.match(/[A-Za-z0-9_$]+|[^\sA-Za-z0-9_$]/g) ?? []
}

function shingleKeys(tokens: string[]): string[] {
  const keys: string[] = []
  for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i++) {
    keys.push(tokens.slice(i, i + SHINGLE_SIZE).join('\u0000'))
  }
  return keys
}

/** Shingles the student wrote into the chat before the assistant ever produced them. */
export type StudentFirstShingles = Set<string>

/**
 * Walk the chats in order and record which shingles the student introduced.
 *
 * Students paste their own code to ask about it, and the assistant echoes it back
 * in its answer. Counting the echo as the assistant's made a student's own pages
 * look copied; here, whoever wrote a run of code first owns it. A student pasting
 * the assistant's earlier code back doesn't make it theirs.
 */
export function findStudentFirstShingles(chats: ParsedChat[]): StudentFirstShingles {
  const seen = new Set<string>()
  const student: StudentFirstShingles = new Set()

  for (const chat of chats) {
    for (const msg of chat.messages) {
      // Students paste code without fences, so their whole message is in play.
      const code = msg.role === 'user' ? msg.content : assistantCodeBlocks(msg).map(b => b.code).join('\n')
      for (const key of shingleKeys(tokenize(code))) {
        if (seen.has(key)) continue
        seen.add(key)
        if (msg.role === 'user') student.add(key)
      }
    }
  }

  return student
}

/** Which of `final`'s tokens fall inside a shingle from `source`. */
function coveredTokens(final: string[], source: Set<string>): boolean[] {
  const covered = new Array<boolean>(final.length).fill(false)
  shingleKeys(final).forEach((key, i) => {
    if (!source.has(key)) return
    for (let j = i; j < i + SHINGLE_SIZE; j++) covered[j] = true
  })
  return covered
}

function percentage(flags: boolean[]): number {
  return flags.length > 0 ? (flags.filter(Boolean).length / flags.length) * 100 : 0
}

/**
 * Estimates how much of the submitted code originated with the assistant.
 *
 * Comparison is over runs of tokens, so formatting alone cannot move it: it used to
 * compare whole trimmed lines, and running the assistant's output through a
 * minifier scored 0% verbatim. It then compared single tokens, which made any two
 * pieces of HTML look alike (see SHINGLE_SIZE).
 *
 * Pass `studentFirst` (from findStudentFirstShingles) so code the student wrote
 * before the assistant repeated it is credited to the student.
 */
export function analyzeModifications(
  aiCode: string,
  finalCode: string,
  studentFirst?: StudentFirstShingles
): ModificationAnalysis {
  const aiLines = aiCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const finalLines = finalCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Line counts describe the rendered diff, which is line-based.
  const aiLinesSet = new Set(aiLines)
  const finalLinesSet = new Set(finalLines)
  const addedLines = finalLines.filter(line => !aiLinesSet.has(line)).length
  const removedLines = aiLines.filter(line => !finalLinesSet.has(line)).length

  const aiTokens = tokenize(aiCode)
  const finalTokens = tokenize(finalCode)
  const aiShingles = shingleKeys(aiTokens).filter(k => !studentFirst?.has(k))

  const exact = coveredTokens(finalTokens, new Set(aiShingles))
  const studentOwned = studentFirst
    ? coveredTokens(finalTokens, studentFirst).map((owned, i) => owned && !exact[i])
    : []

  const verbatimPercentage = percentage(exact)

  let assessment: ModificationAnalysis['assessment']
  if (verbatimPercentage > 95) {
    assessment = 'verbatim'
  } else if (verbatimPercentage > 80) {
    assessment = 'minor-changes'
  } else if (verbatimPercentage > 50) {
    assessment = 'substantial-changes'
  } else {
    assessment = 'significant-rewrite'
  }

  return {
    verbatimPercentage,
    studentFirstPercentage: percentage(studentOwned),
    modifiedLines: addedLines + removedLines,
    addedLines,
    removedLines,
    assessment,
  }
}
