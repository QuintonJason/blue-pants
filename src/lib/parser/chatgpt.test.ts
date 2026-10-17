import { describe, it, expect } from 'vitest'
import { parseChatGPTExport, parseConversation, smartParse, extractCodeBlocks, extractCodeDownloads } from './chatgpt'

/** A node in the export's `mapping` tree. */
function node(id: string, parent: string | undefined, children: string[], role?: string, text?: string) {
  return {
    id,
    parent,
    children,
    ...(role
      ? {
          message: {
            id,
            author: { role },
            content: { content_type: 'text', parts: [text ?? ''] },
            create_time: 1700000000,
          },
        }
      : {}),
  }
}

/**
 * A conversation where the student regenerated the last reply, so the tree holds
 * both the abandoned answer and the kept one.
 */
function branchedExport(currentNode?: string) {
  return JSON.stringify({
    id: 'conv-1',
    title: 'Cards',
    create_time: 1700000000,
    ...(currentNode ? { current_node: currentNode } : {}),
    mapping: {
      root: node('root', undefined, ['u1']),
      u1: node('u1', 'root', ['a1'], 'user', 'How do I build a responsive card?'),
      a1: node('a1', 'u1', ['u2'], 'assistant', 'Use CSS grid'),
      u2: node('u2', 'a1', ['a2-abandoned', 'a2-kept'], 'user', 'Can you show the HTML?'),
      'a2-abandoned': node('a2-abandoned', 'u2', [], 'assistant', 'ABANDONED ```js\nlet a = 1\n```'),
      'a2-kept': node('a2-kept', 'u2', [], 'assistant', 'KEPT ```js\nlet b = 2\n```'),
    },
  })
}

describe('parseChatGPTExport', () => {
  it('follows only the branch the student kept', () => {
    // Walking every child counted abandoned regenerations too, inflating message
    // and code-block counts for the students who iterated most.
    const [parsed] = parseChatGPTExport(branchedExport('a2-kept'))

    expect(parsed.messages).toHaveLength(4)
    const contents = parsed.messages.map(m => m.content)
    expect(contents.some(c => c.includes('KEPT'))).toBe(true)
    expect(contents.some(c => c.includes('ABANDONED'))).toBe(false)
    expect(parsed.totalCodeBlocks).toBe(1)
  })

  it('preserves conversation order from root to leaf', () => {
    const [parsed] = parseChatGPTExport(branchedExport('a2-kept'))
    expect(parsed.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  it('still picks a single branch when current_node is absent', () => {
    const [parsed] = parseChatGPTExport(branchedExport())
    expect(parsed.messages).toHaveLength(4)
    const contents = parsed.messages.map(m => m.content).join(' ')
    // Exactly one of the two siblings, never both.
    expect(contents.includes('ABANDONED') !== contents.includes('KEPT')).toBe(true)
  })

  it('ignores a current_node that is not in the mapping', () => {
    const [parsed] = parseChatGPTExport(branchedExport('does-not-exist'))
    expect(parsed.messages).toHaveLength(4)
  })

  it('does not loop forever on a cyclic parent chain', () => {
    const cyclic = JSON.stringify({
      id: 'c', title: 'c', create_time: 1700000000, current_node: 'b',
      mapping: {
        a: { id: 'a', parent: 'b', children: ['b'], message: { id: 'a', author: { role: 'user' }, content: { content_type: 'text', parts: ['one'] } } },
        b: { id: 'b', parent: 'a', children: ['a'], message: { id: 'b', author: { role: 'assistant' }, content: { content_type: 'text', parts: ['two'] } } },
      },
    })
    const [parsed] = parseChatGPTExport(cyclic)
    expect(parsed.messages).toHaveLength(2)
  })

  it('skips system and tool messages', () => {
    const withSystem = JSON.stringify({
      id: 'c', title: 'c', create_time: 1700000000, current_node: 'u1',
      mapping: {
        sys: node('sys', undefined, ['u1'], 'system', 'You are helpful'),
        u1: node('u1', 'sys', [], 'user', 'Why is this slow?'),
      },
    })
    const [parsed] = parseChatGPTExport(withSystem)
    expect(parsed.messages.map(m => m.role)).toEqual(['user'])
  })
})

describe('smartParse', () => {
  it('parses the simple message-array format', () => {
    const [parsed] = smartParse(JSON.stringify({
      messages: [
        { role: 'user', content: 'Why does this fail?' },
        { role: 'assistant', content: 'Because ```js\nlet x = 1\n```' },
      ],
    }))
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.totalCodeBlocks).toBe(1)
  })

  it('throws on input it cannot parse', () => {
    expect(() => smartParse('not json at all')).toThrow()
    expect(() => smartParse(JSON.stringify({ unrelated: true }))).toThrow()
  })
})

describe('extractCodeBlocks', () => {
  it('extracts fenced blocks with their language', () => {
    const blocks = extractCodeBlocks('text ```css\n.a { color: red; }\n``` more ```\nplain\n```')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].language).toBe('css')
    expect(blocks[0].code).toBe('.a { color: red; }')
    expect(blocks[1].language).toBe('plaintext')
  })

  it('returns nothing when there is no code', () => {
    expect(extractCodeBlocks('just prose')).toHaveLength(0)
  })
})

