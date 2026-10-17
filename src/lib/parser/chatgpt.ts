/**
 * ChatGPT Export Parser
 *
 * Parses ChatGPT JSON export format (from conversations.json export)
 * and extracts structured message data.
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  codeBlocks: CodeBlock[]
}

export interface CodeBlock {
  language: string
  code: string
  startIndex: number
  endIndex: number
}

export interface ParsedChat {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  totalCodeBlocks: number
}

// ChatGPT export format types
interface ChatGPTMessage {
  id: string
  author: {
    role: 'user' | 'assistant' | 'system' | 'tool'
  }
  content: {
    content_type: string
    /** Pasted images arrive as objects among the strings. */
    parts?: Array<string | Record<string, unknown>>
    text?: string
  }
  create_time?: number
  /** 'all' for a visible reply; a tool name when the assistant is calling a tool. */
  recipient?: string
  metadata?: Record<string, unknown>
}

interface ChatGPTConversation {
  id: string
  title: string
  create_time: number
  /** Leaf of the branch actually shown in ChatGPT; absent in some exports. */
  current_node?: string
  mapping: Record<string, {
    id: string
    message?: ChatGPTMessage
    parent?: string
    children?: string[]
  }>
}

const FENCED_CODE = /```(\w*)\n?([\s\S]*?)```/g

/**
 * ChatGPT's newer replies wrap code in `<CodeBlock language="html" editable>`
 * tags instead of markdown fences. Reading fences only missed every one of them:
 * a site the assistant wrote whole was invisible to the independence check.
 */
const TAGGED_CODE = /<CodeBlock\b([^>]*)>\n?([\s\S]*?)<\/CodeBlock>/g

/**
 * Extract code blocks from a message, fenced or tagged, in order of appearance.
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const codeBlocks: CodeBlock[] = []

  for (const match of Array.from(content.matchAll(FENCED_CODE))) {
    codeBlocks.push({
      language: match[1] || 'plaintext',
      code: match[2].trim(),
      startIndex: match.index ?? 0,
      endIndex: (match.index ?? 0) + match[0].length,
    })
  }

  for (const match of Array.from(content.matchAll(TAGGED_CODE))) {
    codeBlocks.push({
      language: match[1].match(/\blanguage\s*=\s*"([^"]*)"/)?.[1] || 'plaintext',
      code: match[2].trim(),
      startIndex: match.index ?? 0,
      endIndex: (match.index ?? 0) + match[0].length,
    })
  }

  return codeBlocks.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * An assistant message's code, re-read from its text. Chats are stored already
 * parsed, so going back to the text lets a rescore pick up extraction fixes
 * (like tagged code) without the original export being re-imported.
 */
export function assistantCodeBlocks(message: ChatMessage): CodeBlock[] {
  return message.role === 'assistant' ? extractCodeBlocks(message.content) : []
}

const CODE_FILE = /\.(html?|css|scss|js|mjs|jsx|ts|tsx|py|java|c|cpp|cs|rb|php|go|rs|json|zip)$/i

/**
 * Code files the assistant handed over as downloads (`sandbox:/mnt/data/main.css`).
 * Their contents never appear in the transcript, so they can't be compared with
 * the final code; they're reported instead.
 */
export function extractCodeDownloads(content: string): string[] {
  const links = Array.from(content.matchAll(/\]\((sandbox:[^)\s]+)\)/g), m => m[1])
  return Array.from(new Set(links.filter(link => CODE_FILE.test(link))))
}

/** Message kinds that are never part of the visible conversation. */
function isHiddenMessage(msg: ChatGPTMessage): boolean {
  // Tool calls: image-generation prompts, code the assistant ran in its sandbox.
  if (msg.recipient && msg.recipient !== 'all') return true
  if (msg.metadata?.is_visually_hidden_from_conversation === true) return true
  // Reasoning traces and other non-reply content types. Simpler exports omit the
  // field entirely, and those messages are all visible.
  const type = msg.content.content_type
  return !!type && !['text', 'multimodal_text'].includes(type)
}

/**
 * The single conversation branch the student actually saw.
 *
 * A ChatGPT export is a tree, not a list: editing a prompt or regenerating a reply
 * adds a sibling branch. Walking every child counted all abandoned variants, which
 * inflated message and code-block counts for exactly the students who iterated
 * most. Walking back from `current_node` recovers the surviving branch instead.
 *
 * Exports without `current_node` fall back to following the first child at each
 * step, which is the same branch when nothing was ever regenerated.
 */
