import { describe, it, expect } from 'vitest'
import { getHighlightSummary, getHighlightType, highlightChat } from './highlighter'
import { chat, message } from './fixtures'

describe('getHighlightType (display badge)', () => {
  it('keeps its single-label priority order', () => {
    expect(getHighlightType(message('user', 'Can you review this?')).type).toBe('code-review')
    expect(getHighlightType(message('user', 'I get an error here')).type).toBe('error')
    expect(getHighlightType(message('user', 'Why does this work?')).type).toBe('question')
    expect(getHighlightType(message('user', 'x'.repeat(600))).type).toBe('long-context')
    expect(getHighlightType(message('user', 'make it blue')).type).toBe('short-prompt')
  })

  it('never labels assistant messages', () => {
    expect(getHighlightType(message('assistant', 'That error means...')).type).toBe(null)
  })
})

describe('getHighlightSummary (scoring counts)', () => {
  it('counts overlapping signals independently', () => {
    // One message, three signals. The summary used to count only the badge, so
    // this message contributed to codeReviews alone.
    const overlapping = chat(message('user', 'Can you review why this throws an error?'))
    const summary = getHighlightSummary(highlightChat(overlapping))
    expect(summary.codeReviews).toBe(1)
    expect(summary.errors).toBe(1)
    expect(summary.questions).toBe(1)
  })

  it('credits detailed context even when the message also reports an error', () => {
    // This is the regression that quietly cost students their Problem
    // Articulation bonus: long-context was checked after error, so a long,
    // well-specified debugging message counted zero long contexts.
    const detailed = chat(
      message('user', 'x'.repeat(600) + ' and I am getting an error on load')
    )
    const summary = getHighlightSummary(highlightChat(detailed))
    expect(summary.longContexts).toBe(1)
    expect(summary.errors).toBe(1)
  })

  it('counts a question that also mentions a bug as a question', () => {
    const both = chat(message('user', 'Why does this bug only appear on mobile?'))
    expect(getHighlightSummary(highlightChat(both)).questions).toBe(1)
  })

  it('ignores assistant messages entirely', () => {
    const assistantHeavy = chat(
      message('assistant', 'That error means the path is wrong. Any suggestions? Why?'),
      message('assistant', 'x'.repeat(600)),
    )
    expect(getHighlightSummary(highlightChat(assistantHeavy))).toEqual({
      questions: 0,
      errors: 0,
      shortPrompts: 0,
      codeReviews: 0,
      longContexts: 0,
    })
  })

  it('falls back to recomputing signals for messages built without them', () => {
    // Submissions stored before signals existed must still summarise correctly.
    const legacy = [
      { ...message('user', 'Why does this fail?'), highlightType: 'error' as const },
    ]
    expect(getHighlightSummary(legacy as never).questions).toBe(1)
  })
})