describe('extractCodeBlocks: tagged code', () => {
  it("reads ChatGPT's <CodeBlock> tags alongside fences, in order", () => {
    const content = [
      'First:',
      '<CodeBlock language="html" editable>',
      '<h1>Hi</h1>',
      '</CodeBlock>',
      'Then:',
      '```css',
      'h1 { color: red; }',
      '```',
    ].join('\n')

    const blocks = extractCodeBlocks(content)
    expect(blocks.map(b => [b.language, b.code])).toEqual([
      ['html', '<h1>Hi</h1>'],
      ['css', 'h1 { color: red; }'],
    ])
  })
})

describe('extractCodeDownloads', () => {
  it('lists code files handed over as downloads, not images', () => {
    const content = 'Here: [CSS](sandbox:/mnt/data/main.css) and [cat](sandbox:/mnt/data/cat.png), again [CSS](sandbox:/mnt/data/main.css)'
    expect(extractCodeDownloads(content)).toEqual(['sandbox:/mnt/data/main.css'])
  })
})

describe('parseConversation: what counts as the conversation', () => {
  function message(id: string, role: string, content: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return { id, author: { role }, content, ...extra }
  }

  const parsed = parseConversation({
    id: 'c', title: 't', create_time: 1700000000,
    mapping: {
      u: { id: 'u', children: ['tool'], message: message('u', 'user', { content_type: 'multimodal_text', parts: [{ asset_pointer: 'file-1' }, 'what is this'] }) },
      tool: { id: 'tool', parent: 'u', children: ['think'], message: message('tool', 'assistant', { content_type: 'code', text: '{"prompt":"draw a cat"}' }, { recipient: 'image_gen' }) },
      think: { id: 'think', parent: 'tool', children: ['hidden'], message: message('think', 'assistant', { content_type: 'thoughts', thoughts: [] }) },
      hidden: { id: 'hidden', parent: 'think', children: ['a'], message: message('hidden', 'assistant', { content_type: 'text', parts: ['internal'] }, { metadata: { is_visually_hidden_from_conversation: true } }) },
      a: { id: 'a', parent: 'hidden', children: [], message: message('a', 'assistant', { content_type: 'text', parts: ['A cat.'] }, { recipient: 'all' }) },
    },
  } as unknown as Parameters<typeof parseConversation>[0])

  it('drops tool calls, reasoning and hidden messages', () => {
    expect(parsed.messages.map(m => m.content)).toEqual(['[image]\nwhat is this', 'A cat.'])
  })

  it('shows pasted images as a placeholder, not [object Object]', () => {
    expect(parsed.messages[0].content).not.toContain('[object Object]')
  })
})