function conversationPath(
  conversation: ChatGPTConversation
): Array<{ id: string; message?: ChatGPTMessage; parent?: string; children?: string[] }> {
  const { mapping, current_node: currentNode } = conversation

  if (currentNode && mapping[currentNode]) {
    const chain = []
    const visited = new Set<string>()
    let cursor: string | undefined = currentNode

    while (cursor && mapping[cursor] && !visited.has(cursor)) {
      visited.add(cursor)
      chain.push(mapping[cursor])
      cursor = mapping[cursor].parent
    }

    return chain.reverse()
  }

  const roots = Object.keys(mapping).filter(id => !mapping[id].parent)
  const path = []
  const visited = new Set<string>()

  for (const root of roots) {
    let cursor: string | undefined = root
    while (cursor && mapping[cursor] && !visited.has(cursor)) {
      visited.add(cursor)
      path.push(mapping[cursor])
      cursor = mapping[cursor].children?.[0]
    }
  }

  return path
}

/**
 * Parse a single ChatGPT conversation from the export format
 */
export function parseConversation(conversation: ChatGPTConversation): ParsedChat {
  const messages: ChatMessage[] = []

  for (const node of conversationPath(conversation)) {
    if (!node.message) continue
    const msg = node.message
    if (msg.author.role === 'system' || msg.author.role === 'tool') continue
    if (isHiddenMessage(msg)) continue

    let content = ''
    if (msg.content.parts && msg.content.parts.length > 0) {
      // Joining an image object used to put "[object Object]" in the transcript.
      content = msg.content.parts.map(part => (typeof part === 'string' ? part : '[image]')).join('\n')
    } else if (msg.content.text) {
      content = msg.content.text
    }
    if (!content) continue

    const codeBlocks = msg.author.role === 'assistant' ? extractCodeBlocks(content) : []

    messages.push({
      id: msg.id,
      role: msg.author.role as 'user' | 'assistant',
      content,
      timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : undefined,
      codeBlocks,
    })
  }

  // Count total code blocks
  const totalCodeBlocks = messages.reduce((sum, msg) => sum + msg.codeBlocks.length, 0)

  return {
    id: conversation.id,
    title: conversation.title || 'Untitled Conversation',
    messages,
    createdAt: new Date(conversation.create_time * 1000).toISOString(),
    totalCodeBlocks,
  }
}

/**
 * Parse ChatGPT export JSON (can be single conversation or array)
 */
export function parseChatGPTExport(jsonContent: string): ParsedChat[] {
  try {
    const data = JSON.parse(jsonContent)

    // Handle array of conversations
    if (Array.isArray(data)) {
      return data.map(conv => parseConversation(conv))
    }

    // Handle single conversation
    if (data.mapping) {
      return [parseConversation(data)]
    }

    // Handle wrapped format (some exports have a conversations array)
    if (data.conversations && Array.isArray(data.conversations)) {
      return data.conversations.map((conv: ChatGPTConversation) => parseConversation(conv))
    }

    throw new Error('Unrecognized ChatGPT export format')
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format')
    }
    throw error
  }
}

/**
 * Extract all code blocks from all assistant messages in a parsed chat
 */
export function extractAllCodeFromChat(chat: ParsedChat): CodeBlock[] {
  return chat.messages
    .filter(msg => msg.role === 'assistant')
    .flatMap(msg => msg.codeBlocks)
}

/**
 * Get all code as a single concatenated string (for diff comparison)
 */
export function getAllCodeAsString(chat: ParsedChat): string {
  const allCode = extractAllCodeFromChat(chat)
  return allCode.map(block => block.code).join('\n\n')
}

/**
 * Alternative simple format parser for manual chat exports
 * Handles simpler formats where each message is a plain object
 */
export interface SimpleMessage {
  role: 'user' | 'assistant'
  content: string
}

export function parseSimpleFormat(jsonContent: string): ParsedChat {
  const data = JSON.parse(jsonContent)

  let messages: SimpleMessage[] = []

  // Handle array of messages directly
  if (Array.isArray(data)) {
    messages = data
  } else if (data.messages && Array.isArray(data.messages)) {
    messages = data.messages
  } else {
    throw new Error('Could not find messages in export')
  }

  const parsedMessages: ChatMessage[] = messages.map((msg, index) => {
    const codeBlocks = msg.role === 'assistant' ? extractCodeBlocks(msg.content) : []
    return {
      id: `msg-${index}`,
      role: msg.role,
      content: msg.content,
      codeBlocks,
    }
  })

  const totalCodeBlocks = parsedMessages.reduce((sum, msg) => sum + msg.codeBlocks.length, 0)

  return {
    id: `chat-${Date.now()}`,
    title: 'Imported Conversation',
    messages: parsedMessages,
    createdAt: new Date().toISOString(),
    totalCodeBlocks,
  }
}

/**
 * Smart parser that tries multiple formats
 */
export function smartParse(jsonContent: string): ParsedChat[] {
  // Try ChatGPT format first
  try {
    const result = parseChatGPTExport(jsonContent)
    if (result.length > 0 && result[0].messages.length > 0) {
      return result
    }
  } catch {
    // Fall through to try other formats
  }

  // Try simple format
  try {
    const result = parseSimpleFormat(jsonContent)
    if (result.messages.length > 0) {
      return [result]
    }
  } catch {
    // Fall through
  }

  throw new Error('Could not parse chat export. Please ensure it is a valid ChatGPT export file.')
}
