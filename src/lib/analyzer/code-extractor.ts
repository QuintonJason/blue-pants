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

export function analyzeModifications(
  aiCode: string,
  finalCode: string
): ModificationAnalysis {
  const aiLines = aiCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const finalLines = finalCode.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  const aiLinesSet = new Set(aiLines)
  const finalLinesSet = new Set(finalLines)

  // Lines that appear in both
  let verbatimCount = 0
  for (const line of finalLines) {
    if (aiLinesSet.has(line)) {
      verbatimCount++
    }
  }

  // Lines added (in final but not in AI)
  let addedLines = 0
  for (const line of finalLines) {
    if (!aiLinesSet.has(line)) {
      addedLines++
    }
  }

  // Lines removed (in AI but not in final)
  let removedLines = 0
  for (const line of aiLines) {
    if (!finalLinesSet.has(line)) {
      removedLines++
    }
  }

  const modifiedLines = addedLines + removedLines
  const verbatimPercentage = finalLines.length > 0
    ? (verbatimCount / finalLines.length) * 100
    : 0

  // Determine assessment
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
    modifiedLines,
    addedLines,
    removedLines,
    assessment,
  }
}
