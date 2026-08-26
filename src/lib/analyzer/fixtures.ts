/** Test fixtures: builders for parsed chats. */
import type { ChatMessage, ParsedChat } from '../parser/chatgpt'
import { extractCodeBlocks } from '../parser/chatgpt'

export function message(role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id: `${role}-${content.slice(0, 8)}`,
    role,
    content,
    codeBlocks: role === 'assistant' ? extractCodeBlocks(content) : [],
  }
}

export function chat(...messages: ChatMessage[]): ParsedChat {
  return {
    id: 'chat-1',
    title: 'Fixture',
    createdAt: '2026-01-01T00:00:00.000Z',
    messages,
    totalCodeBlocks: messages.reduce((sum, m) => sum + m.codeBlocks.length, 0),
  }
}
