'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { highlightChat, getHighlightClass, getHighlightBadge, type HighlightedMessage } from '@/lib/analyzer/highlighter'
import type { ParsedChat } from '@/lib/parser/chatgpt'
import { User, Bot, MessageSquare } from 'lucide-react'

interface ChatViewerProps {
  chats: ParsedChat[]
  className?: string
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative my-3">
      {language && language !== 'plaintext' && (
        <div className="absolute top-0 right-0 px-2 py-1 text-xs text-muted-foreground bg-muted rounded-bl font-mono">
          {language}
        </div>
      )}
      <pre className="overflow-x-auto p-4 bg-slate-900 text-slate-100 rounded-lg text-sm">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function MessageContent({ content, codeBlocks }: { content: string; codeBlocks: { code: string; language: string; startIndex: number; endIndex: number }[] }) {
  if (codeBlocks.length === 0) {
    return <div className="whitespace-pre-wrap">{content}</div>
  }

  // Split content by code blocks
  const parts: { type: 'text' | 'code'; content: string; language?: string }[] = []
  let lastIndex = 0

  for (const block of codeBlocks) {
    // Add text before code block
    if (block.startIndex > lastIndex) {
      const text = content.slice(lastIndex, block.startIndex).trim()
      if (text) {
        parts.push({ type: 'text', content: text })
      }
    }
    // Add code block
    parts.push({ type: 'code', content: block.code, language: block.language })
    lastIndex = block.endIndex
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim()
    if (text) {
      parts.push({ type: 'text', content: text })
    }
  }

  return (
    <div>
      {parts.map((part, i) => (
        part.type === 'code' ? (
          <CodeBlock key={i} code={part.content} language={part.language || 'plaintext'} />
        ) : (
          <div key={i} className="whitespace-pre-wrap">{part.content}</div>
        )
      ))}
    </div>
  )
}

function Message({ message }: { message: HighlightedMessage }) {
  const isUser = message.role === 'user'
  const highlightClass = getHighlightClass(message.highlightType)
  const badge = getHighlightBadge(message.highlightType)

  return (
    <div className={cn(
      'chat-message p-4 rounded-lg',
      isUser ? 'bg-violet-50 border border-violet-200' : 'bg-white border border-slate-200',
      highlightClass && `${highlightClass}`
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-600'
        )}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">
              {isUser ? 'Student' : 'AI Assistant'}
            </span>
            {badge && (
              <Badge variant={badge.variant} className="text-xs">
                {badge.label}
              </Badge>
            )}
          </div>
          <div className="text-sm">
            <MessageContent
              content={message.content}
              codeBlocks={message.codeBlocks}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ChatViewer({ chats, className }: ChatViewerProps) {
  const highlightedChats = useMemo(() => {
    return chats.map(chat => ({
      ...chat,
      messages: highlightChat(chat),
    }))
  }, [chats])

  if (chats.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No chat data available</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-8', className)}>
      {highlightedChats.map((chat, chatIndex) => (
        <div key={chat.id}>
          {highlightedChats.length > 1 && (
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Conversation {chatIndex + 1}: {chat.title}
              </span>
            </div>
          )}
          <div className="space-y-3">
            {chat.messages.map((message, msgIndex) => (
              <Message key={`${chat.id}-${msgIndex}`} message={message} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
