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
    parts?: string[]
    text?: string
  }
  create_time?: number
  metadata?: Record<string, unknown>
}

interface ChatGPTConversation {
  id: string
  title: string
  create_time: number
  mapping: Record<string, {
    id: string
    message?: ChatGPTMessage
    parent?: string
    children?: string[]
  }>
}

/**
 * Extract code blocks from markdown-formatted text
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const codeBlocks: CodeBlock[] = []
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g

  let match
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({
      language: match[1] || 'plaintext',
      code: match[2].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    })
  }

  return codeBlocks
}

/**
 * Parse a single ChatGPT conversation from the export format
 */
export function parseConversation(conversation: ChatGPTConversation): ParsedChat {
  const messages: ChatMessage[] = []

  // Find the root message and traverse the conversation tree
  const nodeIds = Object.keys(conversation.mapping)
  const rootNodes = nodeIds.filter(id => !conversation.mapping[id].parent)

  // Build message chain by following children
  function traverseMessages(nodeId: string) {
    const node = conversation.mapping[nodeId]
    if (!node) return

    if (node.message && node.message.author.role !== 'system' && node.message.author.role !== 'tool') {
      const msg = node.message
      let content = ''

      if (msg.content.parts && msg.content.parts.length > 0) {
        content = msg.content.parts.join('\n')
      } else if (msg.content.text) {
        content = msg.content.text
      }

      if (content) {
        const codeBlocks = msg.author.role === 'assistant' ? extractCodeBlocks(content) : []

        messages.push({
          id: msg.id,
          role: msg.author.role as 'user' | 'assistant',
          content,
          timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : undefined,
          codeBlocks,
        })
      }
    }

    // Follow children in order
    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        traverseMessages(childId)
      }
    }
  }

  // Start traversal from root nodes
  for (const rootId of rootNodes) {
    traverseMessages(rootId)
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
