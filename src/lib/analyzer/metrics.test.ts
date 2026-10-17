import { describe, it, expect } from 'vitest'
import { computeMetrics, computeAggregateMetrics } from './metrics'
import { chat, message } from './fixtures'

describe('iterationCount', () => {
  it('counts every follow-up turn, not just one per conversation', () => {
    // A five-exchange refinement previously scored 1, because the implementation
    // latched after the first follow-up and never re-armed.
    const refining = chat(
      message('user', 'I need a responsive card for a product listing page'),
      message('assistant', 'Use CSS grid with auto-fit'),
      message('user', 'What is the difference between auto-fit and auto-fill?'),
      message('assistant', 'auto-fill keeps empty columns'),
      message('user', 'Can you show the HTML for that?'),
      message('assistant', 'here you go'),
      message('user', 'The image is not loading, I get an error'),
      message('assistant', 'use a placeholder'),
    )
    expect(computeMetrics(refining).iterationCount).toBe(3)
  })

  it('does not count bare acknowledgments as refinement', () => {
    const lazy = chat(
      message('user', 'Write me a card component with hover states and a price'),
      message('assistant', 'here you go'),
      message('user', 'thanks!'),
    )
    expect(computeMetrics(lazy).iterationCount).toBe(0)
  })

  it('is zero for a one-shot prompt', () => {
    const oneShot = chat(
      message('user', 'Write me a card component'),
      message('assistant', 'here you go'),
    )
    expect(computeMetrics(oneShot).iterationCount).toBe(0)
  })
})

describe('errorMentions', () => {
  it('counts student messages only', () => {
    // One debugging exchange is one signal. Counting the assistant's reply too
    // reported "2 error discussions" for a single student problem.
    const debugging = chat(
      message('user', 'I am getting an error, the image will not load'),
      message('assistant', 'That error means the path is wrong. Try a placeholder.'),
    )
    expect(computeMetrics(debugging).errorMentions).toBe(1)
  })

  it('does not count ordinary code talk as debugging', () => {
    const clean = chat(
      message('user', 'Should the price default to null or undefined?'),
      message('assistant', 'Prefer undefined here'),
    )
    expect(computeMetrics(clean).errorMentions).toBe(0)
  })
})

describe('averagePromptLength', () => {
  it("measures the student's own words, not code they pasted", () => {
    const page = Array.from({ length: 40 }, (_, i) => `<p class="row-${i}">Row ${i}</p>`).join('\n')
    const metrics = computeMetrics(chat(
      message('user', `what needs to change here\n${page}`),
      message('assistant', 'Close the div.'),
    ))
    expect(metrics.averagePromptLength).toBe('what needs to change here'.length)
    expect(metrics.longPromptCount).toBe(0)
  })
})

describe('shortPromptCount', () => {
  it('counts terse instructions, not questions or acknowledgments', () => {
    const metrics = computeMetrics(chat(
      message('user', 'more dramatic'),
      message('assistant', 'Sure.'),
      message('user', 'does css apply to all pages automatically'),
      message('assistant', 'Yes.'),
      message('user', 'thanks'),
    ))
    expect(metrics.shortPromptCount).toBe(1)
  })
})

describe('computeAggregateMetrics', () => {
  it('weights average prompt length by message count, not by chat', () => {
    // Mean-of-means: one long prompt in a one-message chat used to count as much
    // as nine short prompts in another chat.
    const short = chat(...Array.from({ length: 9 }, () => message('user', 'x'.repeat(10))))
    const long = chat(message('user', 'y'.repeat(910)))

    const aggregate = computeAggregateMetrics([short, long])
    // (9 * 10 + 910) / 10 = 100
    expect(aggregate.averagePromptLength).toBe(100)
    // The mean of the two per-chat averages would have been (10 + 910) / 2 = 460.
    expect(aggregate.averagePromptLength).not.toBe(460)
  })

  it('sums counts across chats', () => {
    const one = chat(message('user', 'Why does this fail?'), message('assistant', 'because'))
    const two = chat(message('user', 'How do I fix the grid?'), message('assistant', 'like this'))
    const aggregate = computeAggregateMetrics([one, two])
    expect(aggregate.totalMessages).toBe(4)
    expect(aggregate.userMessages).toBe(2)
    expect(aggregate.questionCount).toBe(2)
  })

  it('returns zeros rather than NaN for no chats', () => {
    const empty = computeAggregateMetrics([])
    expect(Number.isNaN(empty.averagePromptLength)).toBe(false)
    expect(empty.averagePromptLength).toBe(0)
    expect(empty.totalMessages).toBe(0)
  })

  it('agrees with computeMetrics for a single chat', () => {
    const single = chat(
      message('user', 'Why does the hover transition stutter?'),
      message('assistant', 'add will-change'),
    )
    expect(computeAggregateMetrics([single])).toEqual(computeMetrics(single))
  })
})
