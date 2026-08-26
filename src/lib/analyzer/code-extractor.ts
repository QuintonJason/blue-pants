/**
 * Code Extractor
 *
 * Extracts and organizes code blocks from chat conversations
 * for comparison with final submitted code.
 */

import { ParsedChat, CodeBlock, extractCodeBlocks } from '../parser/chatgpt'

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
  return chat.messages
    .filter(msg => msg.role === 'assistant')
    .flatMap(msg => msg.codeBlocks)
}

/**
 * Extract all code from user messages (shows they're engaging with code)
 */
export function extractUserCode(chat: ParsedChat): CodeBlock[] {
  const userCodeBlocks: CodeBlock[] = []

  chat.messages
    .filter(msg => msg.role === 'user')
    .forEach(msg => {
      if (msg.content) {
        const blocks = extractCodeBlocks(msg.content)
        userCodeBlocks.push(...blocks)
      }
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
  verbatimPercentage: number
  modifiedLines: number
  addedLines: number
  removedLines: number
  assessment: 'verbatim' | 'minor-changes' | 'substantial-changes' | 'significant-rewrite'
}

/**
 * Split code into identifiers, numbers, and individual punctuation marks.
 *
 * Whitespace and line structure are discarded, so reformatting — reindenting, or
 * collapsing a file onto one line — cannot change the result.
 */
function tokenize(code: string): string[] {
  return code.match(/[A-Za-z0-9_$]+|[^\sA-Za-z0-9_$]/g) ?? []
}

/**
 * How many of `finalTokens` can be accounted for by `aiTokens`, treating both as
 * multisets so a token reused three times must appear three times to match.
 */
function countReusedTokens(aiTokens: string[], finalTokens: string[]): number {
  const pool = new Map<string, number>()
  for (const token of aiTokens) {
    pool.set(token, (pool.get(token) ?? 0) + 1)
  }

  let reused = 0
  for (const token of finalTokens) {
    const available = pool.get(token) ?? 0
    if (available > 0) {
      pool.set(token, available - 1)
      reused++
    }
  }
  return reused
}

/**
 * Estimates how much of the submitted code originated with the assistant.
 *
 * Comparison is token-based. It used to compare whole trimmed lines for exact
 * equality, which measured formatting rather than authorship: running the
 * assistant's own output through a minifier scored 0% verbatim and was reported as
 * a "significant rewrite" worth 95 on the Independence dimension, while pasting the
 * same code unchanged scored 20.
 */
export function analyzeModifications(
  aiCode: string,
  finalCode: string
): ModificationAnalysis {
  const aiLines = aiCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const finalLines = finalCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Line counts describe the rendered diff, which is line-based.
  const aiLinesSet = new Set(aiLines)
  const finalLinesSet = new Set(finalLines)
  const addedLines = finalLines.filter(line => !aiLinesSet.has(line)).length
  const removedLines = aiLines.filter(line => !finalLinesSet.has(line)).length

  // The assessment uses tokens, so formatting alone cannot move it.
  const aiTokens = tokenize(aiCode)
  const finalTokens = tokenize(finalCode)
  const verbatimPercentage = finalTokens.length > 0
    ? (countReusedTokens(aiTokens, finalTokens) / finalTokens.length) * 100
    : 0

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
    modifiedLines: addedLines + removedLines,
    addedLines,
    removedLines,
    assessment,
  }
}
